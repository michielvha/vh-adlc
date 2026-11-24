// A stand-in for the GitHub CLI in scenarios that must not reach GitHub (S17.followup). A wrapper script
// named gh runs it with the path of its state file; every call is appended to <state>.calls as one JSON
// line. It serves one repository's labels, issues and pull requests from the state file, creates issues
// and pull requests there, refuses merges and token reads, and fails the issue creations the state names
// (by attempt number, counted over every creation path).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

type Issue = { number: number; title: string; body: string; labels: string[]; state: string };
type PR = { number: number; title: string; body: string; headRefName: string; baseRefName: string; state: "OPEN" | "MERGED" | "CLOSED"; mergedAt: string | null; mergeCommit: string | null; headRefOid: string };
export type StubState = {
  host: string;
  repository: string;
  actor: string;
  labels: { name: string; color: string; description: string }[];
  issues: Issue[];
  prs: PR[];
  fail_issue_attempts: number[];
  issue_attempts: number;
};

const [statePath, ...args] = process.argv.slice(2);
if (!statePath) throw new Error("state path missing");
const state = JSON.parse(readFileSync(statePath, "utf8")) as StubState;
appendFileSync(`${statePath}.calls`, `${JSON.stringify({ args, cwd: process.cwd() })}\n`);

const BOOLEAN = new Set(["--draft", "--paginate", "--web", "--fill", "--silent", "--verbose", "--include", "-i", "--squash", "--merge", "--rebase", "--auto", "--delete-branch", "--admin", "--yes", "-y", "--no-maintainer-edit"]);
const positional: string[] = [];
const flags: Record<string, string[]> = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("-") && a !== "-") {
    const eq = a.indexOf("=");
    if (a.startsWith("--") && eq > 0) (flags[a.slice(0, eq)] ??= []).push(a.slice(eq + 1));
    else if (BOOLEAN.has(a)) (flags[a] ??= []).push("true");
    else (flags[a] ??= []).push(args[++i] ?? "");
  } else positional.push(a);
}
const flag = (...names: string[]) => names.map((n) => flags[n]?.at(-1)).find((v) => v !== undefined);
const base = `https://${state.host}/${state.repository}`;
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
const nextNumber = () => Math.max(0, ...state.issues.map((x) => x.number), ...state.prs.map((x) => x.number)) + 1;

function issueView(x: Issue) {
  return { number: x.number, title: x.title, body: x.body, url: `${base}/issues/${x.number}`, html_url: `${base}/issues/${x.number}`, state: x.state, labels: x.labels.map((name) => ({ name })), createdAt: "2026-11-23T00:00:00Z" };
}
function prView(x: PR) {
  return {
    number: x.number, title: x.title, body: x.body, url: `${base}/pull/${x.number}`, html_url: `${base}/pull/${x.number}`, state: x.state, headRefName: x.headRefName, baseRefName: x.baseRefName,
    mergedAt: x.mergedAt, merged: x.state === "MERGED", closed: x.state !== "OPEN", isDraft: false, mergeCommit: x.mergeCommit ? { oid: x.mergeCommit } : null, headRefOid: x.headRefOid,
    head: { ref: x.headRefName, sha: x.headRefOid }, base: { ref: x.baseRefName }, merge_commit_sha: x.mergeCommit, merged_at: x.mergedAt,
  };
}

// emit prints a value as gh would for --json and --jq; without --json it prints a short table.
function emit(value: unknown, table?: () => string) {
  const fields = flag("--json");
  let out: unknown = value;
  if (fields && fields !== "true") {
    const keys = fields.split(",").map((k) => k.trim()).filter(Boolean);
    const pick = (o: Record<string, unknown>) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));
    out = Array.isArray(value) ? value.map((v) => pick(v as Record<string, unknown>)) : pick(value as Record<string, unknown>);
  } else if (!fields && table && positional[0] !== "api") {
    process.stdout.write(table());
    return;
  }
  const jq = flag("--jq", "-q");
  if (jq) {
    const r = Bun.spawnSync(["jq", "-r", jq], { stdin: Buffer.from(JSON.stringify(out)), stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) fail(r.stderr.toString());
    process.stdout.write(r.stdout.toString());
    return;
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

function readBody(): string {
  const file = flag("--body-file", "-F");
  if (file) return file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
  return flag("--body", "-b") ?? "";
}

function createIssue(title: string, body: string, labels: string[]): Issue {
  state.issue_attempts += 1;
  if (state.fail_issue_attempts.includes(state.issue_attempts)) {
    save();
    fail("HTTP 502: Bad Gateway (https://api.github.com/repos/" + state.repository + "/issues)");
  }
  const issue = { number: nextNumber(), title, body, labels, state: "OPEN" };
  state.issues.push(issue);
  save();
  return issue;
}

function currentBranch(): string {
  const r = Bun.spawnSync(["git", "branch", "--show-current"], { stdout: "pipe", stderr: "pipe" });
  return r.stdout.toString().trim();
}

function findPR(ref: string | undefined): PR | undefined {
  const key = ref ?? currentBranch();
  const n = Number(key.replace(/^#/, "").replace(/.*\/pull\//, ""));
  if (Number.isInteger(n) && n > 0) return state.prs.find((x) => x.number === n);
  return [...state.prs].reverse().find((x) => x.headRefName === key);
}

const repo = flag("-R", "--repo");
if (repo && repo.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "") !== state.repository) fail(`fixture serves only ${state.repository}`);
const hostname = flag("--hostname");
if (hostname && hostname !== state.host) fail("unexpected host");

const [group, action, target] = positional;
const issueTable = (list: Issue[]) => list.map((x) => `${x.number}\t${x.state}\t${x.title}\n`).join("");
const prTable = (list: PR[]) => list.map((x) => `${x.number}\t${x.title}\t${x.headRefName}\t${x.state}\n`).join("");

if (group === "auth" && action === "status") {
  process.stdout.write(`${state.host}\n  Logged in to ${state.host} account ${state.actor} (keyring)\n  Active account: true\n`);
} else if (group === "auth") {
  fail("the fixture gh holds no token");
} else if (group === "repo" && action === "view") {
  emit({ name: state.repository.split("/")[1], nameWithOwner: state.repository, owner: { login: state.repository.split("/")[0] }, url: base, defaultBranchRef: { name: "main" }, visibility: "PRIVATE", isPrivate: true }, () => `${state.repository}\n`);
} else if (group === "label" && action === "list") {
  emit(state.labels, () => state.labels.map((l) => `${l.name}\t${l.description}\n`).join(""));
} else if (group === "issue" && action === "list") {
  const st = (flag("--state", "-s") ?? "open").toLowerCase();
  const limit = Number(flag("--limit", "-L") ?? 30);
  const list = state.issues.filter((x) => st === "all" || x.state.toLowerCase() === st).sort((a, b) => b.number - a.number).slice(0, limit);
  emit(list.map(issueView), () => issueTable(list));
} else if (group === "issue" && action === "view") {
  const x = state.issues.find((i) => i.number === Number(String(target).replace(/.*\/issues\//, "").replace(/^#/, "")));
  if (!x) fail("issue not found");
  emit(issueView(x!), () => `${x!.title}\n\n${x!.body}\n`);
} else if (group === "issue" && action === "create") {
  const x = createIssue(flag("--title", "-t") ?? "", readBody(), flags["--label"] ?? flags["-l"] ?? []);
  process.stdout.write(`${base}/issues/${x.number}\n`);
} else if ((group === "issue" || group === "pr") && action === "comment") {
  process.stdout.write(`${base}/${group === "pr" ? "pull" : "issues"}/${target}#issuecomment-1\n`);
} else if (group === "pr" && action === "list") {
  const st = (flag("--state", "-s") ?? "open").toLowerCase();
  const head = flag("--head", "-H");
  const list = state.prs.filter((x) => (st === "all" || x.state.toLowerCase() === st) && (!head || x.headRefName === head)).sort((a, b) => b.number - a.number);
  emit(list.map(prView), () => prTable(list));
} else if (group === "pr" && (action === "view" || action === "status")) {
  const x = findPR(action === "view" ? target : undefined);
  if (!x) fail(`no pull requests found for branch "${target ?? currentBranch()}"`);
  emit(prView(x!), () => `${x!.title} #${x!.number}\n${x!.state}\n\n${x!.body}\n`);
} else if (group === "pr" && action === "create") {
  const head = flag("--head", "-H") ?? currentBranch();
  if (state.prs.some((x) => x.headRefName === head && x.state === "OPEN")) fail(`a pull request for branch "${head}" into branch "main" already exists`);
  const sha = Bun.spawnSync(["git", "rev-parse", "HEAD"], { stdout: "pipe" }).stdout.toString().trim();
  const pr: PR = { number: nextNumber(), title: flag("--title", "-t") ?? "", body: readBody(), headRefName: head, baseRefName: flag("--base", "-B") ?? "main", state: "OPEN", mergedAt: null, mergeCommit: null, headRefOid: sha };
  state.prs.push(pr);
  save();
  process.stdout.write(`${base}/pull/${pr.number}\n`);
} else if (group === "pr" && action === "edit") {
  const x = findPR(target);
  if (!x) fail("pull request not found");
  if (flag("--title", "-t")) x!.title = flag("--title", "-t")!;
  if (flag("--body", "-b", "--body-file", "-F") !== undefined) x!.body = readBody();
  save();
  process.stdout.write(`${base}/pull/${x!.number}\n`);
} else if (group === "pr" && action === "merge") {
  fail("the fixture refuses merges");
} else if (group === "api") {
  const method = (flag("-X", "--method") ?? (flags["--input"] || flags["-f"] || flags["-F"] || flags["--field"] || flags["--raw-field"] ? "POST" : "GET")).toUpperCase();
  const endpoint = (action ?? "").replace(/^\//, "").replace("{owner}/{repo}", state.repository);
  const [path, query = ""] = endpoint.split("?");
  const params = new URLSearchParams(query);
  const prefix = `repos/${state.repository}`;
  if (path === "user") emit({ login: state.actor });
  else if (path === prefix) emit({ full_name: state.repository, default_branch: "main", private: true, html_url: base });
  else if (path === `${prefix}/labels` && method === "GET") {
    const size = Number(params.get("per_page") ?? 30), page = Number(params.get("page") ?? 1);
    emit(state.labels.slice((page - 1) * size, page * size));
  } else if (path === `${prefix}/issues` && method === "POST") {
    const input = flags["--input"] ? JSON.parse(readFileSync(0, "utf8")) : {};
    const x = createIssue(String(input.title ?? flag("-f", "--raw-field")?.replace(/^title=/, "") ?? ""), String(input.body ?? ""), (input.labels ?? []) as string[]);
    emit({ number: x.number, html_url: `${base}/issues/${x.number}`, url: `https://api.${state.host}/${prefix}/issues/${x.number}` });
  } else if (path === `${prefix}/issues` && method === "GET") {
    emit(state.issues.map((x) => ({ ...issueView(x), state: x.state.toLowerCase() })));
  } else if (path === `${prefix}/pulls` && method === "GET") {
    const head = params.get("head")?.split(":").at(-1);
    const st = params.get("state") ?? "open";
    emit(state.prs.filter((x) => (st === "all" || (st === "open" ? x.state === "OPEN" : x.state !== "OPEN")) && (!head || x.headRefName === head)).map(prView));
  } else if (path.startsWith(`${prefix}/pulls/`) && method === "GET") {
    const x = state.prs.find((p) => p.number === Number(path.split("/")[4]));
    if (!x) fail("Not Found (HTTP 404)");
    emit(prView(x!));
  } else fail(`the fixture gh does not serve ${method} ${endpoint}`);
} else {
  fail(`the fixture gh does not support: gh ${args.join(" ")}`);
}

// Exported only for the type; the stub runs as a script.
export {};
void existsSync;
