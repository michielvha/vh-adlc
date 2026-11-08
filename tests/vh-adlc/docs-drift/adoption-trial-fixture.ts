/** Owned synthetic adoption sources and explicitly test-only receipt metadata. */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { computeComponentIdentity } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { TRIAL_CONTEXT_PATH } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-context";
import { portableRecord, type AdoptionSourceFixture } from "./adoption-fixture";
import { commitAll, git, put } from "./repository-fixture";
import { syntheticTrialFixture } from "./trial-fixture";

export function trialAdoptionFixture(roots: string[]) {
  const f = syntheticTrialFixture(roots);
  const component = computeComponentIdentity(join(f.root, "component-source"), f.manifest.component.source_commit);
  const configured = { ...f.settings, component_pin: ".vh-adlc/docs-drift-components/synthetic.yaml",
    publication: { ...f.settings.publication, mode: "adopted" }, reports: { ...f.settings.reports, workflow_id: 19 } };
  put(f.source, configured.component_pin, canonicalJSON({ schema_version: 1, source_repository: "fixture/shared",
    source_commit: component.source_commit, source_release: "v1.0.0", plugin_version: component.plugin_version,
    component_sha256: component.component_sha256 }).toString());
  put(f.source, ".vh-adlc/docs-drift.yaml", canonicalJSON(configured).toString());
  const candidate = commitAll(f.source);
  git(f.source, "push", "origin", candidate + ":refs/heads/main");
  const store = createOwnedObjectStore({ source_repo: f.source, source_commit: candidate, parent: join(f.root, "objects"),
    evidence_directory: join(f.root, "evidence"), repository: "fixture/docs", owner: "synthetic-adoption", run: f.manifest.fixture_id });
  f.manifest.source_commit = candidate;
  f.manifest.object_store = { ...store, root: relative(f.root, store.root), record_path: relative(f.root, store.record_path) };
  f.manifest.origin_initial_refs = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)").split("\n").map(row => row.split(" "));
  f.manifest.launcher.sha256 = sha256(readFileSync(join(f.source, configured.runtime_loader.launcher)));
  put(f.source, TRIAL_CONTEXT_PATH, canonicalJSON(f.manifest).toString());
  const contextCommit = commitAll(f.source);
  const source: AdoptionSourceFixture = { repo: f.source, configured, candidate };
  const record = portableRecord(source);
  for (const receipt of Object.values(record.receipts)) Object.assign(receipt, { evidence_kind: "test-only", fixture_id: f.manifest.fixture_id });
  const testRecord = { ...record, fixture_id: f.manifest.fixture_id };
  return { ...f, store, settings: configured, sourceCommit: candidate, contextCommit, candidate, configured, record: testRecord,
    boundary: { root: f.root, context_commit: contextCommit, runtime_directory: f.runtime } };
}

export function trialAdoptionDelivery(f: ReturnType<typeof trialAdoptionFixture>, record: unknown = f.record) {
  git(f.source, "switch", "--detach", f.candidate);
  put(f.source, f.configured.publication.adoption_record, canonicalJSON(record).toString());
  const delivered = commitAll(f.source);
  git(f.source, "switch", "main");
  return delivered;
}
