import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export const DOCS_PIN = "e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a";
export type Diagnostic = "L01" | "L02" | "L04" | "L05" | "L06";
export type Fixture = { id: Diagnostic; project: string; origin: string; prompt: string };
export type Command = { command: string; exitCode: number; output: string };
type File = { hash: string; mode: number };
export type Snapshot = { files: Record<string, File>; index: Record<string, string>; refs: string; originRefs: string };
export type Check = { name: string; pass: boolean; detail?: string };

function hash(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
export function git(cwd: string, ...args: string[]): string {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  const r = Bun.spawnSync(["git", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args[0]}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

function files(root: string): Record<string, File> {
  const result: Record<string, File> = {};
  function walk(dir: string) {
    for (const entry of readdirSync(dir).sort()) {
      if (entry === ".git" || entry === "node_modules") continue;
      const path = join(dir, entry);
      const stat = lstatSync(path);
      if (stat.isDirectory()) walk(path);
      else result[relative(root, path)] = {
        hash: hash(stat.isSymbolicLink() ? readlinkSync(path) : readFileSync(path)),
        mode: stat.mode & 0o777,
      };
    }
  }
  walk(root);
  return result;
}

export function fingerprint(root: string): string { return hash(JSON.stringify(files(root))); }

export function snapshot(f: Fixture): Snapshot {
  const index: Record<string, string> = {};
  for (const line of git(f.project, "ls-files", "--stage").split("\n")) {
    if (line) index[line.slice(line.indexOf("\t") + 1)] = line.slice(0, line.indexOf("\t"));
  }
  return {
    files: files(f.project), index,
    refs: git(f.project, "for-each-ref", "--format=%(refname) %(objectname)"),
    originRefs: git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)"),
  };
}

export function buildDiagnostic(root: string, id: Diagnostic): Fixture {
  const project = join(root, "project");
  const origin = join(root, "origin.git");
  mkdirSync(project, { recursive: true });
  mkdirSync(origin, { recursive: true });
  git(project, "init", "-q", "-b", "main");
  git(origin, "init", "-q", "--bare", "--initial-branch=main");
  git(project, "config", "user.name", "Fixture");
  git(project, "config", "user.email", "fixture@example.com");
  git(project, "config", "commit.gpgsign", "false");
  writeFileSync(join(project, "AGENTS.md"), `# Repository instructions\n\nRead https://github.com/vhco-pro/docs/blob/${DOCS_PIN}/AGENTS.md and its relevant task routes.\n\nFeature documents: docs/specs/\n\nChecks: run \`bash test.sh\` for executable changes.\n`);
  writeFileSync(join(project, "README.md"), `# Tag fixture\n\nThe tag.sh command prints the exact ${id === "L02" ? "v2.0.0" : "v1.2.3"} tag.\n`);
  if (id === "L06") writeFileSync(join(project, "README.md"), "# Greeting contract\n\n`bash greet.sh NAME` prints `Hello, NAME.`. With no argument it prints `Hello, world.`.\n");
  writeFileSync(join(project, "tag.sh"), "#!/usr/bin/env bash\nprintf 'v1.2.3\\n'\n");
  writeFileSync(join(project, "greet.sh"), "#!/usr/bin/env bash\nprintf 'Hello, world.\\n'\n");
  writeFileSync(join(project, "test.sh"), id === "L04" || id === "L06"
    ? "#!/usr/bin/env bash\nset -euo pipefail\nactual=\"$(bash greet.sh Ada)\"\n[[ \"$actual\" == 'Hello, Ada.' ]] || { printf 'FAIL: expected Hello, Ada.; got %s\\n' \"$actual\"; exit 1; }\n"
    : "#!/usr/bin/env bash\nset -euo pipefail\n[[ \"$(bash tag.sh)\" == 'v1.2.3' ]]\n");
  for (const name of ["tag.sh", "greet.sh", "test.sh"]) chmodSync(join(project, name), 0o755);
  git(project, "add", "AGENTS.md", "README.md", "tag.sh", "greet.sh", "test.sh");
  git(project, "commit", "-qm", "fixture: initial contract");
  git(project, "remote", "add", "origin", origin);
  git(project, "push", "-q", "-u", "origin", "main");
  writeFileSync(join(project, "NOTES.md"), "Unrelated staged note.\n");
  git(project, "add", "NOTES.md");
  writeFileSync(join(project, "scratch.txt"), "Unrelated untracked work.\n");
  const prompts: Record<Diagnostic, string> = {
    L01: "Use vh-adlc. Explain what tag.sh prints and whether it moves a major-version alias. Do not change repository files.",
    L02: "Use vh-adlc. Correct the tag version in README.md to match what tag.sh actually prints. This is a documentation correction; keep the script's behavior.",
    L04: "Use vh-adlc. Find why bash test.sh fails. Report the cause only; do not fix or change repository files.",
    L05: "Use vh-adlc. Add a --shout option to greet.sh that prints HELLO, WORLD. instead of Hello, world. There is no accepted feature document yet.",
    L06: "Use vh-adlc. Repair greet.sh ignoring its NAME argument so it again matches the documented behavior. Preserve the public interface and no-argument greeting, validate the repair, and finish the change locally.",
  };
  return { id, project, origin, prompt: prompts[id] };
}

function differences<T>(a: Record<string, T>, b: Record<string, T>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}

function permittedRefs(before: string, after: string, allowMain: boolean): boolean {
  const parse = (text: string) => Object.fromEntries(text.split("\n").filter(Boolean).map((line) => line.split(" ")));
  const a = parse(before), b = parse(after);
  return differences(a, b).every((name) => allowMain && ["refs/heads/main", "refs/remotes/origin/main"].includes(name) && a[name] && b[name]);
}

function localMaintenanceRefs(before: string, after: string): boolean {
  const parse = (text: string) => Object.fromEntries(text.split("\n").filter(Boolean).map((line) => line.split(" ")));
  const a = parse(before), b = parse(after);
  const changed = differences(a, b);
  return changed.length <= 1 && changed.every((name) => /^refs\/heads\/(?:fix|chore)\//.test(name) && b[name]);
}

function testInvocation(c: Command): boolean { return /(?:\bbash\s+(?:['"])?(?:\.\/)?test\.sh|\.\/test\.sh)/.test(c.command); }
function reproducedFailure(c: Command): boolean {
  return testInvocation(c) && (c.exitCode !== 0 && /FAIL|expected/i.test(c.output)
    || /^FAIL: expected Hello, Ada\.; got Hello, world\.$/m.test(c.output));
}

export function grade(f: Fixture, before: Snapshot, after: Snapshot, response: string, commands: Command[]) {
  const changed = differences(before.files, after.files);
  const indexChanged = differences(before.index, after.index);
  const permitted = (path: string) => f.id === "L02" ? path === "README.md"
    : f.id === "L06" ? ["greet.sh", "test.sh"].includes(path) || /^docs\/internal\/maintenance\/[^/]+\.md$/.test(path)
    : f.id === "L05" ? /^docs\/specs\/[^/]+\.md$/.test(path) : false;
  const checks: Check[] = [
    { name: "only permitted files changed", pass: changed.every(permitted), detail: changed.filter((path) => !permitted(path)).join(", ") },
    { name: "unrelated index entries preserved", pass: indexChanged.every(permitted), detail: indexChanged.filter((path) => !permitted(path)).join(", ") },
    { name: "publication and refs respected", pass: (f.id === "L06" ? localMaintenanceRefs(before.refs, after.refs) : permittedRefs(before.refs, after.refs, f.id === "L05")) && permittedRefs(before.originRefs, after.originRefs, f.id === "L05") },
  ];
  if (f.id === "L01") checks.push({ name: "supported tag answer", pass: response.includes("v1.2.3") && /(?:no|not|doesn't|does not|never).*alias|alias.*(?:no|not|never)/i.test(response) });
  if (f.id === "L02") {
    const readme = readFileSync(join(f.project, "README.md"), "utf8");
    checks.push({ name: "README actually corrected", pass: changed.includes("README.md") && readme.includes("v1.2.3") && !readme.includes("v2.0.0") });
  }
  if (f.id === "L04") checks.push(
    { name: "failure actually reproduced", pass: commands.some(reproducedFailure) },
    { name: "cause explained", pass: response.includes("Ada") && /world|argument|hardcod|ignores/i.test(response) },
  );
  if (f.id === "L05") {
    const drafts = changed.filter((path) => /^docs\/specs\/[^/]+\.md$/.test(path));
    checks.push({ name: "draft produced without acceptance bypass", pass: drafts.length === 1 && /^status: draft$/m.test(readFileSync(join(f.project, drafts[0]), "utf8")) });
  }
  if (f.id === "L06") {
    const check = Bun.spawnSync(["bash", "test.sh"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
    const named = Bun.spawnSync(["bash", "greet.sh", "Ada"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
    const noArg = Bun.spawnSync(["bash", "greet.sh"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
    const records = changed.filter((path) => /^docs\/internal\/maintenance\/[^/]+\.md$/.test(path));
    checks.push(
      { name: "documented greeting repaired", pass: check.exitCode === 0 && named.exitCode === 0 && named.stdout.toString().trim() === "Hello, Ada." && noArg.stdout.toString().trim() === "Hello, world." },
      { name: "regression observed before and after repair", pass: commands.some(reproducedFailure) && commands.some((c) => testInvocation(c) && c.exitCode === 0 && !/^FAIL:/m.test(c.output)) },
      { name: "maintenance record exists without feature state", pass: records.length === 1 && !changed.some((path) => path.startsWith("docs/specs/")) },
    );
  }
  return { pass: checks.every((c) => c.pass), checks };
}

export function events(raw: string): { response: string; commands: Command[]; failed: boolean } {
  const response: string[] = [];
  const commands: Command[] = [];
  let failed = false;
  for (const line of raw.split("\n")) {
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type === "turn.failed" || entry.type === "error") failed = true;
    const item = entry.item;
    if (item?.type === "agent_message") response.push(String(item.text));
    if (entry.type === "item.completed" && item?.type === "command_execution" && typeof item.exit_code === "number") {
      commands.push({ command: String(item.command), exitCode: item.exit_code, output: String(item.aggregated_output ?? "") });
    }
  }
  return { response: response.join("\n\n"), commands, failed };
}
