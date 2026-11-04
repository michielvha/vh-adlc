import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRun, registeredOutstanding, readRun, retainAbsence, retireRun } from "../../../plugins/vh-adlc/scripts/audit/journal";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { recoverEffect, liveReady } from "../../../plugins/vh-adlc/scripts/audit/recovery";
import { digest, hash } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
import { settingsYAML } from "../settings-yaml";
import { baseSettings, fixture } from "./fixtures";
const made: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of made.splice(0)) f.dispose(); });

function legacyRun(kind: "merge" | "key" = "merge") {
  const f = fixture({ configured: false }); made.push(f);
  const oldBytes = JSON.stringify(baseSettings(), null, 2) + "\n";
  f.write(".vh-adlc/audit.json", oldBytes); f.commit();
  const legacy = join(f.outer, "historical-public-runtime"); mkdirSync(legacy);
  const archive = join(import.meta.dir, "fixtures/legacy-json-runtime.tar.gz");
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "fixtures/legacy-json-runtime.json"), "utf8")) as { archive_sha256: string };
  expect(hash(readFileSync(archive))).toBe(manifest.archive_sha256);
  const unpack = Bun.spawnSync(["tar", "-xzf", archive, "-C", legacy], { stdout: "pipe", stderr: "pipe" }); expect(unpack.exitCode).toBe(0);
  const nativeCalls: unknown[] = [];
  const invoke = (plugin: string, operation: string, args: string[] = []) => {
    const run = Bun.spawnSync([process.execPath, join(plugin, "scripts/audit/cli.ts"), operation, "--repo", f.root, ...args], { stdout: "pipe", stderr: "pipe" });
    nativeCalls.push({ argv: [process.execPath, join(plugin, "scripts/audit/cli.ts"), operation, "--repo", f.root, ...args], exit_code: run.exitCode, stdout: run.stdout.toString(), stderr: run.stderr.toString() });
    expect(run.exitCode).toBe(0); return JSON.parse(run.stdout.toString());
  };
  const old = join(legacy, "plugins/vh-adlc");
  const native = invoke(old, "journal-new", ["--artifact-root", f.artifacts, "--run-id", "old-json-run", "--batch-digest", "a".repeat(64)]);
  const action = { id: "declined-effect", kind, correlation: "owned-effect", target: "owned-target", ...(kind === "key" ? { actor: "actor", organization: "org", cleanup_method: "#cleanup" } : {}) };
  const input = f.artifact("intent.json", JSON.stringify(action));
  invoke(old, "journal-intent", ["--directory", native.directory, "--batch-digest", "a".repeat(64), "--input", join(f.artifacts, input.path)]);
  invoke(old, "journal-handoff", ["--directory", native.directory, "--batch-digest", "a".repeat(64), "--action-id", action.id, "--reason", "execution-not-authorized-or-recovery-only"]);
  const header = readFileSync(join(native.directory, "header.json")); expect(JSON.parse(header.toString()).settings_digest).toBe(hash(oldBytes));
  f.write(".vh-adlc/audit.yaml", settingsYAML(baseSettings())); rmSync(join(f.root, ".vh-adlc/audit.json")); f.commit();
  const archiveRoot = process.env.VH_ADLC_AUDIT_FORMAT_EVIDENCE;
  if (archiveRoot) {
    mkdirSync(archiveRoot, { recursive: true, mode: 0o700 });
    writeFileSync(join(archiveRoot, `${kind}.json`), JSON.stringify({ source: JSON.parse(readFileSync(join(import.meta.dir, "fixtures/legacy-json-runtime.json"), "utf8")),
      nativeCalls, old_settings_sha256: hash(oldBytes), header: JSON.parse(header.toString()), yaml_settings_sha256: hash(readFileSync(join(f.root, ".vh-adlc/audit.yaml"))),
      limitation: "Synthetic metadata-helper format recovery, no product, live effect or agent execution." }, null, 2), { mode: 0o600 });
  }
  return { f, directory: native.directory as string, header, action, config: loadSettings(f.root), batch: "a".repeat(64) };
}
test("actual JSON-produced declined run crosses YAML only through typed absence and never replays", async () => {
  const c = legacyRun(), before = readRun(c.config, c.directory, c.batch, { inspect: true });
  expect(before.policy_current).toBe(false); expect(registeredOutstanding(c.config)[0].disposition).toBe("pending");
  const lookup = c.f.artifact("actual-format-absence.json", JSON.stringify({ schema_version: 1, repository: c.config.repository, hostname: c.config.hostname,
    run_id: before.header.run_id, batch_digest: c.batch, action_id: c.action.id, intent: c.action, intent_digest: digest(c.action), state: "absent", observed_at: new Date().toISOString(), method: "read-only:owned-merge" }));
  const retained = retainAbsence(c.config, c.directory, c.batch, c.action.id, { owner_approved: true, journal_only: true, owner_handoff: "owner:format-cutover",
    expected_digest: before.digest, intent_digest: digest(c.action), lookup }, { absence_confirmed: true });
  expect(retained.policy_current).toBe(false); expect(retained.cleanup_only).toBe(false); expect(readFileSync(join(c.directory, "header.json")).equals(c.header)).toBe(true);
  expect(registeredOutstanding(c.config)[0].disposition).toBe("retained-absence");
  let replayed = 0;
  await expect(recoverEffect(retained, c.action.id, { authorized: true, observe: async () => ({ state: "absent" }), execute: async () => { replayed++; return { state: "observed" }; } })).rejects.toThrow();
  expect(replayed).toBe(0);
  expect(() => retireRun(c.config, c.directory, c.batch, { owner_approved: true, owner_handoff: "owner:retire", expected_digest: retained.digest })).toThrow();
  const next = createRun(c.config, { artifact_root: c.f.artifacts, run_id: "current-yaml-run", batch_digest: "b".repeat(64) }); expect(liveReady(next)).toBe(true);
});
test("actual JSON resource and missing-root runs cannot disappear during YAML cutover", () => {
  const c = legacyRun("key"), rows = registeredOutstanding(c.config); expect(rows).toHaveLength(1); expect(rows[0].action.kind).toBe("key"); expect(rows[0].disposition).toBe("pending");
  const next = createRun(c.config, { artifact_root: c.f.artifacts, run_id: "new-yaml-run", batch_digest: "b".repeat(64) }); expect(liveReady(next)).toBe(false);
  rmSync(join(c.directory, "header.json")); expect(() => registeredOutstanding(c.config)).toThrow();
});
