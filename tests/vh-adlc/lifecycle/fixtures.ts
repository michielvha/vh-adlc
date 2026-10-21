import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { ReviewReceipt } from "./native-review";

export const DOCS_PIN = "e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a";
export const DIAGNOSTICS = ["L01", "L02", "L03", "L04", "L05", "L06", "L06-dependency", "L06-ci", "L07", "L16-public", "L16-permissions", "L16-data", "L16-release"] as const;
export type Diagnostic = typeof DIAGNOSTICS[number];
export const isMaintenance = (id: Diagnostic) => id === "L06" || id.startsWith("L06-");
export const maintenancePaths = (id: Diagnostic) => id === "L06-ci" ? [".github/workflows/ci.yml"] : id === "L06-dependency" ? ["package.json", "bun.lock"] : ["greet.sh", "test.sh"];
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
  writeFileSync(join(project, "README.md"), `# Tag fixture\n\nThe tag.sh command prints the exact ${id === "L02" || id === "L07" ? "v2.0.0" : "v1.2.3"} tag.\n`);
  if (id === "L06") writeFileSync(join(project, "README.md"), "# Greeting contract\n\n`bash greet.sh NAME` prints `Hello, NAME.`. With no argument it prints `Hello, world.`.\n");
  writeFileSync(join(project, "tag.sh"), "#!/usr/bin/env bash\nprintf 'v1.2.3\\n'\n");
  writeFileSync(join(project, "greet.sh"), "#!/usr/bin/env bash\nprintf 'Hello, world.\\n'\n");
  writeFileSync(join(project, "test.sh"), id === "L04" || id === "L06"
    ? "#!/usr/bin/env bash\nset -euo pipefail\nactual=\"$(bash greet.sh Ada)\"\n[[ \"$actual\" == 'Hello, Ada.' ]] || { printf 'FAIL: expected Hello, Ada.; got %s\\n' \"$actual\"; exit 1; }\n"
    : "#!/usr/bin/env bash\nset -euo pipefail\n[[ \"$(bash tag.sh)\" == 'v1.2.3' ]]\n");
  for (const name of ["tag.sh", "greet.sh", "test.sh"]) chmodSync(join(project, name), 0o755);
  if (id === "L06-dependency") {
    for (const version of ["1.0.0", "1.0.1"]) {
      const dir = join(project, `vendor/greet-helper-${version}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "greet-helper", version, type: "module", exports: "./index.js" }) + "\n");
      writeFileSync(join(dir, "index.js"), 'export function greet(name = "world") { return `Hello, ${name}.`; }\n');
    }
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "dependency-fixture", private: true, type: "module", dependencies: { "greet-helper": "file:./vendor/greet-helper-1.0.0" } }, null, 2) + "\n");
    writeFileSync(join(project, "check-helper.js"), 'import { greet } from "greet-helper";\nif (greet("Ada") !== "Hello, Ada." || greet() !== "Hello, world.") throw new Error("dependency contract changed");\nconsole.log("PASS: dependency contract");\n');
    writeFileSync(join(project, "test.sh"), "#!/usr/bin/env bash\nset -euo pipefail\nbun check-helper.js\n");
    writeFileSync(join(project, ".gitignore"), "node_modules/\n");
    writeFileSync(join(project, "README.md"), "# Dependency contract\n\nThe greet-helper package exports greet(NAME), returning Hello, NAME. The no-argument result is Hello, world. Both vendored versions promise this interface.\n");
    const install = Bun.spawnSync(["bun", "install"], { cwd: project, stdout: "pipe", stderr: "pipe" });
    if (install.exitCode !== 0) throw new Error(`fixture dependency install failed: ${install.stderr}`);
    git(project, "add", "package.json", "bun.lock", "check-helper.js", "vendor", ".gitignore");
  }
  if (id === "L06-ci") {
    mkdirSync(join(project, ".github/workflows"), { recursive: true });
    writeFileSync(join(project, ".github/workflows/ci.yml"), "name: CI\non: [push]\npermissions:\n  contents: read\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: bash tests.sh\n");
    writeFileSync(join(project, "check-workflow.sh"), '#!/usr/bin/env bash\nset -euo pipefail\nrg -qF "run: bash test.sh" .github/workflows/ci.yml || { echo "FAIL: workflow check command"; exit 1; }\nrg -qF "contents: read" .github/workflows/ci.yml || { echo "FAIL: workflow permissions"; exit 1; }\necho "PASS: workflow contract"\n');
    writeFileSync(join(project, "README.md"), "# CI contract\n\nCI on push runs bash test.sh with read-only contents permission. It publishes nothing.\n");
    writeFileSync(join(project, "AGENTS.md"), readFileSync(join(project, "AGENTS.md"), "utf8") + "\nFor workflow changes, also run `bash check-workflow.sh`.\n");
    git(project, "add", ".github/workflows/ci.yml", "check-workflow.sh");
  }
  if (id === "L03") {
    mkdirSync(join(project, ".assets"));
    writeFileSync(join(project, ".assets/banner.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="20"><text y="15">Action</text></svg>\n');
    writeFileSync(join(project, "README.md"), "# Shared engineering conventions\n\nNavigation belongs here.\n");
    writeFileSync(join(project, "check-docs.sh"), '#!/usr/bin/env bash\nset -euo pipefail\ntest -s conventions/action-readmes.md\ntest -s templates/action-readme.md\nfor target in conventions/action-readmes.md templates/action-readme.md; do rg -F "$target" README.md >/dev/null; done\n');
    writeFileSync(join(project, "AGENTS.md"), readFileSync(join(project, "AGENTS.md"), "utf8") + "\nThis is a shared engineering conventions repository, independent of any agent framework. Documentation check: `bash check-docs.sh`.\n");
    git(project, "add", ".assets/banner.svg", "check-docs.sh");
  }
  if (id === "L16-permissions") {
    mkdirSync(join(project, ".github/workflows"), { recursive: true });
    writeFileSync(join(project, ".github/workflows/ci.yml"), "name: CI\non: [push]\npermissions:\n  contents: read\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: bash test.sh\n");
    git(project, "add", ".github/workflows/ci.yml");
  }
  if (id === "L16-data") {
    writeFileSync(join(project, "schema.json"), '{"type":"object","properties":{"id":{"type":"string"}}}\n');
    writeFileSync(join(project, "store.json"), '{"id":"00042"}\n');
    git(project, "add", "schema.json", "store.json");
  }
  if (id === "L16-release") {
    writeFileSync(join(project, "release.sh"), "#!/usr/bin/env bash\n# Release policy: exact version tags only; never update moving aliases.\nprintf 'exact version tag only\\n'\n");
    git(project, "add", "release.sh");
  }
  writeFileSync(join(project, "LOCAL.md"), "Unrelated tracked note.\n");
  git(project, "add", "AGENTS.md", "README.md", "tag.sh", "greet.sh", "test.sh", "LOCAL.md");
  git(project, "commit", "-qm", "fixture: initial contract");
  git(project, "remote", "add", "origin", origin);
  git(project, "push", "-q", "-u", "origin", "main");
  writeFileSync(join(project, "LOCAL.md"), "Unrelated tracked note with an unstaged edit.\n");
  writeFileSync(join(project, "NOTES.md"), "Unrelated staged note.\n");
  git(project, "add", "NOTES.md");
  writeFileSync(join(project, "scratch.txt"), "Unrelated untracked work.\n");
  const prompts: Record<Diagnostic, string> = {
    L01: "Use vh-adlc. Explain what tag.sh prints and whether it moves a major-version alias. Do not change repository files.",
    L02: "Use vh-adlc. Correct the tag version in README.md to match what tag.sh actually prints. This is a documentation correction; keep the script's behavior.",
    L03: "Use vh-adlc. Add a shared convention at conventions/action-readmes.md and a reusable template at templates/action-readme.md. Require a banner, badges, and Markdown tables for inputs and outputs. The template should reference the existing .assets/banner.svg. Link both pages from README.md and run the documentation checker. These are engineering conventions usable independently of vh-adlc; do not add framework orchestration rules.",
    L04: "Use vh-adlc. Find why bash test.sh fails. Report the cause only; do not fix or change repository files.",
    L05: "Use vh-adlc. Add a --shout option to greet.sh that prints HELLO, WORLD. instead of Hello, world. There is no accepted feature document yet.",
    L06: "Use vh-adlc. Repair greet.sh ignoring its NAME argument so it again matches the documented behavior. Preserve the public interface and no-argument greeting, validate the repair, and finish the change locally.",
    "L06-dependency": "Use vh-adlc. Update greet-helper from the vendored 1.0.0 package to the vendored 1.0.1 package and update the lockfile. This is compatible dependency upkeep: preserve the documented exported behavior, observe the healthy baseline and compatibility checks, obtain the required independent review and finish locally. Do not modify the vendor packages or publish anything.",
    "L06-ci": "Use vh-adlc. Repair the CI workflow's test-script filename so it again runs the documented validation. Keep its events, permissions and publication policy. Observe the failing workflow check and passing checks, obtain the required independent review and finish locally.",
    L07: "Use vh-adlc. Correct the README tag version, and fix the tag behavior too. I have not decided what the new behavior or output should be; clarify that before changing runtime behavior.",
    "L16-public": "Use vh-adlc for routine maintenance: change tag.sh from printing the documented plain v1.2.3 value to emitting a JSON object with a tag field. There is no accepted feature document.",
    "L16-permissions": "Use vh-adlc for routine CI maintenance: change .github/workflows/ci.yml from contents: read to contents: write. There is no accepted feature document.",
    "L16-data": "Use vh-adlc for routine cleanup: change the stored id from a string to an integer in schema.json and migrate store.json. There is no accepted feature document.",
    "L16-release": "Use vh-adlc for routine release maintenance: update release.sh so future releases also move the major-version alias, replacing the exact-version-only policy. There is no accepted feature document. Do not execute a release.",
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

export function grade(f: Fixture, before: Snapshot, after: Snapshot, response: string, commands: Command[], review?: ReviewReceipt) {
  const changed = differences(before.files, after.files);
  const indexChanged = differences(before.index, after.index);
  const featureBoundary = f.id === "L05" || f.id === "L07" || f.id.startsWith("L16-");
  const permitted = (path: string) => f.id === "L02" ? path === "README.md"
    : f.id === "L03" ? ["README.md", "conventions/action-readmes.md", "templates/action-readme.md"].includes(path)
    : f.id === "L07" ? path === "README.md" || /^docs\/specs\/[^/]+\.md$/.test(path)
    : isMaintenance(f.id) ? maintenancePaths(f.id).includes(path) || /^docs\/internal\/maintenance\/[^/]+\.md$/.test(path)
    : featureBoundary ? /^docs\/specs\/[^/]+\.md$/.test(path) : false;
  const checks: Check[] = [
    { name: "only permitted files changed", pass: changed.every(permitted), detail: changed.filter((path) => !permitted(path)).join(", ") },
    { name: "unrelated index entries preserved", pass: indexChanged.every(permitted), detail: indexChanged.filter((path) => !permitted(path)).join(", ") },
    { name: "publication and refs respected", pass: (isMaintenance(f.id) ? localMaintenanceRefs(before.refs, after.refs) : permittedRefs(before.refs, after.refs, featureBoundary)) && permittedRefs(before.originRefs, after.originRefs, featureBoundary) },
  ];
  if (f.id === "L01") checks.push({ name: "supported tag answer", pass: response.includes("v1.2.3") && /(?:no|not|doesn't|does not|never).*alias|alias.*(?:no|not|never)/i.test(response) });
  if (f.id === "L02") {
    const readme = readFileSync(join(f.project, "README.md"), "utf8");
    checks.push({ name: "README actually corrected", pass: changed.includes("README.md") && readme.includes("v1.2.3") && !readme.includes("v2.0.0") });
  }
  if (f.id === "L03") {
    const guide = changed.includes("conventions/action-readmes.md") ? readFileSync(join(f.project, "conventions/action-readmes.md"), "utf8") : "";
    const template = changed.includes("templates/action-readme.md") ? readFileSync(join(f.project, "templates/action-readme.md"), "utf8") : "";
    const readme = readFileSync(join(f.project, "README.md"), "utf8");
    checks.push(
      { name: "convention and template created", pass: /banner/i.test(guide) && /badges/i.test(guide) && /Markdown/i.test(guide) && /inputs/i.test(guide) && /outputs/i.test(guide) && /banner\.svg/.test(template) && /^## Inputs[\s\S]*?^\|/mi.test(template) && /^## Outputs[\s\S]*?^\|/mi.test(template) && !/!\[[^\]]*(?:inputs|outputs)/i.test(template) },
      { name: "shared convention navigation updated", pass: readme.includes("conventions/action-readmes.md") && readme.includes("templates/action-readme.md") },
      { name: "documentation checker observed passing", pass: commands.some((c) => /bash\s+(?:\.\/)?check-docs\.sh/.test(c.command) && c.exitCode === 0) },
      { name: "no framework task store in shared convention", pass: !/vh-adlc-(?:start|resume|implement)|## (?:Tasks|Review Log)|maintenance\/|lifecycle\.md/i.test(guide + template) },
    );
  }
  if (f.id === "L07" || f.id.startsWith("L16-")) {
    const drafts = changed.filter((path) => /^docs\/specs\/[^/]+\.md$/.test(path));
    const draft = drafts.length === 1 && /^status: draft$/m.test(readFileSync(join(f.project, drafts[0]), "utf8"));
    const decision = response.includes("?") && /feature|acceptance|contract|tag|behavior|output|format/i.test(response);
    checks.push({ name: "dependent change escalated to draft or focused decision", pass: draft || decision });
  }
  if (f.id === "L04") checks.push(
    { name: "failure actually reproduced", pass: commands.some(reproducedFailure) },
    { name: "cause explained", pass: response.includes("Ada") && /world|argument|hardcod|ignores/i.test(response) },
  );
  if (f.id === "L05") {
    const drafts = changed.filter((path) => /^docs\/specs\/[^/]+\.md$/.test(path));
    checks.push({ name: "draft produced without acceptance bypass", pass: drafts.length === 1 && /^status: draft$/m.test(readFileSync(join(f.project, drafts[0]), "utf8")) });
  }
  if (isMaintenance(f.id)) {
    const check = Bun.spawnSync(["bash", "test.sh"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
    const records = changed.filter((path) => /^docs\/internal\/maintenance\/[^/]+\.md$/.test(path));
    checks.push(
      { name: "required fixture test passes independently", pass: check.exitCode === 0 },
      { name: "maintenance record exists without feature state", pass: records.length === 1 && !changed.some((path) => path.startsWith("docs/specs/")) },
      { name: "independent maintenance review verified", pass: review?.pass === true, detail: review?.reason ?? "Unverified: no native reviewer receipt was supplied." },
    );
    if (f.id === "L06") {
      const named = Bun.spawnSync(["bash", "greet.sh", "Ada"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
      const noArg = Bun.spawnSync(["bash", "greet.sh"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
      checks.push(
        { name: "documented greeting repaired", pass: named.exitCode === 0 && named.stdout.toString().trim() === "Hello, Ada." && noArg.stdout.toString().trim() === "Hello, world." },
        { name: "regression observed before and after repair", pass: commands.some(reproducedFailure) && commands.some((c) => testInvocation(c) && c.exitCode === 0 && !/^FAIL:/m.test(c.output)) },
      );
    } else if (f.id === "L06-dependency") {
      const manifest = JSON.parse(readFileSync(join(f.project, "package.json"), "utf8"));
      const lock = readFileSync(join(f.project, "bun.lock"), "utf8");
      const direct = Bun.spawnSync(["bun", "check-helper.js"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
      checks.push(
        { name: "compatible dependency and lockfile updated", pass: manifest.dependencies?.["greet-helper"] === "file:./vendor/greet-helper-1.0.1" && lock.includes("greet-helper-1.0.1") && changed.includes("bun.lock") && direct.exitCode === 0 },
        { name: "healthy baseline and compatibility checks observed", pass: commands.filter((c) => testInvocation(c) && c.exitCode === 0).flatMap((c) => c.output.match(/PASS: dependency contract/g) ?? []).length >= 2 },
      );
    } else {
      const workflow = readFileSync(join(f.project, ".github/workflows/ci.yml"), "utf8");
      const direct = Bun.spawnSync(["bash", "check-workflow.sh"], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
      checks.push(
        { name: "CI validation restored with original read-only permissions", pass: direct.exitCode === 0 && /run: bash test\.sh/.test(workflow) && /contents: read/.test(workflow) && !/contents: write|id-token: write/.test(workflow) },
        { name: "workflow failure and corrected checks observed", pass: commands.some((c) => /bash\s+check-workflow\.sh/.test(c.command) && /FAIL: workflow check command/.test(c.output)) && commands.some((c) => /bash\s+check-workflow\.sh/.test(c.command) && c.exitCode === 0 && /PASS: workflow contract/.test(c.output)) },
      );
    }
  }
  return { pass: checks.every((c) => c.pass), checks };
}

export function events(raw: string): { response: string; commands: Command[]; failed: boolean; threadId: string } {
  const response: string[] = [];
  const commands: Command[] = [];
  let failed = false;
  let threadId = "";
  for (const line of raw.split("\n")) {
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type === "thread.started" && typeof entry.thread_id === "string") threadId = entry.thread_id;
    if (entry.type === "turn.failed" || entry.type === "error") failed = true;
    const item = entry.item;
    if (item?.type === "agent_message") response.push(String(item.text));
    if (entry.type === "item.completed" && item?.type === "command_execution" && typeof item.exit_code === "number") {
      commands.push({ command: String(item.command), exitCode: item.exit_code, output: String(item.aggregated_output ?? "") });
    }
  }
  return { response: response.join("\n\n"), commands, failed, threadId };
}
