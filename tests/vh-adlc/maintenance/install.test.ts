import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoveredCodexOperations, discoveredClaudeOperations, inspectComponent, verifyCandidateInstall } from "./install-trial";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function component(version = "0.5.0") {
  const root = mkdtempSync(join(tmpdir(), "maintenance-install-test-")); roots.push(root);
  for (const path of ["plugin.json", ".claude-plugin/plugin.json", "skills/vh-adlc-maintenance/SKILL.md", "scripts/maintenance/cli.ts", "references/maintenance.md"]) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), path.endsWith("plugin.json") ? JSON.stringify({ name: "vh-adlc", version }) : "fixture\n", { mode: 0o644 });
  }
  return root;
}
test("candidate verification binds every installed byte and mode, discovery, source and helper preservation", () => {
  const source = inspectComponent(component()), installed = inspectComponent(component());
  const receipt = { kind: "local-catalog", host: "codex-cli", version: source.version, payload_digest: source.digest, discovery: ["vh-adlc-maintenance"], commands: [{ exit_code: 0, timed_out: false }], helpers: ["settings", "collection", "report"].map(stage => ({ stage, exit_code: 0, input_before: "a", input_after: "a", index_before: "b", index_after: "b" })) };
  expect(verifyCandidateInstall(source, installed, receipt).pass).toBe(true);
  for (const change of [{ payload_digest: "wrong" }, { discovery: [] }, { kind: "published-marketplace" }, { commands: [{ exit_code: 1, timed_out: false }] }, { helpers: receipt.helpers.slice(1) }, { helpers: receipt.helpers.map(row => ({ ...row, input_after: "changed" })) }]) expect(verifyCandidateInstall(source, installed, { ...receipt, ...change }).pass).toBe(false);
  expect(() => inspectComponent(component("0.4.1"))).toThrow();
});
test("component snapshots reject inconsistent manifests, symlinks and payload mode changes", () => {
  const root = component(), original = inspectComponent(root);
  chmodSync(join(root, "scripts/maintenance/cli.ts"), 0o755); expect(inspectComponent(root).digest).not.toBe(original.digest);
  writeFileSync(join(root, ".claude-plugin/plugin.json"), '{"name":"vh-adlc","version":"0.4.1"}'); expect(() => inspectComponent(root)).toThrow();
  writeFileSync(join(root, ".claude-plugin/plugin.json"), '{"name":"vh-adlc","version":"0.5.0"}'); symlinkSync("plugin.json", join(root, "extra")); expect(() => inspectComponent(root)).toThrow();
});

test("Codex operation discovery requires an enabled exact-plugin native response", () => {
  const transcript = (skills: unknown[]) => JSON.stringify({ id: 2, result: { data: [{ skills, errors: [] }] } });
  const row = { name: "vh-adlc:vh-adlc-maintenance", pluginId: "vh-adlc@candidate", enabled: true };
  expect(discoveredCodexOperations(transcript([row]), row.pluginId)).toEqual(["vh-adlc-maintenance"]);
  expect(discoveredCodexOperations(transcript([{ ...row, enabled: false }, { ...row, pluginId: "wrong" }]), row.pluginId)).toEqual([]);
  expect(() => discoveredCodexOperations('{"id":2,"error":{"message":"vh-adlc-maintenance"}}', row.pluginId)).toThrow();
});

test("Claude discovery verifies the actual component inventory rather than a hardcoded skill count", () => {
  const names = ["vh-adlc", "vh-adlc-blog", "vh-adlc-maintenance"], details = `Component inventory\n  Skills (3)  ${names.join(", ")}\n  Agents (1)  reviewer\n`;
  expect(discoveredClaudeOperations(details, names)).toEqual(names);
  expect(() => discoveredClaudeOperations(details.replace("(3)", "(10)"), names)).toThrow();
  expect(() => discoveredClaudeOperations(details.replace("vh-adlc-maintenance", "unrelated"), names)).toThrow();
  expect(() => discoveredClaudeOperations("Projected cost: vh-adlc-maintenance", names)).toThrow();
});
