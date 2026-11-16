/** Real retained dispatch with a toy native client and fake read-only GitHub; no model/provider trial. */
import { afterAll, expect, test } from "bun:test";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { auditClient } from "./native-audit-client-fixture";
import { bindingFixture } from "./binding-fixture";
import { role } from "./manifest-fixture";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { commitAll, git, put } from "./repository-fixture";

const roots: string[] = []; let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed owned audit-session roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});


test.each(["matching", "proposal", "proposal-supported", "claude", "changed-component", "invalid-worker", "request-change", "review-findings"])("retained normal audit session starts before roles and publishes no effects: %s", async fault => {
  try {
    await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-session");
    const f = await bindingFixture(roots, false, { fullComponent: true, mutableInventory: fault.startsWith("proposal"), role: { model: role.requested_model, native_model: role.adopted_model,
      provider: fault === "claude" ? "claude" : "copilot",
      identity_source: fault === "claude" ? { provider: "claude", event_type: "assistant", field_path: ["message", "model"] } : role.identity_source,
      argv: fault === "claude" ? ["--effort", "high"] : ["--no-auto-update"], client_program: auditClient(fault === "claude" ? "claude-normal-cli" : fault === "proposal-supported" ? "proposal-supported-cli" : fault) },
      beforeCandidate: input => {
        if (!fault.startsWith("proposal")) return;
        const root = dirname(input.artifacts), candidate = join(root, "existing-audit-proposal"), origin = join(root, "binding-origin");
        git(root, "clone", "--no-local", "--no-checkout", input.repo, candidate); git(candidate, "checkout", "--detach", input.source);
        put(candidate, "docs/guide.md", "# Full existing audit proposal\n"); const head = commitAll(candidate);
        git(origin, "-c", "protocol.file.allow=always", "fetch", "--no-write-fetch-head", candidate, head); git(origin, "update-ref", "refs/pull/11/head", head);
        const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
        writeFileSync(join(root, "binding-native-inventory.json"), canonicalJSON([{ number: 11, state: "open", merged_at: null,
          body: "Synthetic existing audit proposal", title: "Existing audit proposal", draft: false, labels: [],
          user: { id: 20, login: "fixture-bot", type: "Bot" }, head: { sha: head, ref: "docs-drift/existing", repo: repository },
          base: { sha: input.source, ref: "main", repo: repository } }]));
      } });
    let sessionComponent = f.retained.directory;
    if (fault === "changed-component") {
      sessionComponent = join(f.root, "changed-installed-component");
      cpSync(f.retained.directory, sessionComponent, { recursive: true });
      writeFileSync(join(sessionComponent, "unexpected-helper.ts"), "// Unapproved installed bytes\n");
    }
    const decisionBytes = canonicalJSON({ ...f.decisions, decisions: [] }); writeFileSync(join(f.artifacts, "report-decisions.json"), decisionBytes, { mode: 0o600 });
    const options = { ...f.options, decisions: { path: "report-decisions.json", sha256: sha256(decisionBytes) },
      environment: { PATH: f.native.environment.PATH, HOME: f.root, CLAUDE_CODE_OAUTH_TOKEN: "synthetic-selected-provider", COPILOT_GITHUB_TOKEN: "synthetic-selected-provider", GH_TOKEN: "synthetic-excluded-provider-credential" }, role_timeout_ms: 10000 };
    const input = join(f.artifacts, "audit-session-input.json"), output = join(f.artifacts, "audit-session-output.json");
    writeFileSync(input, JSON.stringify(options), { mode: 0o600 });
    const bridge = join(f.artifacts, "audit-session-bridge.ts");
    writeFileSync(bridge, `import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
const { runAuditSession, readOriginalAuditSessionOutputScope } = await import(${JSON.stringify(join(sessionComponent, "scripts/docs-drift/audit-session.ts"))});
const { withRuntimeValidation } = await import(${JSON.stringify(join(sessionComponent, "scripts/docs-drift/bootstrap.ts"))});
const result = await withRuntimeValidation(() => runAuditSession(JSON.parse(readFileSync(${JSON.stringify(input)}, "utf8"))));
writeFileSync(${JSON.stringify(output)}, JSON.stringify(result), { mode: 0o600 });
if (${JSON.stringify(fault)} === "matching" && result.complete) {
  const { persistAuditOutput } = await import(${JSON.stringify(join(f.retained.directory, "scripts/docs-drift/report-output.ts"))});
  const wrapped = { ...result, requests: { worker: null, reviewer: null } };
  const denied = persistAuditOutput({ repo: ${JSON.stringify(f.repo)}, source: ${JSON.stringify(f.source)}, artifact_root: ${JSON.stringify(f.artifacts)}, session: wrapped });
  const other = ${JSON.stringify(join(f.artifacts, "different-output-root"))}; mkdirSync(other, { mode: 0o700 });
  const changed = persistAuditOutput({ repo: ${JSON.stringify(f.repo)}, source: ${JSON.stringify(f.source)}, artifact_root: other, session: result });
  const checkout = readOriginalAuditSessionOutputScope(result).source_checkout;
  const { captureRepositoryState } = await import(${JSON.stringify(join(f.retained.directory, "scripts/docs-drift/snapshot.ts"))});
  const before = JSON.stringify(captureRepositoryState(checkout));
  const inside = persistAuditOutput({ repo: ${JSON.stringify(f.repo)}, source: ${JSON.stringify(f.source)}, artifact_root: checkout, session: result });
  writeFileSync(${JSON.stringify(join(f.artifacts, "wrapped-output-scope.json"))}, JSON.stringify({ denied, changed, inside,
    different_root_files: readdirSync(other), source_unchanged: JSON.stringify(captureRepositoryState(checkout)) === before }), { mode: 0o600 });
}
`, { mode: 0o600 });
    const argv = [globalThis.process.execPath, bridge];
    const before = captureRepositoryState(f.repo), process = Bun.spawnSync(argv, { env: { ...globalThis.process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
      PATH: f.native.environment.PATH, GH_TOKEN: "synthetic-read-token", CLAUDE_CODE_OAUTH_TOKEN: "synthetic-selected-provider", COPILOT_GITHUB_TOKEN: "synthetic-selected-provider" }, timeout: 210000 });
    writeFileSync(join(f.artifacts, "audit-session-process.stdout"), process.stdout, { mode: 0o600 });
    writeFileSync(join(f.artifacts, "audit-session-process.stderr"), process.stderr, { mode: 0o600 });
    expect(process.exitCode, process.stderr.toString()).toBe(0);
    const result = JSON.parse(readFileSync(output, "utf8"));
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(["matching", "proposal", "proposal-supported", "claude"].includes(fault)); expect(result.authority).toBe("none");
    if (fault === "matching") {
      const probes = JSON.parse(readFileSync(join(f.artifacts, "wrapped-output-scope.json"), "utf8")), { denied } = probes;
      expect(denied.complete).toBe(false); expect(denied.directory).toBeNull();
      expect(denied.diagnostics).toContain("Original completed audit session required for output scope");
      for (const rejected of [probes.changed, probes.inside]) {
        expect(rejected.complete).toBe(false); expect(rejected.scope_changed).toBe(true); expect(rejected.directory).toBeNull();
        expect(rejected.diagnostics).toContain("Original audit output scope changed");
      }
      expect(probes.different_root_files).toEqual([]); expect(probes.source_unchanged).toBe(true);
    }
    if (fault === "changed-component") {
      expect(result.start?.complete ?? false).toBe(false);
      expect(result.worker).toBeNull(); expect(result.reviewer).toBeNull(); expect(result.diagnostics.join("\n")).toContain("component identity changed");
      expect(captureRepositoryState(f.repo)).toEqual(before); return;
    }
    expect(result.start.complete).toBe(true);
    expect(result.worker.complete).toBe(true);
    for (const ref of Object.values(result.requests) as Array<{ path: string; sha256: string } | null>)
      if (ref) {
        const bytes = readFileSync(join(f.artifacts, ref.path));
        if (fault === "request-change") { expect(sha256(bytes)).not.toBe(ref.sha256); expect(bytes.toString()).toContain("Preserve this changed"); }
        else expect(sha256(bytes)).toBe(ref.sha256);
      }
    const order = readFileSync(join(f.artifacts, "synthetic-role-order.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(order.map(value => value.kind)).toEqual(["invalid-worker", "request-change"].includes(fault) ? ["docs-drift-audit-worker-request"] : ["docs-drift-audit-worker-request", "docs-drift-audit-review-request"]);
    if (fault === "request-change") {
      expect(result.scope_changed).toBe(true); expect(result.report).toBeNull(); expect(result.reviewer).toBeNull();
      expect(result.diagnostics.join("\n")).toContain("request artifact changed");
    }
    if (["matching", "proposal", "proposal-supported", "claude"].includes(fault)) {
      expect(result.report.complete).toBe(true); expect(result.report.report.collection_complete).toBe(true);
      expect(result.report.publication_receipts?.complete, JSON.stringify(result.report.diagnostics)).toBe(true);
      expect(result.report.publication_receipts.required_proposals).toBe(fault.startsWith("proposal") ? 1 : 0);
      expect(result.report.counts.eligible_publications).toBe(0);
      expect(result.report.report.published).toEqual([]); expect(result.report.report.failures).toEqual([]);
      expect(new Date(result.start.started_at).getTime()).toBeLessThanOrEqual(new Date(result.report.report.completed_at).getTime());
      expect(order[0].context).not.toBe(order[1].context);
      expect(result.report.counts.assessed_proposals).toBe(fault.startsWith("proposal") ? 1 : 0);
      if (fault === "proposal-supported") {
        expect(result.report.counts.verified_proposals).toBe(1);
        expect(result.report.counts.unverified_proposals).toBe(0);
        expect(result.report.proposal_verification.proposals[0]).toMatchObject({ number: 11, outcome: "verified" });
        expect(result.report.proposal_verification.proposals[0].verification_reference.sha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(result.report.markdown).toContain("Current proposal verification");
      }
      if (fault === "proposal") {
        expect(result.report.counts.unverified_proposals).toBe(1); expect(result.report.report.success).toBe(false);
        expect(result.report.report.outcome).toBe("new-attention"); expect(result.report.report.carried_delivery).toEqual([]);
        const { auditSessionOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-session");
        expect(auditSessionOutput(result, 524288).outcome).toBe("attention");
      }
    }
    expect(JSON.stringify(result)).not.toContain("synthetic-selected-provider"); expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 240000);
