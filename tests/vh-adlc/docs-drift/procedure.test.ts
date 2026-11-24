/** Package links, real CLI grammar and a greenfield setup handoff. No provider or tracker access. */
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseRunOptions } from "../../../plugins/vh-adlc/scripts/docs-drift/run-cli";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";

const plugin = resolve(import.meta.dir, "../../../plugins/vh-adlc");
const entry = join(plugin, "scripts/docs-drift/cli.ts");
const references = ["references/docs-drift.md", "references/docs-drift-settings.md", "references/docs-drift-review.md"];
const roots: string[] = [];
let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed docs-drift procedure roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function templates() {
  return references.flatMap(reference => {
    const text = readFileSync(join(plugin, reference), "utf8");
    return [...text.matchAll(/```text\n([\s\S]*?)\n```/gu)]
      .flatMap(match => match[1].replaceAll(/\\\n\s*/gu, " ").trim().split("\n").map(line => line.trim().split(/\s+/u)))
      .filter(words => words[0] === "bun" && words[1]?.endsWith("/scripts/docs-drift/cli.ts"))
      .map(words => ({ reference, script: words[1], argv: words.slice(2) }));
  });
}

function fill(argv: string[], values: Record<string, string> = {}): string[] {
  const placeholders: Record<string, string> = {
    "<repo>": resolve(plugin, "../.."), "<source>": "a".repeat(40), "<original-source>": "a".repeat(40),
    "<run>": "/fixture/run", "<resolution-run>": "/fixture/resolve", "<closure-run>": "/fixture/closure",
    "<restored-run>": "/fixture/restored", "<new-private-external-directory>": "/fixture/restored-trial",
    "<proposal>": "41", "<consolidation>": "42", "<operation>": "fixture-operation",
    "<original-operation>": "fixture-operation", "<definition-sha256>": "c".repeat(64),
    ...values,
  };
  return argv.map(word => {
    if (!word.startsWith("<")) return word;
    const value = placeholders[word];
    if (value === undefined) throw Error("Unknown documented CLI placeholder " + word);
    return value;
  });
}

test("the content entry exposes its canonical procedure, setup and review references", () => {
  const skill = readFileSync(join(plugin, "skills/vh-adlc-docs-drift/SKILL.md"), "utf8");
  const linked = [...skill.matchAll(/`(references\/[^`\s]+\.md)`/gu)].map(match => match[1]);
  for (const reference of references) {
    expect(linked).toContain(reference);
    expect(readFileSync(join(plugin, reference), "utf8").length).toBeGreaterThan(0);
  }
});

test("documented command templates use the production CLI grammar", () => {
  const commands = templates();
  expect(commands.length).toBeGreaterThan(0);
  for (const required of ["scan", "report", "resolve", "prepare", "verify", "publish", "resume", "close"])
    expect(commands.map(template => template.argv[0])).toContain(required);
  for (const template of commands) {
    expect(template.script).toBe("<plugin>/scripts/docs-drift/cli.ts");
    const parsed = parseRunOptions(fill(template.argv));
    expect(String(parsed.command)).toBe(template.argv[0]);
    expect(parsed.repo).toBe(resolve(plugin, "../.."));
    expect(parsed.directory.startsWith("/fixture/")).toBe(true);
    if (parsed.source !== undefined) expect(parsed.source).toBe("a".repeat(40));
  }
});

test("the documented scan hands off missing committed settings and preserves caller state", () => {
  try {
    const template = templates().find(value => value.argv[0] === "scan");
    if (!template) throw Error("Missing documented scanner invocation");
    const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-procedure-")));
    roots.push(root);
    const repo = join(root, "repository with spaces"), artifacts = join(root, "artifacts"), bin = join(root, "bin");
    for (const path of [repo, artifacts, bin]) mkdirSync(path, { mode: 0o700 });
    readGit(repo, "init", "--template=", "-b", "main");
    writeFileSync(join(repo, "README.md"), "Owned greenfield procedure fixture\n");
    readGit(repo, "add", "--", "README.md");
    readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Synthetic procedure source");
    const source = readGit(repo, "rev-parse", "HEAD").toString().trim(), before = captureRepositoryState(repo);
    const trace = join(root, "unexpected-native-access");
    for (const program of ["gh", "copilot", "claude", "codex"]) writeFileSync(join(bin, program),
      "#!" + process.execPath + "\nrequire('node:fs').writeFileSync(" + JSON.stringify(trace) + ", 'Unexpected native access');process.exit(91);\n", { mode: 0o700 });
    const completion = Bun.spawnSync([process.execPath, entry, ...fill(template.argv, { "<repo>": repo, "<source>": source, "<run>": join(root, "run") })], {
      env: { PATH: bin + ":" + (process.env.PATH ?? "/usr/bin:/bin"), LANG: "C", LC_ALL: "C", BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
      stdout: "pipe", stderr: "pipe", timeout: 10000,
    });
    const report = JSON.parse(completion.stdout.toString());
    expect(completion.exitCode).toBe(2);
    expect(report).toMatchObject({ schema_version: 1, command: "scan", outcome: "setup-required" });
    expect(report.diagnostics.length).toBeGreaterThan(0);
    expect(existsSync(trace)).toBe(false);
    expect(captureRepositoryState(repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 30000);
