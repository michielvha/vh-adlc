// Explicit model trial on the synthetic project. Ordinary tests do not call a model.
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { computeComponentIdentity, inspectInstalledPayload } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { runOwnedClient } from "../../../plugins/vh-adlc/scripts/triage/owned-process";
import { fixtureGit, withoutGitOverrides } from "./fixture-git";

const repo = resolve(import.meta.dir, "../../..");
const skill = "vh-adlc:vh-adlc-docs-truth";
const setup = "docs/current/setup.md";
const reportFormat = "Finish with a single JSON object containing status (complete, incomplete, failed or clarification), "
  + "mode, paths (the ordered paths selected for claim review), coverage (full, targeted or none), and findings "
  + "(an array of claim, verdict, source and disposition strings, and disposition_type set to retain, propose, flag or product_issue). "
  + "For an incomplete review include completed and unfinished arrays of document paths. For next mode give the selector's exact "
  + "reasons in a reasons array. For report mode give the exact selector output (without a final newline) "
  + "in a freshness string. For refused input, include a message explaining what failed and a reasonCode from: "
  + "invalid-arguments, duplicate-path, noncanonical-path, outside-scope (including excluded or non-document paths), "
  + "untracked-path, dirty-checkout, non-regular-document, non-regular-policy, missing-policy, incomplete-inventory. "
  + "Use the installed procedure and actual repository evidence before giving the result. Keep the project read-only.";

const cases = {
  default: { ask: "Review the next batch at its default size.", mode: "next", paths: [setup], coverage: "full" },
  sized: { ask: "next 2", mode: "next", paths: [setup, "README.md"], coverage: "full" },
  sweep: { ask: `sweep ${setup}. Check only the claim about the default port.`, mode: "sweep", paths: [setup], coverage: "targeted" },
  meta: { ask: "meta", mode: "meta", paths: ["README.md"], coverage: "full" },
  report: { ask: "report", mode: "report", paths: [], coverage: "none" },
  historical: { ask: "sweep docs/history/launch.md", mode: "sweep", paths: ["docs/history/launch.md"], coverage: "full" },
  intake: { ask: "Use vh-adlc. Verify the next batch of documentation claims against the current source.", mode: "next", paths: [setup], coverage: "full", automatic: true },
  ambiguous: { ask: "Use vh-adlc. Audit the docs.", status: "clarification", paths: [], coverage: "none", automatic: true },
  invalid: { ask: "next 0", status: "failed", paths: [], coverage: "none" },
  duplicate: { ask: `sweep ${setup} ${setup}`, status: "failed", paths: [], coverage: "none" },
  alias: { ask: `sweep ./${setup}`, status: "failed", paths: [], coverage: "none" },
  escape: { ask: "sweep ../outside.md", status: "failed", paths: [], coverage: "none" },
  excluded: { ask: "sweep config/client-contract.txt", status: "failed", paths: [], coverage: "none" },
  untracked: { ask: "sweep docs/current/untracked.md", status: "failed", paths: [], coverage: "none" },
  docLink: { ask: "sweep docs/current/link.md", status: "failed", paths: [], coverage: "none" },
  policyLink: { ask: "next", status: "failed", paths: [], coverage: "none" },
  noPolicy: { ask: "next", status: "failed", paths: [], coverage: "none" },
  partial: { ask: "next", status: "failed", paths: [], coverage: "none" },
  empty: { ask: "next", mode: "next", paths: [], coverage: "none" },
  unsupported: { ask: `sweep ${setup}. Check only the retained-data duration. A replacement should state a verified duration.`,
    mode: "sweep", paths: [setup], coverage: "targeted" },
  replaced: { ask: `sweep ${setup}. Check only the default port. Validate the tracked path first in a standalone Git command, before reading the body.`,
    mode: "sweep", paths: [setup], coverage: "targeted" },
  interrupted: { ask: "next 2. Complete the first document before starting the second. Read the first document in its own command.",
    mode: "next", paths: [setup, "README.md"], coverage: "full" },
  paused: { ask: "next 2. Check all claims in the first document, then stop before reading the second and report unfinished work.",
    mode: "next", status: "incomplete", paths: [setup, "README.md"], coverage: "full" },
} satisfies Record<string, TrialCase>;

const refusalReasons: Record<string, string[]> = {
  invalid: ["invalid-arguments"],
  duplicate: ["duplicate-path"],
  alias: ["noncanonical-path"],
  escape: ["outside-scope", "noncanonical-path"],
  excluded: ["outside-scope"],
  untracked: ["untracked-path", "dirty-checkout"],
  docLink: ["non-regular-document"],
  policyLink: ["non-regular-policy"],
  noPolicy: ["missing-policy"],
  partial: ["incomplete-inventory"],
};

type TrialCase = { ask: string; mode?: string; paths: string[]; coverage: string; status?: string; automatic?: boolean };

function git(cwd: string, ...args: string[]) {
  return fixtureGit(cwd, args);
}

function snapshot(dir: string) {
  const hash = createHash("sha256");
  function walk(path: string) {
    for (const item of readdirSync(path).sort()) {
      if (item === ".git") continue;
      const full = join(path, item);
      const info = lstatSync(full);
      hash.update(full).update(String(info.mode));
      if (info.isDirectory()) walk(full);
      else if (info.isFile()) hash.update(readFileSync(full));
      else if (info.isSymbolicLink()) hash.update(readlinkSync(full));
      else throw Error(`unexpected fixture entry ${full}`);
    }
  }
  walk(dir);
  hash.update(readFileSync(join(dir, ".git", "index")));
  return { files: hash.digest("hex"), head: git(dir, "rev-parse", "HEAD"),
    refs: git(dir, "for-each-ref", "--format=%(refname) %(objectname)") };
}

function parseReply(text: string, host: string) {
  let answer = "";
  for (const line of text.split("\n").filter(Boolean)) {
    const event = JSON.parse(line);
    if (host === "codex" && event.type === "item.completed" && event.item?.type === "agent_message") answer = event.item.text;
    if (host === "claude" && event.type === "result" && !event.is_error) answer = event.result;
  }
  const body = answer.match(/\{[\s\S]*\}/)?.[0];
  if (!body) throw Error("native run returned no structured report");
  return JSON.parse(body);
}

function trace(text: string, host: string) {
  const commands: string[] = [], outputs: string[] = [];
  let partialFailure = false;
  for (const line of text.split("\n").filter(Boolean)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (host === "codex" && event.type === "item.completed" && event.item?.type === "command_execution") {
      commands.push(event.item.command);
      outputs.push(event.item.aggregated_output);
      if (event.item.aggregated_output?.includes("inventory failed")
        && event.item.aggregated_output.includes(setup) && event.item.exit_code === 17) partialFailure = true;
    }
    if (host === "claude" && Array.isArray(event.message?.content)) {
      for (const content of event.message.content) {
        if (content.type === "tool_use") commands.push(JSON.stringify(content.input));
        if (content.type === "tool_result") {
          const output = JSON.stringify(content.content);
          outputs.push(output);
          if (content.is_error && output.includes("inventory failed") && output.includes(setup)) partialFailure = true;
        }
      }
    }
  }
  return { commands, outputs: outputs.join("\n"), partialFailure };
}

const bodyMarker = "The service listens on port 9000 by default.";
const freshness = "2 eligible documents\ndocs/current/setup.md\tnever verified\nREADME.md\tverified 2026-01-01";

function verifyReads(log: ReturnType<typeof trace>, id: string, selected: TrialCase) {
  const title = id === "ambiguous" ? "# Lifecycle intake and execution" : "# Documentation truth review";
  if (!log.outputs.includes(title)) throw Error("installed procedure read not observed");
  const documentMarkers = [bodyMarker, "The default service port is 3900.", "The first lab launch used port 8999."];
  if ((selected.status === "failed" || selected.status === "clarification" || id === "report" || id === "empty")
    && documentMarkers.some((marker) => log.outputs.includes(marker))) {
    throw Error("read a document body outside a successful claim review");
  }
  if (id === "report" && !log.outputs.includes(freshness.split("\n")[0])) throw Error("freshness selector output not observed");
  if (id === "partial" && !log.partialFailure) throw Error("partial selector output and failure not observed");
  if (id === "paused" && (!log.outputs.includes(bodyMarker) || log.outputs.includes("# Example service"))) {
    throw Error("pause occurred outside the intended document boundary");
  }
  if (["default", "intake", "sized"].includes(id) && !log.outputs.includes("PORT=3900")) {
    throw Error("independent service evidence not observed");
  }
}

function verifyReport(report: Record<string, unknown>, selected: TrialCase, id: string) {
  if (report.status !== (selected.status ?? "complete") || selected.mode && report.mode !== selected.mode
    || JSON.stringify(report.paths) !== JSON.stringify(selected.paths) || report.coverage !== selected.coverage) {
    throw Error("native report status, scope or coverage differed");
  }
  if (!Array.isArray(report.findings)) throw Error("missing findings inventory");
  if (refusalReasons[id] && (typeof report.message !== "string" || report.message.trim() === ""
    || typeof report.reasonCode !== "string" || !refusalReasons[id].includes(report.reasonCode))) {
    throw Error("report does not identify the expected refusal");
  }
  if (selected.coverage === "none" && report.findings.length) throw Error("unexpected claim review");
  if (id === "report" && report.freshness !== freshness) throw Error("freshness differs from selector");
  if (selected.mode === "next" && !selected.status) {
    const reasons = selected.paths.map((path) => path === setup ? "never verified" : "verified 2026-01-01");
    if (reasons.length && JSON.stringify(report.reasons) !== JSON.stringify(reasons)) throw Error("selection reasons differ");
  }
  if (["default", "intake", "sized", "paused"].includes(id)) {
    const expected = [
      [/9000|port/i, "incorrect", /service\.conf.*3900|service\.conf/i],
      [/make start/i, "accurate", /Makefile/i],
      [/external.*backend/i, "accurate", /service\.conf/i],
      [/workers/i, "unknown", /worker|config|source|Makefile/i],
      [/probe|60.second/i, "incorrect", /probe\.conf/i],
      [/503|unavailable/i, "accurate", /client.contract/i],
    ] as const;
    for (const [claim, verdict, source] of expected) {
      if (!report.findings.some((row) => claim.test(row.claim) && row.verdict === verdict && source.test(row.source))) {
        throw Error(`missing ${verdict} evidence for ${claim}`);
      }
    }
    if (!report.findings.some((row) => /503|unavailable/i.test(row.claim) && /product|implementation|contract/i.test(row.disposition))) {
      throw Error("missing product discrepancy");
    }
    const allowed = [...expected.map(([claim]) => claim), /committed probe setting|config\/probe\.conf/i];
    if (id === "sized") allowed.push(/3900|setup instructions|docs\/current\/setup\.md.*exists/i);
    if (report.findings.some((row) => !allowed.some((claim) => claim.test(row.claim)))) throw Error("unexpected full-review claim");
  }
  if (["sized", "meta"].includes(id) && !report.findings.some((row) =>
    /3900/.test(row.claim) && row.verdict === "accurate" && /service\.conf/i.test(row.source))) {
    throw Error("README claim and source evidence missing");
  }
  if (id === "historical" && !report.findings.some((row) => /8999/.test(row.claim) && row.verdict === "unknown")) {
    throw Error("historical claim was not reviewed as unresolved");
  }
  if (id === "sweep" && (report.findings.length !== 1 || report.findings[0].verdict !== "incorrect"
    || !/port/i.test(report.findings[0].claim))) throw Error("targeted port review differed");
  if (id === "unsupported" && (report.findings.length !== 1 || report.findings[0].verdict !== "incorrect"
    || !/retention\.conf/i.test(report.findings[0].source)
    || report.findings[0].disposition_type !== "flag")) {
    throw Error("unsupported replacement was not flagged");
  }
  if (id === "paused" && (JSON.stringify(report.completed) !== JSON.stringify([setup])
    || JSON.stringify(report.unfinished) !== JSON.stringify(["README.md"]))) throw Error("unfinished report differs");
}

const [host, profile, installed, commit, output, ...selected] = Bun.argv.slice(2);
if (!["codex", "claude"].includes(host) || !profile || !installed || !commit || !output || !selected.length) {
  throw Error("usage: native-trial.ts codex|claude profile installed-plugin source-commit new-output case...");
}
const destination = resolve(output);
mkdirSync(destination, { mode: 0o700 });
const identity = computeComponentIdentity(repo, commit);
const payload = inspectInstalledPayload({ directory: resolve(installed), expected: identity });
const env = withoutGitOverrides();
delete env.GH_TOKEN;
delete env.GITHUB_TOKEN;
delete env.SSH_AUTH_SOCK;
env[host === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR"] = resolve(profile);
const results: Record<string, unknown>[] = [];

for (const id of selected) {
  if (!Object.hasOwn(cases, id)) throw Error(`unknown scenario ${id}`);
  const testCase: TrialCase = cases[id as keyof typeof cases];
  const dir = join(destination, id);
  mkdirSync(dir);
  const project = join(dir, "project");
  cpSync(join(payload.directory, "examples/docs-truth/project"), project, { recursive: true });
  const policy = join(project, ".vh-adlc/docs-truth.md");
  if (id === "noPolicy" || id === "policyLink") unlinkSync(policy);
  if (id === "policyLink") symlinkSync("../README.md", policy);
  if (id === "docLink") symlinkSync("setup.md", join(project, "docs/current/link.md"));
  if (id === "unsupported") {
    writeFileSync(join(project, setup), "# Retained data\n\nData is retained for exactly 30 days.\n");
    writeFileSync(join(project, "config/retention.conf"), "MAX_RETENTION_DAYS=14\nRETENTION_DAYS_IS_SET_BY_OPERATOR=yes\n");
  }
  if (id === "partial" || id === "empty") {
    writeFileSync(join(project, "scripts/select-docs-truth.sh"), id === "partial"
      ? `printf '%s\\t%s\\n' '${setup}' 'never verified'\nprintf '%s\\n' 'inventory failed' >&2\nexit 17\n`
      : "exit 0\n");
  }
  git(project, "init", "-q");
  git(project, "add", ".");
  git(project, "commit", "-qm", "Seed synthetic docs truth project");
  if (id === "untracked") writeFileSync(join(project, "docs/current/untracked.md"), "Untracked fixture claim\n");
  git(project, "status", "--porcelain");
  const before = snapshot(project);
  const prompt = [testCase.automatic ? testCase.ask : `Use ${host === "codex" ? "$" : "/"}${skill}. ${testCase.ask}`,
    reportFormat].join("\n\n");
  const argv = host === "codex"
    ? ["codex", "-a", "never", "exec", "--json", "--sandbox", "read-only", prompt]
    : ["claude", "-p", "--verbose", "--output-format", "stream-json", "--permission-mode", "dontAsk",
      "--tools", "Read,Glob,Grep,Bash,Skill", "--allowedTools", "Read,Glob,Grep,Bash,Skill", "--", prompt];
  const stdout = join(dir, "events.jsonl"), stderr = join(dir, "stderr.log");
  const controller = new AbortController();
  let eventObserved = false;
  let expected = before;
  const watcher = id === "replaced" || id === "interrupted" ? setInterval(() => {
    if (eventObserved || !existsSync(stdout)) return;
    const observed = trace(readFileSync(stdout, "utf8"), host);
    if (id === "replaced" && observed.commands.some((line) => line.includes("ls-tree") && line.includes(setup))
      && !observed.outputs.includes(bodyMarker)) {
      writeFileSync(join(project, setup), "# Changed test input\n\nThe service listens on port 7777.\n");
      expected = snapshot(project);
      eventObserved = true;
    } else if (id === "interrupted" && observed.outputs.includes(bodyMarker) && !observed.outputs.includes("# Example service")) {
      eventObserved = true;
      controller.abort("fixture interrupted before the second document");
    }
  }, 40) : undefined;
  const processResult = await runOwnedClient(argv, { cwd: project, env, stdout, stderr, signal: controller.signal },
    { timeout_ms: 240_000, grace_ms: 500, reap_ms: 2000 }).finally(() => clearInterval(watcher));
  const after = snapshot(project);
  let failure: string | undefined;
  try {
    if (!processResult.confirmed || JSON.stringify(expected) !== JSON.stringify(after)) throw Error("repository changed or process cleanup unconfirmed");
    const raw = readFileSync(stdout, "utf8"), observed = trace(raw, host);
    if (id === "interrupted") {
      if (!eventObserved || !processResult.cancelled || observed.outputs.includes("# Example service")) throw Error("interruption boundary not observed");
    } else {
      if (processResult.exit_code !== 0) throw Error("native process failed");
      const reply = parseReply(raw, host);
      if (id === "replaced") {
        if (!eventObserved || observed.outputs.includes("port 7777") ||
          reply.status !== "failed" && !reply.findings?.some((row: { source: string }) => /3900/.test(row.source))) {
          throw Error("did not stop or use the assessed source after tracked path replacement");
        }
      } else verifyReport(reply, testCase, id);
      verifyReads(observed, id, testCase);
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  results.push({ id, skill, prompt, before, after, ...processResult, failure, transcript: stdout,
    ...(id === "interrupted" && eventObserved ? { forcedCancellation: true } : {}) });
  const result = { host, commit, component: identity.component_sha256, version: identity.plugin_version, results };
  writeFileSync(join(destination, "result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ id, host, pass: !failure, failure }));
}
if (results.some((result) => result.failure)) process.exitCode = 1;
