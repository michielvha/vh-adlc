import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { populateRepository, put } from "./repository-fixture";
import { publicationFixture } from "./publication-fixture";
import { installedSettingsFixture } from "./settings-fixture";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { computeComponentIdentity } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { CORE_PREFLIGHT_CHECKS, normalizedConfigurationDigest, nativeEntryDigest, preflightReviewTarget } from "../../../plugins/vh-adlc/scripts/docs-drift/preflight";
import type { PublisherAccount } from "../../../plugins/vh-adlc/scripts/docs-drift/identity";

const proof = "1".repeat(64);
type ConfiguredFixture = Omit<ReturnType<typeof installedSettingsFixture>, "reports"> & {
  reports: Omit<ReturnType<typeof installedSettingsFixture>["reports"], "workflow_id"> & { workflow_id: number };
};
export function commit(repo: string, message: string) {
  readGit(repo, "add", "--all");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", message);
  return readGit(repo, "rev-parse", "HEAD").toString().trim();
}
export function preflightFixture(roots: string[], fault = "none", runtime?: { component: ReturnType<typeof computeComponentIdentity>; executable: string;
  publishers?: Record<string, PublisherAccount>; models?: { worker: string; reviewer: string } },
  configure?: (repo: string, settings: ConfiguredFixture) => void) {
  const f = publicationFixture(roots);
  const scanner = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8")
    .replace("__FIXTURE_CASE__", JSON.stringify("none")).replace("__FIXTURE_ENDPOINT__", JSON.stringify("http://127.0.0.1:1"));
  populateRepository(f.repo, false, scanner);
  put(f.repo, "tests/docs/fixture.test.ts", 'import { expect, test } from "bun:test"; test("guide exists", () => expect(require("node:fs").existsSync("docs/guide.md")).toBe(true));\n');
  const baseSettings = installedSettingsFixture(), configured = { ...baseSettings, reports: { ...baseSettings.reports, workflow_id: 100 } }, path = configured.publication.checklist_path;
  if (runtime) {
    configured.component = { plugin_version: runtime.component.plugin_version, source_commit: runtime.component.source_commit, component_sha256: runtime.component.component_sha256 };
    configured.clients.copilot.executable = runtime.executable;
  }
  for (const entry of Object.values(configured.execution.entries)) for (const role of [entry.worker, entry.reviewer]) {
    role.model = "claude-opus-5.5";
    Object.assign(role, { identity_source: { provider: "copilot", event_type: "assistant.message", field_path: ["data", "model"] } });
  }
  configure?.(f.repo, configured);
  const write = (path: string, bytes: Uint8Array) => { mkdirSync(dirname(join(f.repo, path)), { recursive: true }); writeFileSync(join(f.repo, path), bytes); };
  const before = canonicalJSON(configured), afterSettings = { ...configured, publication: { ...configured.publication, mode: "adopted" } };
  const after = canonicalJSON(afterSettings);
  write(".vh-adlc/docs-drift.yaml", before); write("scripts/entry.txt", Buffer.from("legacy\n"));
  const candidate = commit(f.repo, "Synthetic staged candidate C"), settings = parseSettings(configured), component = configured.component;
  const activation = [{ path: ".vh-adlc/docs-drift.yaml", before: { mode: "100644" as const, sha256: sha256(before) }, after: { mode: "100644" as const, sha256: sha256(after) } },
    { path: "scripts/entry.txt", before: { mode: "100644" as const, sha256: sha256(Buffer.from("legacy\n")) }, after: { mode: "100644" as const, sha256: sha256(Buffer.from("shared\n")) } }];
  const base = { repository: settings.repository, candidate_commit: candidate, component,
    configuration_sha256: normalizedConfigurationDigest(settings), activation };
  const checklist = { schema_version: 1, kind: "docs-drift-preflight", ...base, changes: ["initial"],
    review: { target_sha256: preflightReviewTarget(base), evidence_sha256: proof, model: "claude-opus-5.5" },
    checks: CORE_PREFLIGHT_CHECKS.map(name => ({ name, status: "passed", component, consumer_commit: candidate, evidence_sha256: proof,
      target_sha256: preflightReviewTarget(base), note: "Synthetic applicability check. Original native observations retain their own targets." })),
    native_entries: Object.fromEntries(Object.entries(settings.execution.entries).map(([entry]) => [entry, {
      entry_sha256: nativeEntryDigest(settings, entry), worker_model: runtime?.models?.worker ?? "claude-opus-5.5",
      reviewer_model: runtime?.models?.reviewer ?? "claude-opus-5.5",
      repository_id: 10, publisher: runtime?.publishers?.[entry]
        ?? { actor: entry === "hosted" ? "fixture-bot" : "fixture-owner", actor_id: entry === "hosted" ? 20 : 30 },
      component, consumer_commit: candidate, evidence_sha256: proof,
    }])), pending_operations: [] };
  if (fault === "missing-check") checklist.checks.pop();
  if (fault === "wrong-component") checklist.component = { ...component, component_sha256: "f".repeat(64) };
  if (fault === "wrong-review") checklist.review.target_sha256 = "f".repeat(64);
  if (fault === "unknown-change") checklist.changes = ["unclassified"];
  if (fault === "missing-entry") delete checklist.native_entries.interactive;
  if (fault === "changed-entry") checklist.native_entries.interactive.entry_sha256 = "f".repeat(64);
  if (fault === "forged-original-entry") checklist.native_entries.interactive.consumer_commit = f.plan.manifest.bindings.source_commit;
  if (fault === "intervening") { write("unrelated.txt", Buffer.from("Intervening commit\n")); commit(f.repo, "Intervening before activation"); }
  write(path, canonicalJSON(checklist)); write(".vh-adlc/docs-drift.yaml", after); write("scripts/entry.txt", Buffer.from("shared\n"));
  if (fault === "extra-change") write("unapproved.txt", Buffer.from("Unexpected activation change\n"));
  const activationCommit = commit(f.repo, "Synthetic reviewed activation D");
  if (fault === "later-policy") { write(".vh-adlc/docs-drift.yaml", canonicalJSON({ ...afterSettings, roots: ["other-docs"] })); commit(f.repo, "Unreviewed policy change"); }
  if (fault === "later-activation") { write("scripts/entry.txt", Buffer.from("unreviewed\n")); commit(f.repo, "Unreviewed activation file"); }
  return { ...f, candidate, activationCommit, checklist, component, afterSettings, head: () => readGit(f.repo, "rev-parse", "HEAD").toString().trim(), write };
}

export function ordinaryComponentFixture(roots: string[], full = false) {
  const root = mkdtempSync(join(tmpdir(), "vh-flat-native-")); roots.push(root);
  const directory = join(root, "plugins/vh-adlc"), executable = join(root, "client"), calls = join(root, "calls");
  mkdirSync(join(directory, ".claude-plugin"), { recursive: true });
  if (full) cpSync(join(import.meta.dir, "../../../plugins/vh-adlc"), directory, { recursive: true });
  else writeFileSync(join(directory, ".claude-plugin/plugin.json"), JSON.stringify({ name: "vh-adlc", version: "0.25.0" }));
  readGit(root, "init", "--template=", "-b", "main");
  const identity = computeComponentIdentity(root, commit(root, "Synthetic installed component"));
  const flags = "--plugin-dir --model --session-id --output-format --available-tools --no-custom-instructions --disable-builtin-mcps";
  writeFileSync(executable, "#!/bin/sh\nprintf '%s\\n' \"$*\" >> 'CALLS'\nif [ \"$1\" = '--no-auto-update' ]; then shift; fi\nif [ \"$1\" = '--version' ]; then echo 'GitHub Copilot CLI 1.0.112.'; else echo 'FLAGS'; fi\n".replace("CALLS", calls).replace("FLAGS", flags), { mode: 0o755 });
  return { root, directory, executable, calls, identity };
}
