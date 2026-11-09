import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { installOwnedNativeService } from "./original-publication-fixture";
import { publicationFixture } from "./publication-fixture";
import { git } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("the native Git fixture forwards complete metadata stdin to the real executable", () => {
  const f = publicationFixture(roots), source = git(f.repo, "rev-parse", "HEAD"), origin = join(f.root, "origin");
  git(f.root, "clone", "--bare", "--no-local", f.repo, origin);
  installOwnedNativeService({ root: f.root, source, head: source, origin });
  const executable = Bun.which("git"); if (!executable) throw Error("fixture requires Git");
  const packet = Buffer.from("Synthetic exact metadata input\n".repeat(4096));
  const expected = Bun.spawnSync([executable, "-C", f.repo, "hash-object", "--stdin"], { stdin: packet, stdout: "pipe", stderr: "pipe" });
  const actual = Bun.spawnSync([join(f.root, "native-bin/git"), "-C", f.repo, "hash-object", "--stdin"], { stdin: packet, stdout: "pipe", stderr: "pipe" });
  expect(expected.exitCode).toBe(0); expect(actual.exitCode, actual.stderr.toString()).toBe(0);
  expect(actual.stdout.toString()).toBe(expected.stdout.toString());
});
