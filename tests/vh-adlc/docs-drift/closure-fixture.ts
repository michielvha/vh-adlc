import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildResolution, type ResolutionOptions } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve";
import { resolutionFixture } from "./resolution-fixture";
import { commitAll, git, put } from "./repository-fixture";

export async function closureFixture(roots: string[], method: "merge" | "squash" | "rebase" = "merge", advance: boolean | "bound" = false,
  configure?: (fixture: ReturnType<typeof resolutionFixture>) => ResolutionOptions) {
  const f = resolutionFixture(roots), draft = await buildResolution(configure ? configure(f) : f.options);
  if (!draft.complete || !draft.record_bytes || !draft.record) throw Error("missing resolution fixture");
  const recordBytes = draft.record_bytes, recordValue = draft.record;
  git(f.repo, "switch", "-qc", "docs-drift/consolidation");
  for (const change of draft.changes) {
    if (change.after_base64 === null) rmSync(join(f.repo, change.path));
    else writeFileSync(join(f.repo, change.path), Buffer.from(change.after_base64, "base64"));
  }
  mkdirSync(dirname(join(f.repo, draft.record_path)), { recursive: true });
  writeFileSync(join(f.repo, draft.record_path), draft.record_bytes);
  const head = commitAll(f.repo);
  git(f.repo, "switch", "-q", "main");
  if (advance) {
    if (advance === "bound") put(f.repo, "src/app.ts", "export const value = 2;\n");
    else put(f.repo, "outside.txt", "Disjoint advance\n");
    commitAll(f.repo);
  }
  if (method === "merge") git(f.repo, "merge", "--no-ff", "-m", "Merge consolidation", head);
  else if (method === "squash") { git(f.repo, "merge", "--squash", head); commitAll(f.repo); }
  else git(f.repo, "cherry-pick", head);
  const merged = git(f.repo, "rev-parse", "HEAD");
  git(f.collection.store.root, "fetch", "--no-write-fetch-head", f.repo, merged, head);
  const original = f.proposals.get(1);
  if (!original) throw Error("missing original fixture");
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const consolidation = { ...original, number: 20, state: "closed" as const, merged_at: "2026-11-07T00:00:00Z" as string | null,
    body: "Reviewed consolidation" + draft.record.carried_decisions.map(item => "\n\nDeferred decision\n" + item.text).join(""), merged: true, draft: false, head_sha: head, head_ref: "docs-drift/consolidation", merge_commit_sha: merged };
  const state = { current: merged, comments_complete: true };
  const comments = new Map<number, Array<{ id: number; body: string; actor: string; actor_id: number }>>();
  const reader = { ...f.collection.reader, repository: () => structuredClone(repository),
    mergedPull: (number: number) => { if (number !== 20) throw Error("unselected merge"); return structuredClone(consolidation); },
    ref: (ref: string) => ({ ref, sha: state.current }),
    comments: (number: number) => ({ items: structuredClone(comments.get(number) ?? []), complete: state.comments_complete,
      pages: 1, diagnostics: state.comments_complete ? [] : ["Synthetic incomplete comment collection"] }) };
  const collection = { source_repo: f.repo, store: f.collection.store, settings: f.snapshot.settings, reader,
    consolidation_id: 20, required_inputs: [] };
  return { ...f, draft, recordBytes, recordValue, head, merged, state, comments, consolidation, collection };
}
