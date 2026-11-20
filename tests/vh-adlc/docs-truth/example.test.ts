import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const example = resolve(import.meta.dir, "../../../plugins/vh-adlc/examples/docs-truth/project");

function run(cwd: string, ...command: string[]) {
  const env = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"]) delete env[key];
  const result = Bun.spawnSync(command, { cwd, env, stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode, out: result.stdout.toString().trim(), error: result.stderr.toString() };
}

function git(cwd: string, ...args: string[]) {
  const result = run(cwd, "git", "-c", "user.name=Docs Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", ...args);
  expect(result.code, result.error).toBe(0);
  return result.out;
}

test("the example selects tracked current docs using recorded history and leaves the checkout alone", () => {
  const repo = mkdtempSync(join(tmpdir(), "vh-docs-truth-example-"));
  try {
    cpSync(example, repo, { recursive: true });
    git(repo, "init", "-q");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "Seed");
    const selector = "scripts/select-docs-truth.sh";
    const expected = [
      "docs/current/setup.md\tnever verified",
      "README.md\tverified 2026-01-01",
    ].join("\n");
    expect(run(repo, "bash", selector)).toMatchObject({ code: 0, out: expected });
    expect(run(repo, "bash", selector, "report")).toMatchObject({
      code: 0,
      out: `2 eligible documents\n${expected}`,
    });
    expect(git(repo, "status", "--porcelain")).toBe("");

    writeFileSync(join(repo, ".vh-adlc/docs-truth-history.tsv"), "docs/current/setup.md\t2026-12-01\n");
    writeFileSync(join(repo, "docs/current/untracked.md"), "Untracked");
    expect(run(repo, "bash", selector)).toMatchObject({ code: 0, out: expected });
    expect(run(repo, "bash", selector, "other").code).not.toBe(0);

    git(repo, "rm", "-f", ".vh-adlc/docs-truth-history.tsv");
    git(repo, "commit", "-qm", "Remove required history");
    expect(run(repo, "bash", selector)).toMatchObject({ code: 1, out: "" });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
