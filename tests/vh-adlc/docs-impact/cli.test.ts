import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = mkdtempSync(join(tmpdir(), "vh-docs-cli-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const cli = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-impact/cli.ts");
function git(...args: string[]) {
  const run = Bun.spawnSync(["git", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (run.exitCode) throw Error(run.stderr.toString());
}
git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
mkdirSync(join(root, "docs"));
writeFileSync(join(root, "docs/guide.md"), "---\ncovers: ['src/**']\n---\nGuide.\n");
writeFileSync(join(root, "AGENTS.md"), 'Documentation impact roots: ["docs"]\n');
git("add", "."); git("commit", "-qm", "fixture");
function run(args: string[], stdin = Buffer.alloc(0)) {
  const child = Bun.spawnSync(["bun", cli, ...args], { cwd: tmpdir(), stdin, stdout: "pipe", stderr: "pipe" });
  return child;
}
const args = ["check", "--repo", root];

test("JSON and text expose the same candidates and coverage-only meaning", () => {
  const json = run([...args, "--path", "src/app.ts"]); expect(json.exitCode).toBe(0);
  const report = JSON.parse(json.stdout.toString());
  expect(report.protocol).toBe(1); expect(report.schema_version).toBe(1); expect(report.outcome).toBe("candidates");
  expect(report.candidates[0].coverage_only).toBe(true); expect(report.candidates[0].path).toBe("docs/guide.md");
  const text = run([...args, "--path", "src/app.ts", "--format", "text"]);
  expect(text.exitCode).toBe(0); expect(text.stdout.toString()).toContain("docs/guide.md"); expect(text.stdout.toString()).toContain("coverage-only");
  expect(run([...args, "--path", "unmatched"]).stdout.toString()).toContain('"outcome":"none"');
});

test("NUL input handles literal whitespace, quotes, backslashes, Unicode, option-like and newline paths", () => {
  const names = ['src/a b.ts', 'src/"quote.ts', 'src/back\\slash.ts', 'src/é.ts', 'src/line\nnext.ts', '--option'];
  const result = run([...args, "--paths0-from", "-"], Buffer.from(names.join("\0") + "\0"));
  expect(result.exitCode).toBe(0); expect(JSON.parse(result.stdout.toString()).source.paths).toEqual(names.sort());
  const selected = run([...args, "--path=--option", "--path", "src/back\\slash.ts"]);
  expect(selected.exitCode).toBe(0); expect(JSON.parse(selected.stdout.toString()).source.paths).toContain("--option");
});

const invalidRequests: string[][] = [
  [], ["--path"], ["--unknown"], ["--format", "yaml"], ["--repo", root],
  ["--repo", root, "--repo", root], ["--path", "../escape"], ["--path", "/absolute"],
  ["--base", "missing"], ["--docs-root", "absent", "--path", "src/app.ts"],
];
test.each(invalidRequests.map(extra => [extra]))("invalid or incomplete request %j returns structured exit 2", extra => {
  // No source selection is itself a gap; roots is the separate no-scope command.
  const result = run([...args, ...extra]); expect(result.exitCode).toBe(2);
  expect(JSON.parse(result.stdout.toString()).outcome).toBe("incomplete");
  expect(result.stderr.toString()).toBe("");
});

test("rejects malformed NUL/UTF-8 inputs and reports readable input failures", () => {
  for (const bytes of [Buffer.from("src/a\0\0"), Buffer.from("src/a"), Buffer.from([0xff, 0])]) {
    const result = run([...args, "--paths0-from", "-"], bytes); expect(result.exitCode).toBe(2); expect(JSON.parse(result.stdout.toString()).outcome).toBe("incomplete");
  }
  expect(run([...args, "--paths0-from", join(root, "missing")]).exitCode).toBe(2);
});

test("roots resolves declared committed policy without selecting changes", () => {
  const result = run(["roots", "--repo", root]); expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString()).roots).toEqual(["docs"]);
  const before = readFileSync(join(root, ".git/index"));
  run([...args, "--path", "src/app.ts"]);
  expect(readFileSync(join(root, ".git/index"))).toEqual(before);
  expect(run(["roots", "--repo", root, "--path", "src/a"]).exitCode).toBe(2);
});

test("real checker refuses an unavailable locked reader offline without downloading or writing its cache", () => {
  const isolated = mkdtempSync(join(tmpdir(), "vh-docs-offline-cli-"));
  try {
    const plugin = resolve(import.meta.dir, "../../../plugins/vh-adlc"), copied = join(isolated, "plugin");
    mkdirSync(join(copied, "scripts/docs-impact"), { recursive: true });
    for (const file of ["scripts/docs-impact/cli.ts", "scripts/docs-impact/collection.ts", "scripts/docs-impact/matching.ts", "scripts/settings-file.ts", "scripts/ensure-vh-adlc.sh", "vh-adlc.lock.json"]) {
      writeFileSync(join(copied, file), readFileSync(join(plugin, file)));
    }
    const lock = JSON.parse(readFileSync(join(copied, "vh-adlc.lock.json"), "utf8")); lock.version = `99999.${process.pid}.0`;
    writeFileSync(join(copied, "vh-adlc.lock.json"), JSON.stringify(lock, null, 2) + "\n");
    const cache = join(isolated, "cache"), bin = join(isolated, "bin"), fetched = join(isolated, "network-attempt"); mkdirSync(bin);
    writeFileSync(join(bin, "curl"), `#!/bin/sh\nprintf attempted > '${fetched}'\nexit 99\n`, { mode: 0o700 });
    const child = Bun.spawnSync(["bun", join(copied, "scripts/docs-impact/cli.ts"), ...args, "--path", "src/app.ts"], {
      stdout: "pipe", stderr: "pipe", env: { ...process.env, XDG_CACHE_HOME: cache, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", PATH: bin + ":" + process.env.PATH },
    });
    expect(child.exitCode).toBe(2); expect(JSON.parse(child.stdout.toString()).outcome).toBe("incomplete");
    expect(existsSync(cache)).toBe(false); expect(existsSync(fetched)).toBe(false);
  } finally { rmSync(isolated, { recursive: true, force: true }); }
});
