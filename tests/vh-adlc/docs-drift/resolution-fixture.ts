import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PullRequestInput } from "../../../plugins/vh-adlc/scripts/github-read";
import { collectResolutionInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve-inputs";
import { captureSnapshot, createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { settingsFixture } from "./settings-fixture";
import { commitAll, git, populateRepository, put } from "./repository-fixture";

export function resolutionFixture(roots: string[], adoptedRepo?: string) {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "vh-resolve-")));
  roots.push(root);
  const repo = adoptedRepo ?? join(root, "source"), artifacts = join(root, "artifacts");
  if (!adoptedRepo) { mkdirSync(repo); populateRepository(repo); }
  else { git(repo, "switch", "-q", "--detach", "HEAD"); git(repo, "branch", "-f", "main", "HEAD"); git(repo, "switch", "-q", "main"); }
  mkdirSync(artifacts, { mode: 0o700 });
  const settings = adoptedRepo ? JSON.parse(readFileSync(join(repo, ".vh-adlc/docs-drift.yaml"), "utf8")) as ReturnType<typeof settingsFixture> : settingsFixture();
  if (adoptedRepo) { put(repo, "src/app.ts", "export const value = 1;\n"); put(repo, "docs/suppressions.yaml", "suppressions: []\n"); }
  if (!settings.feedback_files.includes("docs/corrections.yaml")) {
    settings.feedback_files.push("docs/corrections.yaml");
    put(repo, ".vh-adlc/docs-drift.yaml", JSON.stringify(settings) + "\n");
  }
  put(repo, "docs/guide.md", "# Guide\nOld claim\n");
  put(repo, "docs/corrections.yaml", "corrections:\n  - id: interpret-1\n    note: Keep the declared contract when the earlier interpretation was wrong.\n");
  if (!adoptedRepo) put(repo, "docs/docs-procedure.md", "# Project procedure\nDetector errors use docs/suppressions.yaml. Interpretation errors use docs/corrections.yaml.\n");
  const base = commitAll(repo);
  git(repo, "switch", "-qc", "docs-drift/one");
  put(repo, "docs/guide.md", "# Guide\nCorrect claim\n");
  const head = commitAll(repo);
  git(repo, "switch", "-q", "main");
  const snapshot = captureSnapshot(repo, base);
  const store = createOwnedObjectStore({ parent: artifacts, evidence_directory: artifacts, source_repo: repo,
    source_commit: base, repository: "fixture/docs", owner: "fixture", run: "resolve" });
  git(store.root, "fetch", "--no-write-fetch-head", repo, head);
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const proposal: PullRequestInput = { number: 1, state: "open", merged_at: null, body: "Original proposal", draft: true,
    actor: "fixture-bot", actor_id: 20, actor_type: "Bot", head_sha: head, head_ref: "docs-drift/one", head_repository: repository,
    base_sha: base, base_ref: "main", base_repository: repository };
  const proposals = new Map([[1, proposal]]);
  const reader = { repository: () => repository, pull: (number: number) => {
    const value = proposals.get(number); if (!value) throw Error("missing selected proposal"); return structuredClone(value);
  }, trace: () => [] };
  const collection = { snapshot, store, reader, selected: [1] };
  const inputs = collectResolutionInputs(collection);
  const quote = (path: string) => {
    const blob = snapshot.blobs.find(blob => blob.path === path);
    if (!blob) throw Error("missing quote fixture");
    return { path, sha256: sha256(blob.bytes), start: 0, end: blob.bytes.length, quote_sha256: sha256(blob.bytes) };
  };
  const document = snapshot.blobs.find(blob => blob.path === "docs/guide.md");
  if (!document) throw Error("missing source fixture");
  const edit = { id: "correction", path: document.path, action: "replace", start: 8, end: document.bytes.length,
    before_sha256: sha256(document.bytes), replacement_base64: Buffer.from("Correct claim\n").toString("base64"), after_mode: "100644" };
  const decision = { proposal: 1, hunk_id: inputs.proposals[0].hunks[0].id, disposition: "apply", reason: "Verified against the current source",
    evidence: [quote("src/app.ts")], edit_ids: [edit.id], feedback: null, carry: null };
  const scan = { complete: true, diagnostics: [], documents: [], detectors: [], findings: [], suppressed_findings: [], stale_suppressions: [] };
  const verification = async (scope: { inputs_sha256: string }) => ({ inputs_sha256: scope.inputs_sha256,
    state: "passed", artifact_sha256: sha256(Buffer.from("synthetic verification")), method: "synthetic-source-check", asset_checks: [] });
  const options = { collection, inputs, scan, resolution_id: "resolution-one", decisions: [decision], edits: [edit],
    carry_decisions: [], observe_verification: verification };
  return { repo, snapshot, collection, inputs, options, proposals, decision, edit, quote };
}
