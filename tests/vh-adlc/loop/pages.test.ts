// The pages a command-route reviewer reads, cached before dispatch (references/review-protocol.md, Routes).
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pagesStub } from "./pages-stub";

const PAGES = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/loop/pages.ts");

const made: string[] = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

function repo(agents: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-pages-repo-")));
  made.push(root);
  writeFileSync(join(root, "AGENTS.md"), agents);
  const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } }).stdout.toString().trim();
  git("init", "-q", "-b", "main"); git("add", "-A"); git("commit", "-q", "-m", "f");
  return { root, commit: git("rev-parse", "HEAD") };
}

/** Runs cacheReviewPages against the stub in a child process, whose HOME and XDG_CACHE_HOME point at the
 *  stub's cache: Bun reads the home directory once, at start. */
function cached(stub: ReturnType<typeof pagesStub>, root: string, commit: string) {
  made.push(stub.dir);
  const input = JSON.stringify({ repo: root, commit, revision: "abc", binary: stub.binary, pluginPin: "def" });
  const run = Bun.spawnSync([process.execPath, "-e", `import { cacheReviewPages } from ${JSON.stringify(PAGES)};
console.log(JSON.stringify(cacheReviewPages(JSON.parse(process.env.INPUT))));`], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...stub.env, INPUT: input } });
  if (run.exitCode !== 0) throw Error(run.stderr.toString());
  return JSON.parse(run.stdout.toString());
}

test("a docs AGENTS.md that routes through README.md caches README.md and every page README.md links", () => {
  const stub = pagesStub("abc", { pages: {
    "AGENTS.md": "1. Read [README.md](README.md) and follow its task route.\n2. Read [coding](conventions/coding.md).\n",
    "README.md": "For Go, read [Go](conventions/go.md) and the [example](examples/static/README.md#setup).\nSee [the site](https://example.com/x.md), [mail](mailto:a@example.invalid) and [the agents](AGENTS.md).\n",
    // One level only: a page README.md links, and a nested page AGENTS.md links, route nothing further.
    "conventions/go.md": "See [deeper](conventions/deep.md).\n", "conventions/coding.md": "See [nested](guides/nested.md).\n" } });
  const { root, commit } = repo("Specs live in [the specs](docs/specs/f.md). Read conventions/testing.md.\n");
  const result = cached(stub, root, commit);
  expect(result).toEqual({ pages: ["AGENTS.md", "README.md", "conventions/coding.md", "conventions/feature-documents.md", "conventions/go.md",
    "conventions/testing.md", "examples/static/README.md"], missing: [] });
  for (const page of result.pages) expect([page, existsSync(join(stub.cache, "vh-adlc", "docs", "abc", page))]).toEqual([page, true]);
  const requested = readFileSync(stub.log, "utf8");
  expect(requested).not.toContain("docs/specs/f.md");
  expect(requested).not.toContain("example.com");
  expect(requested).not.toContain("conventions/deep.md");
  expect(requested).not.toContain("guides/nested.md");
});

test("a link that leaves the docs repository is not requested", () => {
  const stub = pagesStub("abc", { pages: { "AGENTS.md": "See [up](../other/README.md), [abs](/etc/x.md), [here](./guides/a.md) and [dir](guides/b.md).\n" } });
  const { root, commit } = repo("No routes.\n");
  expect(cached(stub, root, commit)).toEqual({ pages: ["AGENTS.md", "conventions/feature-documents.md", "guides/a.md", "guides/b.md"], missing: [] });
});
