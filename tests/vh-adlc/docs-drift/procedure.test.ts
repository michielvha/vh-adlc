/** Package links, real CLI grammar and a greenfield setup handoff. No provider or tracker access. */
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { argumentsForCommand } from "../../../plugins/vh-adlc/scripts/docs-drift/cli";
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
      .map(match => match[1].replaceAll(/\\\n\s*/gu, " ").trim().split(/\s+/u))
      .filter(words => words[0] === "bun" && words[1] === "<plugin>/scripts/docs-drift/cli.ts")
      .map(words => ({ reference, argv: words.slice(2) }));
  });
}

function fill(argv: string[], values: Record<string, string> = {}): string[] {
  const placeholders: Record<string, string> = {
    "<repo>": "/fixture/repository", "<candidate-repo>": "/fixture/candidate",
    "<source>": "a".repeat(40), "<candidate>": "b".repeat(40), "<artifacts>": "/fixture/artifacts",
    "<cache>": "/fixture/cache", "<entry>": "copilot", "<launcher>": "/fixture/repository/scripts/docs-drift-entry.ts",
    "<settings>": "/fixture/repository/.vh-adlc/docs-drift.yaml", "<sha256>": "c".repeat(64),
    "<source-verification>": "source-verification.json", "<decisions>": "decisions.json",
    "<assessment>": "assessment.json", "<selection>": "selection.json", "<worker-capture>": "worker.json",
    "<reviewer-capture>": "reviewer.json", "<candidate-verification>": "verification.json",
    "<authority>": "authority.json", "<journal>": "/fixture/artifacts/journal", "<operation>": "fixture-operation",
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
  for (const required of ["scan", "collect-resolution", "collect-closure", "collect-closure-target"])
    expect(commands.map(template => template.argv[0])).toContain(required);
  for (const template of commands) {
    const parsed = argumentsForCommand(fill(template.argv));
    expect(parsed.command).toBe(template.argv[0]);
    expect(parsed.repo).toBe("/fixture/repository");
    expect(parsed.source).toBe("a".repeat(40));
    if (parsed.entry !== undefined) expect(["hosted", "copilot", "claude"]).toContain(parsed.entry);
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
    const completion = Bun.spawnSync([process.execPath, entry, ...fill(template.argv, { "<repo>": repo, "<source>": source, "<artifacts>": artifacts })], {
      env: { PATH: bin + ":" + (process.env.PATH ?? "/usr/bin:/bin"), LANG: "C", LC_ALL: "C", BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
      stdout: "pipe", stderr: "pipe", timeout: 10000,
    });
    const report = JSON.parse(completion.stdout.toString());
    expect(completion.exitCode).toBe(2);
    expect(report).toMatchObject({ schema_version: 1, command: "scan", outcome: "incomplete" });
    expect(report.diagnostics.length).toBeGreaterThan(0);
    expect(existsSync(trace)).toBe(false);
    expect(captureRepositoryState(repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 30000);
