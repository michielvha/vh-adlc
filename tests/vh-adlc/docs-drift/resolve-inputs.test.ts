import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PullRequestInput, RepositoryReader } from "../../../plugins/vh-adlc/scripts/github-read";
import { collectResolutionInputs, recheckResolutionInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve-inputs";
import { captureRepositoryState, captureSnapshot, createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { canonicalDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { commitAll, git, populateRepository, put } from "./repository-fixture";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function setup(change?: (repo: string) => void) {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "vh-resolution-")));
  roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts");
  mkdirSync(repo); mkdirSync(artifacts, { mode: 0o700 });
  populateRepository(repo);
  put(repo, "docs/guide.md", Array.from({ length: 20 }, (_, index) => `Line ${index + 1}\n`).join(""));
  const base = commitAll(repo);
  git(repo, "switch", "-qc", "docs-drift/one");
  if (change) change(repo);
  else put(repo, "docs/guide.md", Array.from({ length: 20 }, (_, index) => index === 1 || index === 17 ? `Changed ${index + 1}\n` : `Line ${index + 1}\n`).join(""));
  const head = commitAll(repo);
  git(repo, "switch", "-q", "main");
  const snapshot = captureSnapshot(repo, base);
  const store = createOwnedObjectStore({ parent: artifacts, evidence_directory: artifacts, source_repo: repo, source_commit: base,
    repository: "fixture/docs", owner: "fixture", run: "resolution" });
  git(store.root, "fetch", "--no-write-fetch-head", repo, head);
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const proposal: PullRequestInput = { number: 1, state: "open", merged_at: null, body: "Complete proposal body", draft: true,
    actor: "fixture-bot", actor_id: 20, actor_type: "Bot", head_sha: head, head_ref: "docs-drift/one", head_repository: repository,
    base_sha: base, base_ref: "main", base_repository: repository };
  const proposals = new Map([[1, proposal]]);
  const reader = {
    repository: () => repository,
    pull: (number: number) => { const value = proposals.get(number); if (!value) throw Error("unavailable selected PR"); return structuredClone(value); },
    trace: () => [],
  } satisfies Pick<RepositoryReader, "repository" | "pull" | "trace">;
  return { repo, snapshot, store, reader, proposals, proposal };
}

function collect(f: ReturnType<typeof setup>, selected = [1]) {
  return collectResolutionInputs({ snapshot: f.snapshot, store: f.store, reader: f.reader, selected });
}

test("complete selected full Git diffs enumerate every separated hunk without changing caller state", () => {
  const f = setup(), before = canonicalDigest(captureRepositoryState(f.repo));
  const result = collect(f);
  expect(result.complete).toBe(true);
  expect(result.proposals[0].hunks).toHaveLength(2);
  expect(result.proposals[0].hunks.map(hunk => hunk.path)).toEqual(["docs/guide.md", "docs/guide.md"]);
  expect(result.proposals[0].body_sha256).toHaveLength(64);
  expect(result.proposals[0].diff_sha256).toHaveLength(64);
  expect(result.proposals[0].hunks[0].before_base64).toBe(Buffer.from("Line 2\n").toString("base64"));
  expect(canonicalDigest(captureRepositoryState(f.repo))).toBe(before);
});

test("missing selected proposals retain inspected neighbors but block complete resolution", () => {
  const f = setup(), result = collect(f, [1, 2]);
  expect(result.complete).toBe(false);
  expect(result.proposals.map(proposal => proposal.number)).toEqual([1]);
  expect(result.diagnostics).toHaveLength(1);
});

test("duplicate selection or a foreign native repository cannot pass as complete", () => {
  const f = setup();
  expect(collect(f, [1, 1]).complete).toBe(false);
  const reader = { ...f.reader, repository: () => ({ id: 88, full_name: "other/docs", default_branch: "main" }) };
  expect(collectResolutionInputs({ snapshot: f.snapshot, store: f.store, reader, selected: [1] }).complete).toBe(false);
});

test("every proposal head and complete body is rebound before effects", () => {
  const f = setup(), result = collect(f);
  expect(recheckResolutionInputs(result, { ...f, selected: [1] }).fresh).toBe(true);
  f.proposals.get(1)!.body += "\nChanged later";
  expect(recheckResolutionInputs(result, { ...f, selected: [1] }).fresh).toBe(false);
  f.proposals.set(1, { ...f.proposal, body: "Complete proposal body", head_sha: "e".repeat(40) });
  expect(recheckResolutionInputs(result, { ...f, selected: [1] }).fresh).toBe(false);
});

test("binary additions and literal newline paths are explicit units rather than omitted patches", () => {
  const f = setup(repo => {
    put(repo, "docs/a\nb.md", "New literal path\n");
    writeFileSync(join(repo, "docs/image.bin"), Buffer.from([0, 1, 2, 255]));
  });
  const result = collect(f);
  expect(result.complete).toBe(true);
  expect(result.proposals[0].hunks.some(hunk => hunk.path === "docs/a\nb.md" && hunk.kind === "text")).toBe(true);
  expect(result.proposals[0].hunks.some(hunk => hunk.path === "docs/image.bin" && hunk.kind === "binary")).toBe(true);
  expect(result.proposals[0].files.map(file => file.path)).toEqual(["docs/a\nb.md", "docs/image.bin"]);
});

test("mode-only changes and exact no-final-newline bytes remain accounted for", () => {
  const f = setup(repo => {
    chmodSync(join(repo, "docs/guide.md"), 0o755);
    put(repo, "docs/no-newline.md", "Exact final bytes");
  });
  const result = collect(f);
  expect(result.complete).toBe(true);
  const hunks = result.proposals[0].hunks;
  expect(hunks.some(hunk => hunk.path === "docs/guide.md" && hunk.kind === "metadata")).toBe(true);
  expect(hunks.find(hunk => hunk.path === "docs/no-newline.md" && hunk.kind === "text")?.after_base64)
    .toBe(Buffer.from("Exact final bytes").toString("base64"));
});

test("unavailable full objects cannot masquerade as a zero-correction proposal", () => {
  const f = setup(); f.proposals.get(1)!.head_sha = "e".repeat(40);
  expect(collect(f).complete).toBe(false);
});

test("identical proposed hunks have stable identities across selected PRs", () => {
  const f = setup(); f.proposals.set(2, { ...f.proposal, number: 2 });
  const result = collect(f, [1, 2]);
  expect(result.complete).toBe(true);
  expect(result.proposals[0].hunks.map(hunk => hunk.id)).toEqual(result.proposals[1].hunks.map(hunk => hunk.id));
  expect(result.proposals[0].binding_sha256).not.toBe(result.proposals[1].binding_sha256);
});

test("changing the selected repository default branch invalidates collected proposal inputs", () => {
  const f = setup(), result = collect(f);
  const reader = { ...f.reader, repository: () => ({ ...f.reader.repository(), default_branch: "next" }) };
  expect(recheckResolutionInputs(result, { ...f, reader, selected: [1] }).fresh).toBe(false);
});

test("serialized completeness flags cannot hide omitted hunks from freshness verification", () => {
  const f = setup(), input = structuredClone(collect(f));
  input.proposals[0].hunks = [];
  expect(recheckResolutionInputs(input, { ...f, selected: [1] }).fresh).toBe(false);
});
