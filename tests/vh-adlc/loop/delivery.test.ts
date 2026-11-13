// Delivery: CI reporting under a manual policy, the skip marker, and when a merged feature is delivered.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadLoopSettings } from "../../../plugins/vh-adlc/scripts/loop/settings";
import { ciReport, deliveryVerdict, skipMarker } from "../../../plugins/vh-adlc/scripts/loop/delivery";

const made: string[] = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
function git(root: string, ...args: string[]) {
  const run = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } });
  if (run.exitCode !== 0) throw Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
  return run.stdout.toString().trim();
}
function write(root: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); }
}
function scratch(prefix: string) { const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix))); made.push(dir); return dir; }

/** A watch stub that exits with the codes listed in `codes`, one per call, printing `output`. */
function watch(codes: number[], output = "", delayMs = 0) {
  const dir = scratch("vh-delivery-watch-"), script = join(dir, "watch.sh"), count = join(dir, "count");
  writeFileSync(count, "0");
  writeFileSync(script, `#!/bin/bash\nn=$(cat ${count}); echo $((n+1)) > ${count}\ncodes=(${codes.join(" ")})\nsleep ${delayMs / 1000}\necho "merge $1"\nprintf '%s\\n' ${JSON.stringify(output)}\nexit \${codes[$n]:-0}\n`);
  chmodSync(script, 0o700);
  return { script, calls: () => Number(Bun.spawnSync(["cat", count], { stdout: "pipe" }).stdout.toString()) };
}

function repository(settings: string) {
  const root = scratch("vh-delivery-");
  git(root, "init", "-q", "-b", "main");
  write(root, { ".vh-adlc/loop.yaml": settings, "src/app.go": "a\n", "docs/specs/f.md": "# F\n", "agents/spec.md": "x\n" });
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "base");
  return root;
}
/** Merges a feature branch that changes `files`, with `message` as the merge commit message. */
function merged(root: string, files: Record<string, string>, message: string) {
  git(root, "switch", "-q", "-c", `feat/${Object.keys(files).length}-${Date.now()}`);
  write(root, files); git(root, "add", "-A"); git(root, "commit", "-q", "-m", "feature");
  const branch = git(root, "branch", "--show-current");
  git(root, "switch", "-q", "main"); git(root, "merge", "-q", "--no-ff", "-m", message, branch);
  return git(root, "rev-parse", "HEAD");
}

const base = (extra = "") => `schema_version: 1\nci_trigger: manual\nskip_ci_paths: [agents/**, .claude/**]\n${extra}`;

describe("CI reporting", () => {
  test("a manual CI policy is reported as not triggered, and nothing is dispatched", () => {
    const report = ciReport(loadLoopSettings(repository(base()), { overridePath: null }));
    expect(report).toEqual({ state: "not triggered", reason: "manual CI policy", dispatch: false });
  });
  test("without a declared policy the report follows the pushed commit's runs", () => {
    expect(ciReport(loadLoopSettings(repository("schema_version: 1\n"), { overridePath: null }))).toEqual({ state: "follow runs", reason: "automatic CI", dispatch: false });
  });
});

describe("the skip marker", () => {
  const settings = () => loadLoopSettings(repository(base()), { overridePath: null });
  const supported = { supportsSkipPaths: true, featureRoot: "docs/specs/" };
  test("a delivery touching only feature documents and declared paths carries the marker", () => {
    expect(skipMarker(settings(), { commit: ["agents/spec.md"], pushRange: ["agents/spec.md", "docs/specs/f.md"], prDiff: ["agents/spec.md", "docs/specs/f.md"] }, supported))
      .toEqual({ marker: true });
  });
  test("declared paths plus code leave it off", () => {
    expect(skipMarker(settings(), { commit: ["agents/spec.md"], pushRange: ["agents/spec.md", "src/app.go"], prDiff: ["agents/spec.md", "src/app.go"] }, supported).marker).toBe(false);
  });
  test("an earlier code commit in the push range leaves it off even when the last commit is docs-only", () => {
    expect(skipMarker(settings(), { commit: ["docs/specs/f.md"], pushRange: ["src/app.go", "docs/specs/f.md"], prDiff: ["docs/specs/f.md"] }, supported).marker).toBe(false);
  });
  test("under a pinned delivery convention without skip paths, the declared paths are ignored and the report says why", () => {
    const result = skipMarker(settings(), { commit: ["agents/spec.md"], pushRange: ["agents/spec.md"], prDiff: ["agents/spec.md"] }, { supportsSkipPaths: false, featureRoot: "docs/specs/" });
    expect(result.marker).toBe(false);
    expect(result.ignored).toContain("skip_ci_paths is ignored");
    expect(result.ignored).toContain("update the docs pin");
  });
});

describe("delivery after merge", () => {
  test("a merge commit with the marker that touches only skip-eligible paths has no publication path, and the watch never runs", async () => {
    const stub = watch([1]);
    const root = repository(base(`post_merge_watch:\n  argv: [${stub.script}, "{merge_sha}"]\n`));
    const merge = merged(root, { "agents/spec.md": "y\n" }, "Merge feature [skip ci]");
    const verdict = await deliveryVerdict(loadLoopSettings(root, { overridePath: null }), root, merge, { featureRoot: "docs/specs/", supportsSkipPaths: true });
    expect(verdict).toEqual({ delivered: true, reason: "no publication path" });
    expect(stub.calls()).toBe(0);
  });

  test("an unmarked merge runs the watch: not delivered while it fails, delivered once it exits 0", async () => {
    const stub = watch([1, 0]);
    const root = repository(base(`post_merge_watch:\n  argv: [${stub.script}, "{merge_sha}"]\n`));
    const merge = merged(root, { "agents/spec.md": "z\n" }, "Merge feature");
    const settings = loadLoopSettings(root, { overridePath: null });
    expect(await deliveryVerdict(settings, root, merge, { featureRoot: "docs/specs/", supportsSkipPaths: true })).toMatchObject({ delivered: false, state: "failed" });
    expect(await deliveryVerdict(settings, root, merge, { featureRoot: "docs/specs/", supportsSkipPaths: true })).toEqual({ delivered: true, reason: "the post-merge watch passed" });
    expect(stub.calls()).toBe(2);
  });

  test("a watch that fails only because no workflow ran leaves the feature blocked, never delivered", async () => {
    const stub = watch([1], "GitVersion Tag path-ignores this merge and no sync ran on its push");
    const root = repository(base(`post_merge_watch:\n  argv: [${stub.script}, "{merge_sha}"]\n  no_publication_pattern: "no sync ran"\n`));
    const merge = merged(root, { "agents/spec.md": "w\n" }, "Merge feature");
    const verdict = await deliveryVerdict(loadLoopSettings(root, { overridePath: null }), root, merge, { featureRoot: "docs/specs/", supportsSkipPaths: true });
    expect(verdict).toMatchObject({ delivered: false, state: "blocked" });
    if (!verdict.delivered) expect(verdict.reason).toContain("owner confirms delivery");
  });

  test("a run that appears late is waited for by the watch, with no early verdict", async () => {
    const stub = watch([0], "", 1200);
    const root = repository(base(`post_merge_watch:\n  argv: [${stub.script}, "{merge_sha}"]\n`));
    const merge = merged(root, { "src/app.go": "b\n" }, "Merge feature");
    const started = Date.now();
    const verdict = await deliveryVerdict(loadLoopSettings(root, { overridePath: null }), root, merge, { featureRoot: "docs/specs/", supportsSkipPaths: true });
    expect(Date.now() - started).toBeGreaterThanOrEqual(1100);
    expect(verdict).toEqual({ delivered: true, reason: "the post-merge watch passed" });
  });

  test("without a declared watch, delivery follows the release paths the feature document names", async () => {
    const root = repository("schema_version: 1\n");
    const merge = merged(root, { "src/app.go": "c\n" }, "Merge feature");
    expect(await deliveryVerdict(loadLoopSettings(root, { overridePath: null }), root, merge, { featureRoot: "docs/specs/", supportsSkipPaths: false }))
      .toEqual({ delivered: false, state: "manual", reason: "no post-merge watch declared; check each release path the feature document names" });
  });
});
