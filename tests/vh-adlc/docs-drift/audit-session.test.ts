/** Real retained dispatch with a toy native client and fake read-only GitHub; no model/provider trial. */
import { afterAll, expect, test } from "bun:test";
import { lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

function client(fault: string) { return `#!${process.execPath}
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const args = process.argv.slice(2), arg = key => args[args.indexOf(key) + 1];
if (args.includes("--version")) { console.log("GitHub Copilot CLI fixture-1.0.0."); process.exit(0); }
const line = arg("--prompt").split("\\n").find(line => line.startsWith("DOCS_DRIFT_REQUEST: "));
if (!line || process.env.COPILOT_GITHUB_TOKEN !== "synthetic-selected-provider") process.exit(91);
const ref = JSON.parse(line.slice("DOCS_DRIFT_REQUEST: ".length));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = readFileSync(ref.path); if (digest(bytes) !== ref.sha256) process.exit(92);
const request = JSON.parse(bytes), { canonicalJSON } = await import(request.canonicalizer);
appendFileSync(join(request.artifact_root, "synthetic-role-order.jsonl"), JSON.stringify({ kind: request.kind, context: arg("--session-id"), cwd: process.cwd() }) + "\\n", { mode: 0o600 });
let records;
if (request.kind === "docs-drift-audit-worker-request") {
  const baseline = JSON.parse(readFileSync(join(request.artifact_root, request.source_verification.path)));
  const payload = canonicalJSON({ schema_version: 1, kind: "docs-drift-assessment", source_commit: request.source_commit,
    source_verification_sha256: request.source_verification.sha256, findings: baseline.scan.findings.map(finding => ({ id: finding.id,
      verdict: "unknown", reason: "Synthetic source needs human judgment", recommendation: "Inspect the exact current source", evidence: [] })) });
  const path = request.outputs.assessment; writeFileSync(join(request.artifact_root, path), payload, { mode: 0o600 });
  let proposal_assessment;
  if (request.proposals.length) {
    const proposed = canonicalJSON({ schema_version: 1, kind: "docs-drift-proposal-assessment", source_commit: request.source_commit,
      inputs_sha256: request.proposal_inputs_sha256, proposals: request.proposals.map(row => {
        const original = JSON.parse(readFileSync(join(request.artifact_root, row.inputs_reference.path)));
        return { number: row.number, binding_sha256: row.binding_sha256, hunks: original.hunks.map(hunk => ({ id: hunk.id, verdict: "unknown",
          reason: "Synthetic semantic assessment remains unknown", recommendation: "Inspect this full original hunk", evidence: [] })) };
      }) });
    writeFileSync(join(request.artifact_root, request.outputs.proposal_assessment), proposed, { mode: 0o600 });
    proposal_assessment = { path: request.outputs.proposal_assessment, sha256: digest(proposed) };
  }
  records = JSON.stringify({ input_sha256: request.worker_input_sha256, edits: [], publication: null, assessment: { path, sha256: digest(payload) },
    ...(proposal_assessment ? { proposal_assessment } : {}) }) + "\\n";
  if (${JSON.stringify(fault)} === "invalid-worker") records = "Not a worker handoff\\n";
  if (${JSON.stringify(fault)} === "request-change") writeFileSync(ref.path, "Preserve this changed synthetic request\\n", { mode: 0o600 });
} else {
  records = ${JSON.stringify(fault)} === "review-findings" ? "FINDING: F-01\\nKIND: factual\\nSEVERITY: should-fix\\nWHERE: synthetic assessment\\nEVIDENCE: Needs another source check\\nPROPOSAL: Correct it\\n" : "NO FINDINGS\\n";
}
console.log(JSON.stringify({ type: "session.start", data: { sessionId: arg("--session-id"), alreadyInUse: false, context: { cwd: process.cwd() } } }));
console.log(JSON.stringify({ type: "assistant.message", data: { model: "claude-opus-5.5", content: "MODEL: claude-opus-5.5\\n" + records } }));
`; }

test.each(["matching", "proposal", "normal-cli", "normal-cli-partial-output", "unretained", "invalid-worker", "request-change", "review-findings"])("retained normal audit session starts before roles and publishes no effects: %s", async fault => {
  try {
    await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-session");
    const f = await bindingFixture(roots, false, { fullComponent: true, mutableInventory: fault === "proposal", role: { model: role.requested_model, native_model: role.adopted_model,
      identity_source: role.identity_source, argv: ["--no-auto-update"], client_program: client(fault) },
      beforeCandidate: input => {
        if (fault !== "proposal") return;
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
    const decisionBytes = canonicalJSON({ ...f.decisions, decisions: [] }); writeFileSync(join(f.artifacts, "report-decisions.json"), decisionBytes, { mode: 0o600 });
    const options = { ...f.options, decisions: { path: "report-decisions.json", sha256: sha256(decisionBytes) },
      environment: { PATH: f.native.environment.PATH, COPILOT_GITHUB_TOKEN: "synthetic-selected-provider", GH_TOKEN: "synthetic-excluded-provider-credential" }, role_timeout_ms: 10000 };
    const input = join(f.artifacts, "audit-session-input.json"), output = join(f.artifacts, "audit-session-output.json");
    writeFileSync(input, JSON.stringify(options), { mode: 0o600 });
    const bridge = join(f.artifacts, "audit-session-bridge.ts");
    writeFileSync(bridge, `import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
const { runAuditSession, readOriginalAuditSessionOutputScope } = await import(${JSON.stringify(fault === "unretained" ? join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/audit-session.ts") : join(f.retained.directory, "scripts/docs-drift/audit-session.ts"))});
const result = await runAuditSession(JSON.parse(readFileSync(${JSON.stringify(input)}, "utf8")));
writeFileSync(${JSON.stringify(output)}, JSON.stringify(result), { mode: 0o600 });
if (${JSON.stringify(fault)} === "matching") {
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
    const cliArgs = ["run-audit",
      "--repo", f.repo, "--source", f.source, "--artifact-root", f.artifacts, "--cache-root", options.cache_directory,
      "--entry", "copilot", "--launcher", options.launcher_path, "--settings", options.settings_path,
      "--source-verification", options.source_verification.path, "--source-verification-sha256", options.source_verification.sha256,
      "--decisions", options.decisions.path, "--decisions-sha256", options.decisions.sha256];
    if (fault === "normal-cli-partial-output") writeFileSync(bridge, `import * as fs from "node:fs";
import { spyOn } from "bun:test";
const link = fs.linkSync;
spyOn(fs, "linkSync").mockImplementation((from, to) => {
  if (String(to).endsWith("/report.md")) throw Error("Synthetic retained command markdown failure");
  return link(from, to);
});
const { main } = await import(${JSON.stringify(join(f.retained.directory, "scripts/docs-drift/cli.ts"))});
process.exitCode = await main(${JSON.stringify(cliArgs)});
`, { mode: 0o600 });
    const cliCase = ["normal-cli", "normal-cli-partial-output"].includes(fault);
    const argv = fault === "normal-cli" ? [globalThis.process.execPath, join(f.retained.directory, "scripts/docs-drift/cli.ts"), ...cliArgs]
      : [globalThis.process.execPath, bridge];
    const before = captureRepositoryState(f.repo), process = Bun.spawnSync(argv, { env: { ...globalThis.process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
      PATH: f.native.environment.PATH, GH_TOKEN: "synthetic-read-token", COPILOT_GITHUB_TOKEN: "synthetic-selected-provider" }, timeout: 210000 });
    expect(process.exitCode, process.stderr.toString()).toBe(fault === "normal-cli-partial-output" ? 2 : 0);
    const cli = cliCase ? JSON.parse(process.stdout.toString()) : null;
    const result = cli ? cli.audit_session : JSON.parse(readFileSync(output, "utf8"));
    if (cli) {
      const partial = fault === "normal-cli-partial-output";
      expect(cli.report_artifacts?.complete, JSON.stringify(cli)).toBe(!partial);
      const saved = cli.report_artifacts;
      expect(saved.content).toBe("report"); expect(saved.history_provenance).toBe("absent"); expect(saved.authority).toBe("none");
      expect(readdirSync(saved.directory).sort()).toEqual(partial ? ["report.json"] : ["report.json", "report.md"]);
      expect(lstatSync(saved.directory).mode & 0o777).toBe(0o700);
      for (const ref of Object.values(saved.files) as Array<{ path: string; sha256: string } | null>) {
        if (!ref) continue;
        const path = join(f.artifacts, ref.path), bytes = readFileSync(path);
        expect(sha256(bytes)).toBe(ref.sha256); expect(lstatSync(path).mode & 0o777).toBe(0o600);
        expect(bytes.length).toBeLessThanOrEqual(524288);
      }
      expect(JSON.parse(readFileSync(join(f.artifacts, saved.files.report_json.path), "utf8"))).toEqual(result.report.report);
      if (partial) {
        expect(saved.files.markdown).toBeNull(); expect(cli.outcome).toBe("incomplete");
        expect(cli.diagnostics).toContainEqual({ code: "audit-output", message: "Synthetic retained command markdown failure" });
      } else expect(readFileSync(join(f.artifacts, saved.files.markdown.path), "utf8")).toBe(result.report.markdown);
    }
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(["matching", "proposal", "normal-cli", "normal-cli-partial-output"].includes(fault)); expect(result.authority).toBe("none");
    expect(result.start.complete).toBe(true);
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
    if (fault === "unretained") {
      expect(result.worker).toBeNull(); expect(result.reviewer).toBeNull(); expect(result.diagnostics.join("\n")).toContain("selected retained component");
      expect(captureRepositoryState(f.repo)).toEqual(before); return;
    }
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
    if (["matching", "proposal", "normal-cli", "normal-cli-partial-output"].includes(fault)) {
      expect(result.report.complete).toBe(true); expect(result.report.report.collection_complete).toBe(true);
      expect(result.report.publication_receipts?.complete, JSON.stringify(result.report.diagnostics)).toBe(true);
      expect(result.report.publication_receipts.required_proposals).toBe(fault === "proposal" ? 1 : 0);
      expect(result.report.counts.eligible_publications).toBe(0);
      expect(result.report.report.published).toEqual([]); expect(result.report.report.failures).toEqual([]);
      expect(new Date(result.start.started_at).getTime()).toBeLessThanOrEqual(new Date(result.report.report.completed_at).getTime());
      expect(order[0].context).not.toBe(order[1].context);
      expect(result.report.counts.assessed_proposals).toBe(fault === "proposal" ? 1 : 0);
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
