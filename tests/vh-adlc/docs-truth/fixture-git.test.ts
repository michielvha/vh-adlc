import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureGit } from "./fixture-git";

test("fixture commits ignore another checkout's inherited Git context", () => {
  const dir = mkdtempSync(join(tmpdir(), "vh-docs-truth-git-"));
  try {
    const existing = join(dir, "existing"), fixture = join(dir, "fixture");
    mkdirSync(existing);
    mkdirSync(fixture);
    fixtureGit(existing, ["init", "-q"]);
    writeFileSync(join(existing, "existing.txt"), "keep\n");
    fixtureGit(existing, ["add", "."]);
    fixtureGit(existing, ["commit", "-qm", "Existing"]);
    const head = fixtureGit(existing, ["rev-parse", "HEAD"]);
    const indexPath = join(existing, ".git", "index");
    const before = readFileSync(indexPath);
    const inherited = { ...process.env, GIT_DIR: join(existing, ".git"), GIT_WORK_TREE: existing, GIT_INDEX_FILE: indexPath };

    fixtureGit(fixture, ["init", "-q"], inherited);
    writeFileSync(join(fixture, "sample.txt"), "fixture\n");
    fixtureGit(fixture, ["add", "."], inherited);
    fixtureGit(fixture, ["commit", "-qm", "Fixture"], inherited);

    expect(fixtureGit(existing, ["rev-parse", "HEAD"])).toBe(head);
    expect(readFileSync(indexPath)).toEqual(before);
    expect(readFileSync(join(existing, "existing.txt"), "utf8")).toBe("keep\n");
    expect(fixtureGit(fixture, ["ls-files"])).toBe("sample.txt");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
