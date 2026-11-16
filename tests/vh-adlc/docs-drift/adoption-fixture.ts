/** Synthetic consumer and observed-shaped attestation fixtures. No native acceptance is claimed. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationFixture } from "./publication-fixture";
import type { IdentitySource } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { settingsFixture } from "./settings-fixture";
import { hash } from "./manifest-fixture";
import type { EntryIdentities } from "../../../plugins/vh-adlc/scripts/docs-drift/identity";

export const pin = () => ({ schema_version: 1 as const, source_repository: "fixture/shared", source_commit: "a".repeat(40),
  source_release: "v1.0.0", plugin_version: "0.11.0", component_sha256: hash("fixture component") });
export function write(repo: string, path: string, bytes: string | Uint8Array) {
  const file = join(repo, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes);
}
export function commit(repo: string, message: string) {
  readGit(repo, "add", "--", ".");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", message);
  return readGit(repo, "rev-parse", "HEAD").toString().trim();
}
export function source(roots: string[], options: { entry_identities?: EntryIdentities; pin?: ReturnType<typeof pin>; client?: ReturnType<typeof settingsFixture>["clients"]["copilot-linux"]; hostname?: string; bounded?: boolean; legacy_ids?: number[]; role?: { model: string; identity_source: IdentitySource | null; native_model?: string; argv?: string[] } } = {}) {
  const f = publicationFixture(roots), settings = { ...settingsFixture(),
    ...(options.bounded ? { verification_commands: [], generation_commands: [], read_set: { source_roots: ["src"], reference_roots: ["references"] } } : {}),
    component_pin: ".vh-adlc/docs-drift-components/shared.yaml", publication: { ...settingsFixture().publication, mode: "adopted",
      ...(options.entry_identities ? { entry_actors: { hosted: options.entry_identities.hosted.actor,
        copilot: options.entry_identities.copilot.actor, claude: options.entry_identities.claude.actor } } : {}) },
    reports: { ...settingsFixture().reports, workflow_id: 19 },
    legacy_proposals: { ...settingsFixture().legacy_proposals, ids: options.legacy_ids ?? [] } };
  if (options.entry_identities)
    settings.pr_discovery.authors = [...new Set([...settings.pr_discovery.authors, ...Object.values(options.entry_identities).map(account => account.actor)])];
  if (options.client) {
    settings.clients["copilot-linux"] = options.client;
    settings.runtime_loader.provider = options.client.provider;
    if (options.client.provider === "claude") settings.runtime_loader.credential_references = ["CLAUDE_CODE_OAUTH_TOKEN"];
  }
  if (options.hostname) settings.hostname = options.hostname;
  const selectedRole = options.role ?? { model: "fixture-model-1", identity_source: {
    provider: "copilot", event_type: "assistant.message", field_path: ["data", "model"] } };
  for (const entry of Object.values(settings.execution.entries)) {
    const { model, identity_source } = selectedRole;
    const argv = options.role?.argv ? { argv: options.role.argv } : {};
    Object.assign(entry.worker, { model, identity_source, ...argv }); Object.assign(entry.reviewer, { model, identity_source, ...argv });
  }
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings));
  write(f.repo, settings.component_pin, canonicalJSON(options.pin ?? pin()));
  for (const path of [settings.project_procedure, settings.execution.worker_workflow, settings.execution.scheduled_workflow,
    settings.execution.claude_command, settings.runtime_loader.launcher]) write(f.repo, path, "Synthetic protected input " + path + "\n");
  write(f.repo, settings.scanner.script, "Synthetic ordinary detector implementation\n");
  write(f.repo, "docs/guide.md", "Synthetic ordinary document\n");
  return { ...f, configured: settings, candidate: commit(f.repo, "synthetic adopted source candidate"), native_model: options.role?.native_model,
    ...(options.entry_identities ? { entry_identities: structuredClone(options.entry_identities) } : {}) };
}

export const runtimeIdentity = { repository: "fixture/docs", repository_id: 10, actor: "fixture-bot", actor_id: 20, default_branch: "main" };
