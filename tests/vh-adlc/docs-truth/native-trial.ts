// Explicit model trial on the synthetic project. Ordinary tests do not call a model.
import { createHash } from "node:crypto";
import { cpSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { computeComponentIdentity, inspectInstalledPayload } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { runOwnedClient } from "../../../plugins/vh-adlc/scripts/triage/owned-process";

const repo = resolve(import.meta.dir, "../../..");
const skill = "vh-adlc:vh-adlc-docs-truth";
const setup = "docs/current/setup.md";
const reportFormat = "Finish with a single JSON object containing status (complete, failed or clarification), "
  + "mode, paths (the ordered paths selected for claim review), coverage (full, targeted or none), and findings "
  + "(an array of claim, verdict, source and disposition strings). Put diagnostic details in a message string. "
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
} satisfies Record<string, TrialCase>;

type TrialCase = { ask: string; mode?: string; paths: string[]; coverage: string; status?: string; automatic?: boolean };

function git(cwd: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", "-C", cwd, "-c", "user.name=Docs Fixture",
    "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], {
    stdout: "pipe", stderr: "pipe",
  });
  if (result.exitCode !== 0) throw Error(result.stderr.toString());
  return result.stdout.toString().trim();
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
  return { files: hash.digest("hex"), head: git(dir, "rev-parse", "HEAD") };
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

function verifyReport(report: Record<string, unknown>, selected: TrialCase, id: string) {
  if (report.status !== (selected.status ?? "complete") || selected.mode && report.mode !== selected.mode
    || JSON.stringify(report.paths) !== JSON.stringify(selected.paths) || report.coverage !== selected.coverage) {
    throw Error("native report status, scope or coverage differed");
  }
  if (!Array.isArray(report.findings)) throw Error("missing findings inventory");
  if (["report", "partial", "empty", "ambiguous"].includes(id) && report.findings.length) throw Error("unexpected claim review");
  if (["default", "intake", "sized"].includes(id)) {
    const expected = [
      [/9000|port/i, "incorrect", /service\.conf.*3900|service\.conf/i],
      [/make start/i, "accurate", /Makefile/i],
      [/external.*backend/i, "accurate", /service\.conf/i],
      [/workers/i, "unknown", /workers|config|source/i],
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
  }
  if (id === "sweep" && (report.findings.length !== 1 || report.findings[0].verdict !== "incorrect"
    || !/port/i.test(report.findings[0].claim))) throw Error("targeted port review differed");
}

const [host, profile, installed, commit, output, ...selected] = Bun.argv.slice(2);
if (!["codex", "claude"].includes(host) || !profile || !installed || !commit || !output || !selected.length) {
  throw Error("usage: native-trial.ts codex|claude profile installed-plugin source-commit new-output case...");
}
const destination = resolve(output);
mkdirSync(destination, { mode: 0o700 });
const identity = computeComponentIdentity(repo, commit);
const payload = inspectInstalledPayload({ directory: resolve(installed), expected: identity });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:GIT_.*|GH_TOKEN|GITHUB_TOKEN)$/.test(key)));
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
  const processResult = await runOwnedClient(argv, { cwd: project, env, stdout, stderr },
    { timeout_ms: 240_000, grace_ms: 500, reap_ms: 2000 });
  const after = snapshot(project);
  let failure: string | undefined;
  try {
    if (processResult.exit_code !== 0 || !processResult.confirmed) throw Error("native process failed or cleanup unconfirmed");
    if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("report changed the assessed project");
    const reply = parseReply(readFileSync(stdout, "utf8"), host);
    verifyReport(reply, testCase, id);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  results.push({ id, skill, prompt, before, after, ...processResult, failure, transcript: stdout });
  const result = { host, commit, component: identity.component_sha256, version: identity.plugin_version, results };
  writeFileSync(join(destination, "result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ id, host, pass: !failure, failure }));
}
if (results.some((result) => result.failure)) process.exitCode = 1;
