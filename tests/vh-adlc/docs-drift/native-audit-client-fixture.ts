/** Owned toy native process used by source and normal-entry audit tests. */
export function auditClient(fault: string, ordinary = false) { return `#!${process.execPath}
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const args = process.argv.slice(2), arg = key => args[args.indexOf(key) + 1];
const isClaude = ${JSON.stringify(fault === "claude-normal-cli")};
const fixtureVersion = ${JSON.stringify(ordinary ? "1.0.112" : "fixture-1.0.0")};
if (args.includes("--version")) { console.log(isClaude ? fixtureVersion + " (Claude Code)" : "GitHub Copilot CLI " + fixtureVersion + "."); process.exit(0); }
if (args.includes("--help")) { console.log("--plugin-dir --model --session-id --output-format --available-tools --no-custom-instructions --disable-builtin-mcps"); process.exit(0); }
if (${JSON.stringify(fault)} === "provider-error") process.exit(73);
const prompt = isClaude ? args.at(-1) : arg("--prompt");
const line = prompt.split("\\n").find(line => line.startsWith("DOCS_DRIFT_REQUEST: "));
if (!line || (isClaude ? process.env.CLAUDE_CODE_OAUTH_TOKEN : process.env.COPILOT_GITHUB_TOKEN) !== "synthetic-selected-provider") process.exit(91);
const ref = JSON.parse(line.slice("DOCS_DRIFT_REQUEST: ".length));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = readFileSync(ref.path); if (digest(bytes) !== ref.sha256) process.exit(92);
const request = JSON.parse(bytes), { canonicalJSON } = await import(request.canonicalizer);
appendFileSync(join(request.artifact_root, "synthetic-role-order.jsonl"), JSON.stringify({ kind: request.kind, context: arg("--session-id"), cwd: process.cwd() }) + "\\n", { mode: 0o600 });
let records;
if (${JSON.stringify(fault)} === "source-change") writeFileSync(join(request.source_checkout, "docs/guide.md"), "Unexpected source mutation\\n");
if (request.kind === "docs-drift-closure-worker-request") {
  const quoted = readFileSync(join(request.source_checkout, "src/app.ts"));
  const evidence = [{ path: "src/app.ts", sha256: digest(quoted), start: 0, end: quoted.length, quote_sha256: digest(quoted) }];
  records = JSON.stringify({ input_sha256: request.worker_input_sha256, verifications: request.target.verification_scopes.map(scope => ({
    inputs_sha256: scope.inputs_sha256, state: "passed", method: "Synthetic merged current-source check", evidence, asset_checks: [] })) }) + "\\n";
} else if (request.kind === "docs-drift-prepare-worker-request") {
  const before = readFileSync(join(request.source_checkout, "docs/guide.md"));
  const decisions = JSON.parse(readFileSync(join(request.artifact_root, request.decisions.path))), resolving = decisions.mode === "resolve";
  const original = request.resolution?.proposals[0]?.hunks[0], quoted = readFileSync(join(request.source_checkout, "src/app.ts"));
  const evidence = [{ path: "src/app.ts", sha256: digest(quoted), start: 0, end: quoted.length, quote_sha256: digest(quoted) }];
  records = JSON.stringify({ input_sha256: request.worker_input_sha256, edits: [{ id: "guide-fix", path: "docs/guide.md", action: "replace",
    start: resolving ? original.before_range.start : 0, end: resolving ? original.before_range.end : before.length,
    before_sha256: digest(before), replacement_base64: resolving ? original.after_base64 : Buffer.from("# Corrected guide\\n").toString("base64"), after_mode: "100644" }],
    ...(resolving ? { resolution_verifications: decisions.decisions.map(row => ({ proposal: row.proposal, hunk_id: row.hunk_id,
      state: "passed", method: "Synthetic current source check", evidence, asset_checks: [] })) } : {}),
    publication: { operation_id: "normal-operation", proposal: { kind: "pr-create", payload: { base: "main", branch: "docs-drift/normal-operation",
      title: "Repair the guide", body: "Exact selected source correction\\n", labels: ["documentation"], draft: false } } } }) + "\\n";
  if (${JSON.stringify(fault)} === "mixed-plans") {
    const selected = JSON.parse(records);
    for (const [id, path, prior, next] of [["index-fix", "docs/plans/README.md", "Old link", "Current link"],
      ["status-fix", "docs/plans/legacy.md", "done", "complete"], ["checkbox-fix", "docs/plans/legacy.md", "[ ] Verified behavior", "[x] Verified behavior"]]) {
      const bytes = readFileSync(join(request.source_checkout, path)), base = bytes.indexOf(prior);
      const start = base + (id === "checkbox-fix" ? 1 : 0), end = id === "checkbox-fix" ? start + 1 : base + Buffer.byteLength(prior);
      selected.edits.push({ id, path, action: "replace", start, end, before_sha256: digest(bytes),
        replacement_base64: Buffer.from(id === "checkbox-fix" ? "x" : next).toString("base64"), after_mode: "100644" });
    }
    records = JSON.stringify(selected) + "\\n";
  }
  if (${JSON.stringify(fault)} === "decision-mismatch") records = records.replace('"guide-fix"', '"unselected-fix"');
} else if (request.kind === "docs-drift-audit-worker-request") {
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
        const supported = ${JSON.stringify(fault)} === "proposal-supported-cli", source = readFileSync(join(request.source_checkout, "docs/guide.md"));
        const quote = { path: "docs/guide.md", sha256: digest(source), start: 0, end: source.length, quote_sha256: digest(source) };
        return { number: row.number, binding_sha256: row.binding_sha256, hunks: original.hunks.map(hunk => ({ id: hunk.id, verdict: supported ? "supported" : "unknown",
          reason: "Synthetic semantic assessment remains unknown", recommendation: "Inspect this full original hunk", evidence: supported ? [quote] : [] })) };
      }) });
    writeFileSync(join(request.artifact_root, request.outputs.proposal_assessment), proposed, { mode: 0o600 });
    proposal_assessment = { path: request.outputs.proposal_assessment, sha256: digest(proposed) };
  }
  records = JSON.stringify({ input_sha256: request.worker_input_sha256, edits: [], publication: null, assessment: { path, sha256: digest(payload) },
    ...(proposal_assessment ? { proposal_assessment } : {}) }) + "\\n";
} else {
  records = ${JSON.stringify(fault)} === "review-findings" ? "FINDING: F-01\\nKIND: factual\\nSEVERITY: should-fix\\nWHERE: synthetic assessment\\nEVIDENCE: Needs another source check\\nPROPOSAL: Correct it\\n" : "NO FINDINGS\\n";
}
if (${JSON.stringify(fault)} === "invalid-worker" && request.kind.endsWith("worker-request")) records = "Not a worker handoff\\n";
if (${JSON.stringify(fault)} === "request-change") writeFileSync(ref.path, "Preserve this changed synthetic request\\n", { mode: 0o600 });
// The real native preparation trial added a human summary before its otherwise
// valid MODEL/JSON reply. Reproduce that response when the machine-only contract
// is missing from the actual prompt delivered to this owned process.
const prefix = ${JSON.stringify(fault)} === "prepare-protocol" && request.kind === "docs-drift-prepare-worker-request"
  && !prompt.includes("The MODEL header must be the first line") ? "I prepared the selected edit.\\n\\n" : "";
if (isClaude) {
  console.log(JSON.stringify({ type: "system", subtype: "init", session_id: arg("--session-id"), cwd: process.cwd(), model: "claude-opus-5.5" }));
  console.log(JSON.stringify({ type: "assistant", session_id: arg("--session-id"), message: { model: "claude-opus-5.5", content: [{ type: "text", text: "MODEL: claude-opus-5.5\\n" + records }] } }));
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: arg("--session-id"), result: "MODEL: claude-opus-5.5\\n" + records }));
} else {
  console.log(JSON.stringify({ type: "session.start", data: { sessionId: arg("--session-id"), alreadyInUse: false, context: { cwd: process.cwd() } } }));
  console.log(JSON.stringify({ type: "assistant.message", data: { model: "claude-opus-5.5", content: prefix + "MODEL: claude-opus-5.5\\n" + records } }));
}
`; }
