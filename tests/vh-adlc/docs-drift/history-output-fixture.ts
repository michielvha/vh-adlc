/** Owned Git, observed-shaped adoption and GET-only API fixtures. No hosted/model acceptance. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindingFixture } from "./binding-fixture";
import { commit, portableRecord, write } from "./adoption-fixture";
import { role } from "./manifest-fixture";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const client = `#!${process.execPath}
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const args = process.argv.slice(2), arg = key => args[args.indexOf(key) + 1];
if (args.includes("--version")) { console.log("GitHub Copilot CLI fixture-1.0.0."); process.exit(0); }
const line = arg("--prompt").split("\\n").find(value => value.startsWith("DOCS_DRIFT_REQUEST: "));
if (!line || process.env.COPILOT_GITHUB_TOKEN !== "synthetic-selected-provider") process.exit(91);
const ref = JSON.parse(line.slice("DOCS_DRIFT_REQUEST: ".length)), digest = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = readFileSync(ref.path); if (digest(bytes) !== ref.sha256) process.exit(92);
const request = JSON.parse(bytes), { canonicalJSON } = await import(request.canonicalizer);
let records = "NO FINDINGS\\n";
if (request.kind === "docs-drift-audit-worker-request") {
  const baseline = JSON.parse(readFileSync(join(request.artifact_root, request.source_verification.path)));
  const payload = canonicalJSON({ schema_version: 1, kind: "docs-drift-assessment", source_commit: request.source_commit,
    source_verification_sha256: request.source_verification.sha256, findings: baseline.scan.findings.map(finding => ({ id: finding.id,
      verdict: "unknown", reason: "Synthetic source judgment", recommendation: "Inspect current source", evidence: [] })) });
  const path = request.outputs.assessment; writeFileSync(join(request.artifact_root, path), payload, { mode: 0o600 });
  records = JSON.stringify({ input_sha256: request.worker_input_sha256, edits: [], publication: null,
    assessment: { path, sha256: digest(payload) } }) + "\\n";
}
console.log(JSON.stringify({ type: "session.start", data: { sessionId: arg("--session-id"), alreadyInUse: false, context: { cwd: process.cwd() } } }));
console.log(JSON.stringify({ type: "assistant.message", data: { model: "claude-opus-5.5", content: "MODEL: claude-opus-5.5\\n" + records } }));
`;

export async function historyOutputFixture(roots: string[], options: { localHistory?: boolean; scannerCase?: "none" | "finding" } = {}) {
  const f = await bindingFixture(roots, false, { fullComponent: true,
    scannerCase: options.scannerCase,
    role: { model: role.requested_model, native_model: role.adopted_model, identity_source: role.identity_source,
      argv: ["--no-auto-update"], client_program: client },
    prepareSource: fixture => {
      const settings = fixture.configured;
      if (options.localHistory) {
        settings.reports.interactive = "local-attestation";
        settings.reports.local_history_roots = [".vh-adlc/docs-drift-history"];
        mkdirSync(join(fixture.repo, ".vh-adlc/docs-drift-history"), { mode: 0o700 });
      }
      settings.publication.adoption_record = ".vh-adlc/docs-drift-adoptions/history-output.yaml";
      write(fixture.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings));
      write(fixture.repo, settings.execution.scheduled_workflow, canonicalJSON({ on: { schedule: [{ cron: "0 3 * * *" }] },
        jobs: { drift: { uses: "./" + settings.execution.worker_workflow } } }));
      write(fixture.repo, settings.execution.worker_workflow, canonicalJSON({ on: { workflow_call: null }, jobs: { report: {
        "runs-on": "ubuntu-latest", steps: ["collect", "review", "report", "upload", "attention"].map(id => ({
          id: "docs-drift-" + id, name: "Drift " + id, run: "synthetic-only" })) } } }));
      const candidate = commit(fixture.repo, "synthetic hosted report source");
      write(fixture.repo, settings.publication.adoption_record, canonicalJSON(portableRecord({ ...fixture, candidate })));
      return commit(fixture.repo, "synthetic hosted report adoption");
    } });
  const { retainClientDistribution } = await import("../../../plugins/vh-adlc/scripts/docs-drift/bootstrap");
  await retainClientDistribution({ ...f.setup, profile_scope: { ...f.setup.profile_scope, entry: "hosted" } });
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const run = { id: 101, run_attempt: 1, workflow_id: 19, path: ".github/workflows/docs-drift.yml", event: "schedule", status: "in_progress",
    conclusion: null, head_sha: f.source, head_branch: "main", repository, head_repository: repository,
    created_at: "2000-01-01T00:00:00Z", updated_at: "2000-01-01T00:01:00Z" };
  const runPath = join(f.root, "output-native-run.json"); writeFileSync(runPath, JSON.stringify(run), { mode: 0o600 });
  const executable = join(f.root, "native-bin/gh"), original = readFileSync(executable, "utf8"), git = Bun.which("git");
  if (!git || !original.includes("  const sha = ")) throw Error("Missing original native fixture boundary");
  const extra = `
let historyValue;
const sourceRepo = ${JSON.stringify(f.repo)}, git = ${JSON.stringify(git)};
const read = (...args) => { const result = Bun.spawnSync([git, "-C", sourceRepo, ...args]); if (result.exitCode) process.exit(93); return result.stdout; };
if (endpoint === "repos/fixture/docs/actions/runs/101" || endpoint === "repos/fixture/docs/actions/runs/101/attempts/1")
  historyValue = JSON.parse(require("node:fs").readFileSync(${JSON.stringify(runPath)}, "utf8"));
else if (endpoint === "repos/fixture/docs/actions/workflows/19") historyValue = { id: 19, path: ".github/workflows/docs-drift.yml", state: "active" };
else if (endpoint?.startsWith("repos/fixture/docs/actions/workflows/19/runs?")) historyValue = { total_count: 0, workflow_runs: [] };
else if (endpoint === "repos/fixture/docs/git/commits/${f.source}") historyValue = { sha: ${JSON.stringify(f.source)},
  tree: { sha: read("rev-parse", "${f.source}^{tree}").toString().trim() }, parents: [], message: "Owned synthetic source" };
else if (endpoint?.startsWith("repos/fixture/docs/git/trees/")) {
  const sha = endpoint.split("/").at(-1), entries = read("ls-tree", "-z", sha).toString().split("\\0").filter(Boolean).map(line => {
    const [meta, path] = line.split("\\t"), [mode, type, sha] = meta.split(" "); return { mode, type, sha, path };
  }); historyValue = { sha, tree: entries, truncated: false };
} else if (endpoint?.startsWith("repos/fixture/docs/git/blobs/")) {
  const sha = endpoint.split("/").at(-1), bytes = read("cat-file", "blob", sha);
  historyValue = { sha, encoding: "base64", content: bytes.toString("base64"), size: bytes.length };
}
if (historyValue !== undefined) { console.log("HTTP/2.0 200 OK\\r\\n\\r\\n" + JSON.stringify(historyValue)); process.exit(0); }
`;
  writeFileSync(executable, original.replace("  const sha = ", extra + "  const sha = "));
  const decisionBytes = canonicalJSON({ ...f.decisions, decisions: [] });
  writeFileSync(join(f.artifacts, "report-decisions.json"), decisionBytes, { mode: 0o600 });
  const sessionOptions = { ...f.options, run: "101", entry: options.localHistory ? "copilot" as const : "hosted" as const, hosted_run_attempt: 1,
    decisions: { path: "report-decisions.json", sha256: sha256(decisionBytes) },
    environment: { PATH: f.native.environment.PATH, COPILOT_GITHUB_TOKEN: "synthetic-selected-provider" }, role_timeout_ms: 10000 };
  return { ...f, options: sessionOptions, runPath, run };
}

export function runHistoryOutput(f: Awaited<ReturnType<typeof historyOutputFixture>>, body: string, options: { session?: boolean; timeoutMs?: number } = {}) {
  const bridge = join(f.artifacts, "history-output-bridge.ts"), output = join(f.artifacts, "history-output-result.json");
  writeFileSync(bridge, `import { readFileSync, writeFileSync } from "node:fs";
const plugin = ${JSON.stringify(f.retained.directory)};
const { runAuditSession } = await import(plugin + "/scripts/docs-drift/audit-session.ts");
const options = ${JSON.stringify(f.options)};
${options.session === false ? "" : `const session = await runAuditSession(options);
if (!session.complete) throw Error(JSON.stringify(session));`}
${body}
writeFileSync(${JSON.stringify(output)}, JSON.stringify(result), { mode: 0o600 });
`, { mode: 0o600 });
  const child = Bun.spawnSync([process.execPath, bridge], { timeout: options.timeoutMs ?? 480000,
    env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", PATH: f.native.environment.PATH,
      GH_TOKEN: "synthetic-read-token", COPILOT_GITHUB_TOKEN: "synthetic-selected-provider", GITHUB_RUN_ID: "101", GITHUB_RUN_ATTEMPT: "1" } });
  writeFileSync(join(f.artifacts, "history-output-process.stdout"), child.stdout, { mode: 0o600 });
  writeFileSync(join(f.artifacts, "history-output-process.stderr"), child.stderr, { mode: 0o600 });
  if (child.exitCode !== 0) throw Error("Owned history output bridge failed: " + child.stderr.toString());
  return JSON.parse(readFileSync(output, "utf8"));
}
