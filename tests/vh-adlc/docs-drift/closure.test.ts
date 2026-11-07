import { afterEach, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { collectResolutionInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve-inputs";
import { join } from "node:path";
import { collectClosureInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-inputs";
import { prepareClosure, type ClosureVerificationScope } from "../../../plugins/vh-adlc/scripts/docs-drift/closure";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { canonicalDigest, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { closureFixture } from "./closure-fixture";
import { commitAll, git, put } from "./repository-fixture";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function options(f: Awaited<ReturnType<typeof closureFixture>>) {
  return { collection: f.collection, inputs: collectClosureInputs(f.collection), operation_id: "closure-one",
    observe_verification: async (scope: ClosureVerificationScope) => {
      const actual = readGit(f.collection.store.root, "show", scope.source_commit + ":src/app.ts");
      return { inputs_sha256: scope.inputs_sha256, state: actual.includes("value = 1") ? "passed" : "failed",
        artifact_sha256: sha256(actual), method: "synthetic current-source assertion", asset_checks: [] };
    } };
}

for (const method of ["merge", "squash", "rebase"] as const) {
  test(`${method} closure proposes one fresh explanation before each close without writing`, async () => {
    const f = await closureFixture(roots, method, true), before = canonicalDigest(captureRepositoryState(f.repo));
    const result = await prepareClosure(options(f));
    expect(result.diagnostics).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.effects.map(effect => effect.kind)).toEqual(["lease-acquire", "receipt-retain", "comment-create", "pr-close", "lease-release"]);
    expect(result.effects[2].payload.body).toContain("https://github.com/fixture/docs/pull/20");
    expect(result.effects[2].payload.body).toContain(f.state.current);
    expect(result.effects[2].payload.body).toContain(f.recordValue.dispositions[0].hunk_id);
    expect(result.effects[3].payload.expected_head).toBe(f.recordValue.originals[0].head_sha);
    expect(result.verification).toHaveLength(f.recordValue.dispositions.length);
    expect(canonicalDigest(captureRepositoryState(f.repo))).toBe(before);
  });

  test(`${method} delivery with an intervening bound change requires actual current verification`, async () => {
    const f = await closureFixture(roots, method, "bound");
    const selected = options(f);
    expect(selected.inputs.complete).toBe(true);
    expect(selected.inputs.interval?.material_paths).toContain("src/app.ts");
    const result = await prepareClosure(selected);
    expect(result.complete).toBe(false);
    expect(result.effects).toEqual([]);
  });
}

test("verification from another input scope and stale collection cannot propose any action", async () => {
  const f = await closureFixture(roots), selected = options(f);
  const observe_verification = async () => ({ state: "passed", inputs_sha256: "e".repeat(64), artifact_sha256: "a".repeat(64), method: "wrong scope", asset_checks: [] });
  expect((await prepareClosure({ ...selected, observe_verification })).complete).toBe(false);
  f.consolidation.body += "\nChanged after collection";
  const stale = await prepareClosure(selected);
  expect(stale.complete).toBe(false);
  expect(stale.effects).toEqual([]);
});

test("current source changing during verification leaves every proposed action unready", async () => {
  const f = await closureFixture(roots), selected = options(f), observe = selected.observe_verification;
  const observe_verification = async (scope: ClosureVerificationScope) => {
    const result = await observe(scope);
    put(f.repo, "src/app.ts", "export const value = 2;\n");
    f.state.current = commitAll(f.repo);
    git(f.collection.store.root, "fetch", "--no-write-fetch-head", f.repo, f.state.current);
    return result;
  };
  const result = await prepareClosure({ ...selected, observe_verification });
  expect(result.complete).toBe(false);
  expect(result.effects).toEqual([]);
});

test("already closed originals produce no new metadata refs or comments", async () => {
  const f = await closureFixture(roots), original = f.proposals.get(1);
  if (!original) throw Error("missing original fixture");
  original.state = "closed";
  const result = await prepareClosure(options(f));
  expect(result.complete).toBe(true);
  expect(result.already_closed).toEqual([1]);
  expect(result.effects).toEqual([]);
});


test("record-only resolutions still need current verification and a complete comment baseline", async () => {
  const f = await closureFixture(roots, "squash", false, original => ({ ...original.options,
    decisions: [{ ...original.decision, disposition: "already-fixed", edit_ids: [] }], edits: [] }));
  expect(f.recordValue.changed_paths).toEqual([]);
  f.comments.set(1, [{ id: 100, body: "Earlier note", actor: "someone", actor_id: 99 }]);
  const result = await prepareClosure(options(f));
  expect(result.complete).toBe(true);
  expect(result.effects[2].payload.prior_ids).toEqual([100]);
  f.state.comments_complete = false;
  const incomplete = await prepareClosure(options(f));
  expect(incomplete.complete).toBe(false);
  expect(incomplete.effects).toEqual([]);
});


test("an explicitly carried decision must remain present in the fresh full consolidation body", async () => {
  const f = await closureFixture(roots, "merge", false, original => {
    const text = "Verify the deployment-only claim on its owning host";
    return { ...original.options, decisions: [{ ...original.decision, disposition: "defer", edit_ids: [], carry: text }], edits: [],
      carry_decisions: [{ proposal: 1, hunk_id: original.decision.hunk_id, text,
        request_sha256: "a".repeat(64), inputs_sha256: original.inputs.inputs_sha256 }] };
  });
  expect((await prepareClosure(options(f))).complete).toBe(true);
  f.consolidation.body = "Replacement text without the recorded deferral";
  const missing = await prepareClosure(options(f));
  expect(missing.complete).toBe(false);
  expect(missing.effects).toEqual([]);
});


test("wrong interpretations need their delivered feedback checked against actual current source", async () => {
  const f = await closureFixture(roots, "merge", false, original => ({ ...original.options,
    decisions: [{ ...original.decision, disposition: "wrong", edit_ids: [], feedback: {
      cause: "interpretation", channel: "correction-history", action: "existing", path: "docs/corrections.yaml", edit_id: null,
      finding_id: null, detector_id: null, document: "docs/guide.md", policy_quote: original.quote("docs/docs-procedure.md"),
      delivery_quote: original.quote("docs/corrections.yaml") } }], edits: [] }));
  const selected = options(f), observe = selected.observe_verification;
  const observe_verification = async (scope: ClosureVerificationScope) => {
    const result = await observe(scope);
    const feedback = readGit(f.collection.store.root, "show", scope.source_commit + ":docs/corrections.yaml");
    return { ...result, state: feedback.includes("interpret-1") ? "passed" : "failed", artifact_sha256: sha256(feedback) };
  };
  expect((await prepareClosure({ ...selected, observe_verification })).complete).toBe(true);
  put(f.repo, "docs/corrections.yaml", "corrections: []\n");
  f.state.current = commitAll(f.repo);
  git(f.collection.store.root, "fetch", "--no-write-fetch-head", f.repo, f.state.current);
  const missing = await prepareClosure({ ...options(f), observe_verification });
  expect(missing.complete).toBe(false);
  expect(missing.effects).toEqual([]);
});


test("binary closure requires a concrete current asset check rather than a passed flag alone", async () => {
  const bytes = Buffer.from([0, 255, 1]);
  const f = await closureFixture(roots, "merge", false, original => {
    git(original.repo, "switch", "-q", "docs-drift/one");
    writeFileSync(join(original.repo, "docs/asset.bin"), bytes);
    const head = commitAll(original.repo);
    git(original.repo, "switch", "-q", "main");
    git(original.collection.store.root, "fetch", "--no-write-fetch-head", original.repo, head);
    const proposal = original.proposals.get(1);
    if (!proposal) throw Error("missing original fixture");
    proposal.head_sha = head;
    const inputs = collectResolutionInputs(original.collection);
    const asset = { id: "asset", path: "docs/asset.bin", action: "create", start: 0, end: 0, before_sha256: null,
      replacement_base64: bytes.toString("base64"), after_mode: "100644" };
    return { ...original.options, inputs,
      decisions: inputs.proposals[0].hunks.map(hunk => ({ ...original.decision, hunk_id: hunk.id,
        edit_ids: [hunk.path === asset.path ? asset.id : original.edit.id] })), edits: [original.edit, asset],
      observe_verification: async scope => ({ inputs_sha256: scope.inputs_sha256, state: "passed", artifact_sha256: sha256(bytes),
        method: "synthetic proposed asset validation", asset_checks: [sha256(bytes)] }) };
  });
  const selected = options(f);
  const missing = await prepareClosure(selected);
  expect(missing.complete).toBe(false);
  expect(missing.effects).toEqual([]);
  const observe = selected.observe_verification;
  const observe_verification = async (scope: ClosureVerificationScope) => {
    const result = await observe(scope);
    const actual = readGit(f.collection.store.root, "show", scope.source_commit + ":docs/asset.bin");
    return { ...result, state: actual.equals(bytes) ? "passed" : "failed", artifact_sha256: sha256(actual), asset_checks: [sha256(actual)] };
  };
  expect((await prepareClosure({ ...selected, observe_verification })).complete).toBe(true);
});


test("an unmerged replacement and a replaced original binding cannot prepare closures", async () => {
  const f = await closureFixture(roots);
  f.consolidation.merged = false;
  expect((await prepareClosure(options(f))).complete).toBe(false);
  f.consolidation.merged = true;
  const original = f.proposals.get(1);
  if (!original) throw Error("missing original fixture");
  original.body += "Changed original scope";
  const result = await prepareClosure(options(f));
  expect(result.complete).toBe(false);
  expect(result.effects).toEqual([]);
});
