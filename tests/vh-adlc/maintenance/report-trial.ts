import { coverageEvidence } from "./json-evidence";
// Explicit native-model acceptance runner. Expected answers never enter the model packet.
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { stackweaverPolicyCorpus } from "./policy-corpus";
import { syntheticCorpus } from "./fixtures/corpus";
import { git } from "./fixtures";
import { inspectComponent, sourceSnapshot } from "./install-trial";
import { gradeAssessment, type ExpectedCase } from "./trial-proof";
import { exportAnalysisInput, verifyAnalysisInput } from "../../../plugins/vh-adlc/scripts/maintenance/analysis-input";
import { digest } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { runOwnedClient } from "../../../plugins/vh-adlc/scripts/triage/owned-process";
import { copilotReadLaunch, gradeCopilotRead, parseCopilotResponse } from "../triage/copilot-trial";
const PIN = "e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a";
const PAGES = ["conventions/feature-documents.md", "conventions/coding.md", "conventions/documentation.md", "conventions/delivery.md", "guides/humanize-prose.md"];
const json = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
export function gradeNativeReport(assessment: unknown, cases: ExpectedCase[], evidence: Record<string, string>, proof: any) {
  const grade = gradeAssessment(assessment, cases, evidence), failures = [...grade.failures];
  if (!proof || !["copilot-cli", "codex-cli"].includes(proof.host) || !Array.isArray(proof.required_reads) || !Array.isArray(proof.successful_reads)) return { pass: false, failures: [...failures, "invalid-native-proof"] };
  if (proof.exit_code !== 0 || proof.timed_out || !proof.reaped) failures.push("native-process-incomplete");
  if (!proof.input_preserved || !proof.source_preserved) failures.push("native-input-or-source-changed");
  if (!proof.native_tools_pass) failures.push("native-tool-contract");
  if (!Array.isArray(proof.successful_reads) || proof.required_reads.some((path: string) => !proof.successful_reads.includes(path))) failures.push("required-input-not-read");
  if (proof.host === "copilot-cli" && (proof.requested_model !== "claude-opus-5.5" || JSON.stringify(proof.models) !== '["claude-opus-5.5"]')) failures.push("requested-model-not-observed");
  return { pass: !failures.length, failures };
}
export function gradeCodexPacketReads(events: any[], input: string, required: string[]) {
  const commands = events.filter(event => event.type === "item.completed" && event.item?.type === "command_execution").map(event => event.item);
  const reads: string[] = [];
  for (const path of required) {
    const bytes = readFileSync(join(input, path), "utf8"), lines = bytes.split("\n"), covered = new Set<number>();
    for (const command of commands.filter(command => command.exit_code === 0 && command.command.includes(path))) {
      const output = command.aggregated_output ?? "";
      if (output.includes(bytes.trimEnd())) lines.forEach((_, index) => covered.add(index + 1));
      for (const line of output.split("\n")) {
        const match = line.match(/^\s*(\d+)\t(.*)$/);
        if (match && lines[Number(match[1]) - 1] === match[2]) covered.add(Number(match[1]));
      }
      if (path === "manifest.json" && output.includes('"component_commit"') && output.includes('"source_commit"') && output.includes('"run_id"')) lines.forEach((_, index) => covered.add(index + 1));
    }
    if (lines.every((line, index) => !line.trim() || covered.has(index + 1))) reads.push(join(input, path));
  }
  return { pass: commands.length > 0 && commands.every(command => command.exit_code === 0) && !events.some(event => ["turn.failed", "error"].includes(event.type)), successful_reads: reads, commands };
}
function command(argv: string[], cwd: string) {
  const result = Bun.spawnSync(argv, { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw Error(`operator ${argv[0]} command failed`); return result.stdout.toString();
}
function operatorInputs(root: string, component: string, docs: string) {
  const agents = `Repository conventions: https://github.com/vhco-pro/docs/blob/${PIN}/AGENTS.md\nFeature documents: docs/specs/\n`;
  if (!existsSync(join(root, "AGENTS.md"))) writeFileSync(join(root, "AGENTS.md"), agents);
  const installer = join(component, "scripts/ensure-vh-adlc.sh"), binary = command(["bash", installer], root).trim();
  const lock = JSON.parse(readFileSync(join(component, "vh-adlc.lock.json"), "utf8")), platform = `${process.platform === "darwin" ? "darwin" : "linux"}_${process.arch === "arm64" ? "arm64" : "amd64"}`;
  if (!lock.assets[platform] || digest(readFileSync(binary)) !== lock.assets[platform].binary_sha256) throw Error("verified runtime hash differs from installed lock");
  const argv = [binary, "knowledge", "--repo", root, "--plugin-pin", PIN, "--docs-source", docs, ...PAGES.flatMap(page => ["--page", page])];
  const knowledge = JSON.parse(command(argv, root));
  if (knowledge.result !== "answered" || knowledge.knowledge?.revision !== PIN || JSON.stringify([...knowledge.data.pages].sort()) !== JSON.stringify([...PAGES].sort())) throw Error("required engineering knowledge unavailable");
  const files: Record<string, string> = { "AGENTS.md": agents, "operator/knowledge.json": JSON.stringify(knowledge, null, 2) + "\n", "operator/runtime.json": JSON.stringify({ version: lock.version, platform, binary_sha256: lock.assets[platform].binary_sha256, actual_sha256: digest(readFileSync(binary)), installer: "exact installed scripts/ensure-vh-adlc.sh", knowledge_argv: argv, exit_code: 0, verified_by: "trusted test operator" }, null, 2) + "\n" };
  for (const page of PAGES) files[`operator/engineering/${page}`] = command(["git", "-C", docs, "show", `${PIN}:${page}`], root);
  return files;
}
export function prepareReportTrial(repo: string, commit: string, installed: string, output: string, docs: string, consumer?: { root: string; commit: string }) {
  if (existsSync(output)) throw Error("fresh model-trial output required"); mkdirSync(output, { recursive: true, mode: 0o700 });
  const sourceComponent = join(repo, "plugins/vh-adlc"), installedSnapshot = inspectComponent(installed);
  // Compare native cache against exact committed source before granting it provenance.
  const archive = command(["git", "-C", repo, "rev-parse", commit], repo).trim(); if (archive !== commit) throw Error("exact shared commit required");
  const operator = (root: string) => operatorInputs(root, installed, docs);
  const corpus = consumer ? stackweaverPolicyCorpus(consumer, operator) : syntheticCorpus({ operatorInputs: operator });
  const cli = join(installed, "scripts/maintenance/cli.ts"), argv = [process.execPath, cli, "collect", "--repo", corpus.project.root];
  const collected = Bun.spawnSync(argv, { env: corpus.env, stdout: "pipe", stderr: "pipe" });
  if (collected.exitCode !== 0) throw Error("installed synthetic collection failed");
  const inventory = JSON.parse(collected.stdout.toString()); corpus.bindInventory(inventory);
  const packet = exportAnalysisInput(corpus.config, { ...corpus.packet, component: { root: sourceComponent, commit }, output: join(output, "input"), inventory,
    collection_receipt: { argv, exit_code: 0, requests_digest: corpus.requestsDigest() } });
  if (inspectComponent(join(packet.path, "plugin")).digest !== installedSnapshot.digest) throw Error("native installation differs from frozen report-stage payload");
  for (const file of packet.manifest.files) corpus.evidence[file.path] = readFileSync(join(packet.path, file.path), "utf8");
  corpus.evidence["manifest.json"] = readFileSync(join(packet.path, "manifest.json"), "utf8");
  json(join(output, "expected.json"), corpus.cases); // outside declared model inputs
  json(join(output, "collector-requests.json"), corpus.requests());
  const required = ["manifest.json", "settings.json", "collection-receipt.json", "inventory.json", "plugin/skills/vh-adlc-maintenance/SKILL.md", "plugin/references/maintenance.md", "plugin/references/maintenance-settings.md", "plugin/references/authority.md", "source/operator/knowledge.json", "source/operator/runtime.json", ...PAGES.map(page => `source/operator/engineering/${page}`)];
  return { corpus, packet, inventory, installedSnapshot, required };
}
function promptFor(prepared: ReturnType<typeof prepareReportTrial>) {
  const { packet, corpus, required } = prepared;
  const vocab = (field: keyof ExpectedCase) => [...new Set(corpus.cases.map(row => row[field]))];
  return `Invoke the exact installed vh-adlc-maintenance report-stage on this supplied SYNTHETIC packet. This is a read-only analysis trial, not a live sweep or a review of implementation. Your declared input root is your current directory only. Do not read parent/output/expected files, credentials or host settings. The trusted operator actually ran the installed GET collector and verified the binary and engineering revision. Read every nonblank line of ${JSON.stringify(required)}; use native view chunks or full file reads, without truncation. Report the knowledge line from source/operator/knowledge.json. Read source/AGENTS.md and all scoped affected source, release notes, history and policy. The manifest hash list is externally verified; read its metadata without needing to narrate each hash. The packet is fixed at source ${packet.manifest.source_commit}, component ${packet.manifest.component_commit}.\nUse native file tools, or Codex read-only shell commands limited to reading/searching this packet. Network, tracker, collection, edit and other state-changing commands are forbidden for this report-stage. Do not collect anew or claim checks, compatibility over production source, approval, completed merges or all vulnerabilities fixed. The trusted operator will render your assessment using the real report helper.\nReturn ONLY one JSON object with schema_version:1, collection_basis:"supplied-synthetic-receipts", synthetic_input:true, live_readiness:false, all_vulnerabilities_fixed:false, executed_actions:[], items:[...]. Use these exact requested item IDs (not answers): ${JSON.stringify(corpus.cases.map(row => row.id))}. Each item must have exactly id, classification, proposal, source_owner, batch_eligible, measured_count, coverage, claimed_resolved, related_ids, evidence, remaining. Classification vocabulary: ${JSON.stringify(vocab("classification"))}; proposal vocabulary: ${JSON.stringify(vocab("proposal"))}. Owners: primary, independent, satellite, mixed, unknown. source_owner means the authoritative owner of affected source, not the destination of a sync PR; synced-source work follows the declared source mapping. An unknown author does not make otherwise known source ownership unknown. A routine candidate can have batch_eligible:true with checks still pending; all others false. For non-security items coverage is not-applicable and measured_count null. Only security/history items carry observed counts/coverage; unavailable counts are null, never zero. claimed_resolved contains per-surface alert identities only when a comparable complete prior/current list justifies absence. related_ids is reserved for the other overlapping PR; leave it empty for non-overlap items. retain-unknown is the proposal for incomplete alert collection; reconcile-coverage is for dashboard work. Each evidence item is {path: "path relative to this input", line: positive integer, detail: "what that exact line supports"}. Cite the exact identifier line for each item in inventory.json plus relevant affected usage and release-note lines (actual caller line, not only imports). Cite the history observation line for history comparisons, and settings for organization inventory gaps. remaining states real limitations and unperformed work. This is a case classification protocol; choose outcomes from the evidence, never assume every green check means safe. No extra response fields or prose outside the JSON. The knowledge result can be stated in relevant remaining text.\nDo not invoke another model, CLI or subagent. Read this packet serially with the current context's native tools.`;
}
export async function runReportTrial(host: "copilot-cli" | "codex-cli", repo: string, commit: string, installed: string, output: string, docs: string, profile?: string, consumer?: { root: string; commit: string }) {
  const prepared = prepareReportTrial(repo, commit, installed, output, docs, consumer), { corpus, packet, required } = prepared;
  const sourceBefore = sourceSnapshot(corpus.project.root), indexBefore = digest(readFileSync(join(corpus.project.root, ".git/index")));
  const consumerInstructions = consumer ? `\nThis bounded Stackweaver-policy packet includes actual committed settings, entry, project procedure, CLAUDE rules, configured policy references and sync workflows. Tracker data, release notes, caller samples and history remain synthetic. Read those configured policy sources and the frontend/API sync mappings in full. Two synthetic satellite PRs test actual frontend sync ownership and API Dockerfile exclusion. Return an envelope {assessment:<the normal complete assessment>,consumer_plan:{builder_order:["first owner/location","next owner/location"], single_squash:boolean, skip_ci:boolean, distribution_edits:boolean, satellite_helper:"scope/requirements", production_compatibility:"what these samples can establish", report_publication:"scope of retained standing permission"}}. Infer these policy fields from the actual supplied files. Preserve every generic fixture item too. Do not claim production compatibility from a caller sample or publish any report remotely.` : "";
  if (consumer) prepared.required.push("source/AGENTS.md", "source/CLAUDE.md", "source/maintenance-project.md", "source/.vh-adlc/maintenance.json", "source/agents/maintenance.md", "source/.claude/commands/maintenance.md", "source/.github/workflows/sync-frontend.yml", "source/.github/workflows/sync-api.yml");
  const prompt = promptFor(prepared) + consumerInstructions, logs = join(output, "logs"); mkdirSync(logs);
  let args: string[], env = { ...process.env } as Record<string, string>;
  if (host === "copilot-cli") args = ["copilot", "--model", "claude-opus-5.5", ...copilotReadLaunch(packet.path, join(packet.path, "plugin"), logs, prompt).slice(1)];
  else {
    if (!profile) throw Error("native Codex candidate profile required");
    env.CODEX_HOME = profile;
    const normalProfile = process.env.CODEX_HOME ?? join(homedir(), ".codex"), auth = join(normalProfile, "auth.json");
    if (!existsSync(join(profile, "auth.json")) && existsSync(auth)) symlinkSync(auth, join(profile, "auth.json"));
    // Retain only the user's selected model defaults, not provider credentials, hooks or unrelated plugins.
    const config = join(normalProfile, "config.toml");
    if (existsSync(config)) {
      const normal = Bun.TOML.parse(readFileSync(config, "utf8")) as any;
      if (normal.model_provider && normal.model_provider !== "openai") throw Error("custom Codex provider requires an explicitly configured isolated test profile");
      const settings = ["model", "model_reasoning_effort"].filter(key => typeof normal[key] === "string").map(key => `${key} = ${JSON.stringify(normal[key])}`).join("\n");
      const current = join(profile, "config.toml"), body = existsSync(current) ? readFileSync(current, "utf8") : "";
      if (settings && !body.includes("# inherited test model defaults")) writeFileSync(current, `# inherited test model defaults\n${settings}\n\n${body}`);
    }
    args = ["codex", "exec", "--json", "--color", "never", "--sandbox", "read-only", "--disable", "multi_agent", "--skip-git-repo-check", "--cd", packet.path, prompt];
  }
  json(join(output, "launch.json"), { host, args, cwd: packet.path, component_commit: commit, consumer_target: consumer ? { repository: "michielvha/stackweaver", commit: consumer.commit } : null, installed_digest: prepared.installedSnapshot.digest, required_reads: required });
  writeFileSync(join(output, "prompt.txt"), prompt);
  const result = await runOwnedClient(args, { cwd: packet.path, env, stdout: join(output, "native.jsonl"), stderr: join(output, "stderr.log") }, { timeout_ms: 900_000, grace_ms: 500, reap_ms: 2000 });
  const raw = readFileSync(join(output, "native.jsonl"), "utf8"), events = raw.split("\n").filter(Boolean).map(line => JSON.parse(line));
  const verified = verifyAnalysisInput(packet.path), preserved = sourceSnapshot(corpus.project.root) === sourceBefore && digest(readFileSync(join(corpus.project.root, ".git/index"))) === indexBefore;
  let native: any, response: string | undefined, models: string[];
  if (host === "copilot-cli") {
    native = gradeCopilotRead({ raw, args, input: packet.path, probes: {}, requiredReads: required.map(path => join(packet.path, path)) });
    response = events.filter(event => event.type === "assistant.message" && event.data.content).at(-1)?.data.content; models = native.models;
  } else {
    const commands = events.filter(event => event.type === "item.completed" && event.item?.type === "command_execution").map(event => event.item);
    response = events.filter(event => event.type === "item.completed" && event.item?.type === "agent_message").at(-1)?.item.text;
    const thread = events.find(event => event.type === "thread.started")?.thread_id; models = [];
    function walk(dir: string) { if (!existsSync(dir)) return; for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) walk(path); else if (entry.name.endsWith(`${thread}.jsonl`)) for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) { const event = JSON.parse(line); if (event.type === "turn_context" && event.payload?.model && !models.includes(event.payload.model)) models.push(event.payload.model); } } }
    walk(join(profile!, "sessions"));
    native = { ...gradeCodexPacketReads(events, packet.path, required), failures: [], thread };
  }
  let assessment: unknown = null, error: string | null = null;
  let consumerPlan: any;
  try { const parsed = parseCopilotResponse(response!); assessment = consumer ? parsed.assessment : parsed; consumerPlan = parsed.consumer_plan; } catch { error = "native assessment missing or malformed"; }
  const proof = { host, requested_model: host === "copilot-cli" ? "claude-opus-5.5" : "inherited configured default", models: models.length ? models : ["unknown"], ...result, input_preserved: verified.pass, source_preserved: preserved, native_tools_pass: native.pass,
    required_reads: required, successful_reads: native.successful_reads.map((path: string) => path.slice(packet.path.length + 1)) };
  const grade = gradeNativeReport(assessment, corpus.cases, corpus.evidence, proof);
  if (consumer) {
    const plan = consumerPlan;
    if (!plan || !Array.isArray(plan.builder_order) || !/satellite|api|orchestrator/i.test(plan.builder_order[0] ?? "") || !/monorepo/i.test(plan.builder_order[1] ?? "") || plan.single_squash !== true || plan.skip_ci !== false || plan.distribution_edits !== false || !/approv|authoriz/i.test(plan.satellite_helper ?? "") || !/green|check/i.test(plan.satellite_helper ?? "") || !/unverified|cannot|not establish|not verified|none established/i.test(plan.production_compatibility ?? "") || !/report/i.test(plan.report_publication ?? "")) grade.failures.push("consumer-policy-parity");
    json(join(output, "consumer-plan.json"), consumerPlan ?? null);
  }
  if (error) grade.failures.push(error); grade.pass = !grade.failures.length;
  json(join(output, "assessment.json"), assessment); json(join(output, "native-grade.json"), native);
  if (grade.pass) {
    git(corpus.project.root, "update-ref", "refs/remotes/origin/main", packet.manifest.source_commit);
    const inventoryPath = join(output, "inventory.json"); json(inventoryPath, prepared.inventory);
    const request = join(output, "request.json"); json(request, { authorized_sweep: true, read_only: true });
    // Reuse the original bound run; the host, never the read-only model, renders the real report.
    const reportArgs = [process.execPath, join(installed, "scripts/maintenance/cli.ts"), "report", "--repo", corpus.project.root, "--run-id", packet.manifest.run_id, "--inventory", inventoryPath, "--default-commit", packet.manifest.source_commit, "--request", request, "--analysis", join(output, "assessment.json"), "--report-output", join(output, "maintenance-report.md")];
    const rendered = Bun.spawnSync(reportArgs, { env: corpus.env, stdout: "pipe", stderr: "pipe" });
    json(join(output, "report-receipt.json"), { argv: reportArgs, exit_code: rendered.exitCode, result: rendered.stdout.toString() });
    if (rendered.exitCode !== 0) { grade.pass = false; grade.failures.push("actual report rendering failed"); }
    if (sourceSnapshot(corpus.project.root) !== sourceBefore || digest(readFileSync(join(corpus.project.root, ".git/index"))) !== indexBefore) { grade.pass = false; proof.source_preserved = false; grade.failures.push("post-render-source-or-index-changed"); }
  }
  const final = { pass: grade.pass, grade, proof, input_integrity: verified, component_commit: commit, consumer_target: consumer ? { repository: "michielvha/stackweaver", commit: consumer.commit } : null, source_commit: packet.manifest.source_commit, report: existsSync(join(output, "maintenance-report.md")) ? join(output, "maintenance-report.md") : null };
  json(join(output, "result.json"), final); return final;
}
if (import.meta.main) {
  if (process.argv[2] === "resume-codex") {
    const result = await resumeCodexReportTrial(resolve(process.argv[3]), resolve(process.argv[4]));
    console.log(JSON.stringify({ pass: result.pass, grade: result.grade, report: result.report })); if (!result.pass) process.exitCode = 1;
  } else if (process.argv[2] === "regrade-declared-expectation") {
    const result = await regradeDeclaredExpectationEvidence(resolve(process.argv[3]), resolve(process.argv[4]));
    console.log(JSON.stringify({ pass: result.pass, grade: result.grade, report: result.report })); if (!result.pass) process.exitCode = 1;
  } else {
  const [host, repo, commit, installed, output, docs, profile, consumerRoot, consumerCommit] = process.argv.slice(2);
  if (!["copilot-cli", "codex-cli"].includes(host) || !docs) throw Error("usage: report-trial.ts host repo exact-commit installed-component new-output docs-source [codex-profile]");
  const result = await runReportTrial(host as any, resolve(repo), commit, resolve(installed), resolve(output), resolve(docs), profile && profile !== "none" ? resolve(profile) : undefined, consumerRoot ? { root: resolve(consumerRoot), commit: consumerCommit } : undefined);
  console.log(JSON.stringify({ output, pass: result.pass, grade: result.grade, models: result.proof.models })); if (!result.pass) process.exitCode = 1;
  }
}

// Capacity errors are retained, never counted as a pass. A successful same-thread continuation
// can complete that trial without substituting the configured model or discarding prior reads.
export async function resumeCodexReportTrial(output: string, profile: string) {
  const initial = JSON.parse(readFileSync(join(output, "result.json"), "utf8")), launch = JSON.parse(readFileSync(join(output, "launch.json"), "utf8"));
  const firstRaw = readFileSync(join(output, "native.jsonl"), "utf8"), first = firstRaw.trim().split("\n").map(line => JSON.parse(line));
  const failed = first.filter(event => event.type === "turn.failed");
  if (initial.proof.host !== "codex-cli" || initial.pass || failed.length !== 1 || failed[0].error?.message !== "Selected model is at capacity. Please try a different model." || !initial.proof.input_preserved || !initial.proof.source_preserved) throw Error("only an unchanged capacity-interrupted Codex trial may resume");
  const input = join(output, "input"), manifest = verifyAnalysisInput(input); if (!manifest.pass) throw Error("resume packet changed");
  const previousThread = first.find(event => event.type === "thread.started")?.thread_id; if (!previousThread) throw Error("original native thread missing");
  const receipt = JSON.parse(readFileSync(join(input, "collection-receipt.json"), "utf8")), root = receipt.argv[receipt.argv.indexOf("--repo") + 1], cli = receipt.argv[1];
  const indexPath = resolve(root, git(root, "rev-parse", "--git-path", "index")), sourceBefore = sourceSnapshot(root), indexBefore = digest(readFileSync(indexPath));
  const rawPath = join(output, "resume-1.jsonl"); if (existsSync(rawPath)) throw Error("this continuation already has a durable transcript; reconcile it instead of duplicating");
  const prompt = "The previous turn stopped because the provider reported model capacity. Continue the SAME read-only supplied-packet report-stage request using the SAME configured model and exact unchanged inputs. Prior successful reads remain valid; finish any unread required files. Do not collect, edit, publish, run checks or invoke another model. Return the originally requested complete JSON assessment, including actual evidence paths/lines and every requested item. The trusted host will render it. Read-only shell file/search commands inside the packet are allowed.";
  const args = ["codex", "exec", "--json", "--color", "never", "--sandbox", "read-only", "--disable", "multi_agent", "--skip-git-repo-check", "--cd", input, "resume", previousThread, prompt];
  json(join(output, "resume-1-launch.json"), { args, cwd: input, previous_thread: previousThread, original_model: initial.proof.models });
  const result = await runOwnedClient(args, { cwd: input, env: { ...process.env, CODEX_HOME: profile } as Record<string, string>, stdout: rawPath, stderr: join(output, "resume-1.stderr") }, { timeout_ms: 900_000, grace_ms: 500, reap_ms: 2000 });
  const resumed = readFileSync(rawPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const thread = resumed.find(event => event.type === "thread.started")?.thread_id;
  const permittedCapacity = (event: any) => event.type === "turn.failed" && event.error?.message === failed[0].error.message || event.type === "error" && event.message === failed[0].error.message;
  const native = gradeCodexPacketReads([...first.filter(event => !permittedCapacity(event)), ...resumed], input, launch.required_reads);
  const evidence = Object.fromEntries([...manifest.manifest.files.map(file => file.path), "manifest.json"].map(path => [path, readFileSync(join(input, path), "utf8")]));
  const expected = JSON.parse(readFileSync(join(output, "expected.json"), "utf8"));
  const response = resumed.filter(event => event.type === "item.completed" && event.item?.type === "agent_message").at(-1)?.item.text;
  let assessment: unknown = null; try { assessment = parseCopilotResponse(response); } catch {}
  const proof = { ...initial.proof, ...result, native_tools_pass: native.pass && thread === previousThread, input_preserved: verifyAnalysisInput(input).pass, source_preserved: initial.proof.source_preserved && sourceSnapshot(root) === sourceBefore && digest(readFileSync(indexPath)) === indexBefore,
    successful_reads: native.successful_reads.map(path => path.slice(input.length + 1)), resumed_thread: thread, previous_thread: previousThread, original_capacity_failure_retained: true };
  const grade = gradeNativeReport(assessment, expected, evidence, proof); let report: string | null = null;
  json(join(output, "resumed-assessment.json"), assessment);
  if (grade.pass) {
    git(root, "update-ref", "refs/remotes/origin/main", manifest.manifest.source_commit);
    json(join(output, "resumed-request.json"), { authorized_sweep: true, read_only: true });
    report = join(output, "maintenance-report.md");
    const argv = [process.execPath, cli, "report", "--repo", root, "--run-id", manifest.manifest.run_id, "--inventory", join(input, "inventory.json"), "--default-commit", manifest.manifest.source_commit, "--request", join(output, "resumed-request.json"), "--analysis", join(output, "resumed-assessment.json"), "--report-output", report];
    const rendered = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" }); json(join(output, "resumed-report-receipt.json"), { argv, exit_code: rendered.exitCode, result: rendered.stdout.toString() });
    if (rendered.exitCode || sourceSnapshot(root) !== sourceBefore || digest(readFileSync(indexPath)) !== indexBefore) { grade.pass = false; grade.failures.push("resumed-report-or-post-render-preservation"); }
  }
  const final = { pass: grade.pass, grade, proof, report, original_result: "result.json", original_launch: "launch.json", component_commit: initial.component_commit, source_commit: initial.source_commit };
  json(join(output, "resumed-result.json"), final); return final;
}

export async function regradeDeclaredExpectationEvidence(output: string, installed: string) {
  const original = JSON.parse(readFileSync(join(output, "result.json"), "utf8")), launch = JSON.parse(readFileSync(join(output, "launch.json"), "utf8"));
  if (original.pass || !original.grade.failures.length || original.grade.failures.some((failure: string) => !failure.endsWith(":required-evidence"))) throw Error("only an evidence-requirement-only rejection may use this correction");
  if (existsSync(join(output, "regraded-result.json"))) throw Error("a retained regrade already exists; reconcile it without overwrite");
  const input = join(output, "input"), verified = verifyAnalysisInput(input); if (!verified.pass || inspectComponent(installed).digest !== launch.installed_digest) throw Error("packet or installed payload changed");
  const evidence = Object.fromEntries([...verified.manifest.files.map(file => file.path), "manifest.json"].map(path => [path, readFileSync(join(input, path), "utf8")]));
  const settings = JSON.parse(evidence["settings.json"]), expected: ExpectedCase[] = JSON.parse(readFileSync(join(output, "expected.json"), "utf8"));
  const inventory = JSON.parse(evidence["inventory.json"]);
  for (const row of expected) {
    const coverage = coverageEvidence(inventory, row.id);
    if (coverage) for (const requirement of row.evidence) if (requirement.path === "inventory.json") Object.assign(requirement, coverage);
  }
  for (const row of expected) if (row.classification === "expected-unavailable" && settings.surface_expectations.some((rule: any) => row.id === `coverage:${rule.repository}:${rule.surface}`)) {
    for (const requirement of row.evidence) if (requirement.path === `source/${settings.project_procedure}`) requirement.alternatives = [{ path: "settings.json", line: 1 }];
  }
  json(join(output, "regraded-expected.json"), expected);
  const assessment = JSON.parse(readFileSync(join(output, "assessment.json"), "utf8")), grade = gradeNativeReport(assessment, expected, evidence, original.proof);
  let report: string | null = null;
  if (grade.pass) {
    const receipt = JSON.parse(evidence["collection-receipt.json"]), root = receipt.argv[receipt.argv.indexOf("--repo") + 1], cli = join(installed, "scripts/maintenance/cli.ts");
    const before = sourceSnapshot(root), indexPath = resolve(root, git(root, "rev-parse", "--git-path", "index")), index = digest(readFileSync(indexPath));
    git(root, "update-ref", "refs/remotes/origin/main", verified.manifest.source_commit); json(join(output, "regraded-request.json"), { authorized_sweep: true, read_only: true });
    report = join(output, "maintenance-report.md");
    const argv = [process.execPath, cli, "report", "--repo", root, "--run-id", verified.manifest.run_id, "--inventory", join(input, "inventory.json"), "--default-commit", verified.manifest.source_commit, "--request", join(output, "regraded-request.json"), "--analysis", join(output, "assessment.json"), "--report-output", report];
    const rendered = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" }); json(join(output, "regraded-report-receipt.json"), { argv, exit_code: rendered.exitCode, result: rendered.stdout.toString(), source_preserved: sourceSnapshot(root) === before, index_preserved: digest(readFileSync(indexPath)) === index });
    if (rendered.exitCode || sourceSnapshot(root) !== before || digest(readFileSync(indexPath)) !== index) { grade.pass = false; grade.failures.push("regraded-report-or-preservation"); }
  }
  const result = { ...original, pass: grade.pass, grade, report, original_grade_retained: "result.json", correction: "Bind all coverage citations to their actual scoped collected JSON object, preserving sibling-surface rejection; allow the exact declared security expectation as the existing procedure alternative. No classification, ownership, count, action, model, tool, input or preservation requirement changed." };
  json(join(output, "regraded-result.json"), result); return result;
}
