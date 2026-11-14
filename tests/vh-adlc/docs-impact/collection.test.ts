import { afterAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { collectImpact, resolveRoots } from "../../../plugins/vh-adlc/scripts/docs-impact/collection";

const made: string[] = [];
afterAll(() => { for (const root of made) rmSync(root, { recursive: true, force: true }); });
const declaration = 'Documentation impact roots: ["docs/"]\n';
const guide = (pattern = "src/**") => `---\ncovers: ['${pattern}']\n---\nA guide.\n`;
function put(root: string, path: string, value: string) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); }
function git(root: string, ...args: string[]): string {
  const run = Bun.spawnSync(["git", "-c", "commit.gpgsign=false", "-c", `core.hooksPath=${join(root, ".fixture-hooks")}`, ...args], {
    cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1" }, stdout: "pipe", stderr: "pipe",
  });
  if (run.exitCode !== 0) throw Error(run.stderr.toString());
  return run.stdout.toString().trimEnd();
}
function fixture(files: Record<string, string> = {}, agents: string | null = declaration): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-docs-impact-"))); made.push(root);
  git(root, "init", "-q", "-b", "main"); git(root, "config", "init.defaultBranch", "main"); git(root, "config", "user.email", "fixture@example.invalid"); git(root, "config", "user.name", "Fixture");
  if (agents !== null) put(root, "AGENTS.md", agents);
  for (const [path, value] of Object.entries({ "src/app.ts": "export const port = 8080;\n", "docs/guide.md": guide(), ...files })) put(root, path, value);
  commit(root); return root;
}
function commit(root: string) { git(root, "add", "."); git(root, "commit", "-qm", "fixture"); }
const paths = (report: ReturnType<typeof collectImpact>) => report.candidates.map(candidate => candidate.path);
const fingerprint = (root: string) => createHash("sha256").update(readFileSync(join(root, ".git/index"))).digest("hex");

// macOS rejects this filename with EILSEQ before Git or the checker can observe it.
// Linux exercises the raw-byte preservation path; UTF-8 and BOM cases run on both.
test.skipIf(process.platform === "darwin")("unrelated byte filenames are excluded without blocking valid selected coverage", () => {
  const root = fixture();
  writeFileSync(Buffer.concat([Buffer.from(root + "/unrelated-"), Buffer.from([255])]), "other task\n");
  expect(resolveRoots(root).outcome).toBe("declared");
  const result = collectImpact({ repo: root, paths: ["src/app.ts"] });
  expect(result.outcome).toBe("candidates");
  expect(result.source.excluded_dirty_paths.some(name => name.startsWith("git-bytes:"))).toBe(true);
});
test('Git filenames retain a literal leading BOM and cannot alias another document', () => {
  const root = fixture({ '\uFEFFdocs/guide.md': guide('unrelated/**') });
  const result = collectImpact({ repo: root, paths: ['src/app.ts'] });
  expect(result.outcome).toBe('candidates'); expect(paths(result)).toEqual(['docs/guide.md']);
});
test('unreadable UTF-8 root instructions are a policy gap instead of replacement-character policy', () => {
  const root = fixture();
  writeFileSync(join(root, 'AGENTS.md'), Buffer.concat([Buffer.from(declaration + '# '), Buffer.from([255])])); commit(root);
  const result = resolveRoots(root); expect(result.outcome).toBe('incomplete'); expect(result.diagnostics.some(item => item.code === 'policy')).toBe(true);
});

test("several roots retain staged scope, tracked generated docs and explicit ignored overlays", () => {
  const root = fixture({ "handbook/guide.md": guide(), "docs/generated.md": guide(), ".gitignore": "ignored/\ndocs/ignored.md\n" }, 'Documentation impact roots: ["docs", "handbook"]\n');
  put(root, "src/staged.ts", "staged\n"); git(root, "add", "src/staged.ts");
  put(root, "ignored/source.ts", "ignored\n"); put(root, "docs/ignored.md", guide("ignored/**"));
  const index = fingerprint(root), selected = collectImpact({ repo: root, paths: ["src/staged.ts"] });
  expect(selected.outcome).toBe("candidates"); expect(paths(selected)).toEqual(["docs/generated.md", "docs/guide.md", "handbook/guide.md"]);
  expect(selected.metadata.bindings.some(item => item.path === "docs/ignored.md")).toBe(false);
  const ignored = collectImpact({ repo: root, paths: ["ignored/source.ts"], metadataPaths: ["docs/ignored.md"] });
  expect(paths(ignored)).toEqual(["docs/ignored.md"]); expect(ignored.source.bindings[0].sha256).not.toBeNull();
  const noCoverage = collectImpact({ repo: root, roots: ["docs", "empty"], paths: ["src/app.ts"] });
  expect(noCoverage.outcome).toBe("incomplete"); expect(paths(noCoverage)).toContain("docs/generated.md");
  expect(fingerprint(root)).toBe(index);
});

// Updated when the lock moved to 0.26.0: the shared development loop (#78, AC-06) aligned the binary's
// `**` with this matcher, so the pinned freshness check now also reports src/deep/a.ts under src/**.
test("ordinary feature coverage and the actual pinned freshness matcher agree on double-star coverage", () => {
  const template = readFileSync(join(import.meta.dir, '../../../internal/testrepo/testdata/docs/conforming.md'), 'utf8');
  const feature = template.replace('covers:\n  - src/\n  - config.yml', 'covers: ["src/**", "src/q?.ts", "src/[ab].ts", "area/", "docs/specs/**"]');
  const root = fixture({ "docs/specs/feature.md": feature, "src/deep/a.ts": "old\n", "src/q1.ts": "old\n", "src/a.ts": "old\n", "area/sub/app.ts": "old\n" }, declaration + 'Feature documents: docs/specs/\n');
  for (const name of ["src/deep/a.ts", "src/q1.ts", "src/a.ts", "area/sub/app.ts"]) put(root, name, "changed\n");
  const plugin = join(import.meta.dir, '../../../plugins/vh-adlc');
  const ensured = Bun.spawnSync(['bash', join(plugin, 'scripts/ensure-vh-adlc.sh'), '--offline'], { stdout: 'pipe', stderr: 'pipe' }); expect(ensured.exitCode).toBe(0);
  const pin = readFileSync(join(plugin, 'knowledge.md'), 'utf8').match(/\b[a-f0-9]{40}\b/u)?.[0]; if (!pin) throw Error('missing plugin pin');
  const args = [ensured.stdout.toString().trim(), 'fresh', 'docs/specs/feature.md', '--repo', root, '--plugin-pin', pin];
  const before = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' });
  const report = collectImpact({ repo: root, paths: ['src/deep/a.ts', 'src/q1.ts', 'src/a.ts', 'area/sub/app.ts', 'docs/specs/feature.md'] });
  const candidate = report.candidates.find(item => item.path === 'docs/specs/feature.md');
  expect(candidate?.coverage_only).toBe(true); expect(candidate?.feature_attention).toBe(true);
  expect(candidate?.matches.map(item => item.source)).not.toContain('docs/specs/feature.md');
  expect(new Set(candidate?.matches.map(item => item.source))).toEqual(new Set(['src/deep/a.ts', 'src/q1.ts', 'src/a.ts', 'area/sub/app.ts']));
  const after = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' }); expect(after.exitCode).toBe(before.exitCode); expect(after.stdout).toEqual(before.stdout);
  const fresh = JSON.parse(after.stdout.toString());
  expect(fresh.data, after.stdout.toString()).not.toBeNull();
  expect(fresh.data.feature_tree.paths).toEqual(['area/sub/app.ts', 'src/a.ts', 'src/deep/a.ts', 'src/q1.ts']);
});

test('an ordinary covered doc repair still makes the actual feature review stale', () => {
  const template = readFileSync(join(import.meta.dir, '../../../internal/testrepo/testdata/docs/conforming.md'), 'utf8');
  const feature = template.replace('covers:\n  - src/\n  - config.yml', 'covers: ["docs/guide.md"]');
  const root = fixture({ 'docs/specs/feature.md': feature }, declaration + 'Feature documents: docs/specs/\n');
  const reviewed = git(root, 'rev-parse', 'HEAD');
  const row = `| 2026-11-05 | R-1 | implementation | \`${reviewed}\` | fixture | procedural | Fixture review. |\n`;
  put(root, 'docs/specs/feature.md', feature + row + '\n### R-1\n\nCRITERION: AC-01 The first end state, wrapped onto a second line.\nVERDICT: met\nEVIDENCE: fixture\n\nCRITERION: AC-02 The second end state.\nVERDICT: met\nEVIDENCE: fixture\n'); commit(root);
  const plugin = join(import.meta.dir, '../../../plugins/vh-adlc'), ensured = Bun.spawnSync(['bash', join(plugin, 'scripts/ensure-vh-adlc.sh'), '--offline'], { stdout: 'pipe', stderr: 'pipe' }); expect(ensured.exitCode).toBe(0);
  const pin = readFileSync(join(plugin, 'knowledge.md'), 'utf8').match(/\b[a-f0-9]{40}\b/u)?.[0]; if (!pin) throw Error('missing pin');
  const fresh = () => { const run = Bun.spawnSync([ensured.stdout.toString().trim(), 'fresh', 'docs/specs/feature.md', '--repo', root, '--plugin-pin', pin], { stdout: 'pipe', stderr: 'pipe' }); return JSON.parse(run.stdout.toString()); };
  expect(fresh().data.implementation_review.stale).toBe(false);
  put(root, 'docs/guide.md', guide() + 'A reviewed correction.\n'); commit(root);
  expect(fresh().data.implementation_review.stale).toBe(true);
});

test("uses HEAD metadata, retains known matches with errors and overlays only selected docs", () => {
  const root = fixture({ "docs/other.md": guide(), "src/unrelated.ts": "unchanged\n" });
  put(root, "docs/guide.md", "---\ncovers: [unterminated\n---\n"); put(root, "src/unrelated.ts", "another task\n");
  const before = fingerprint(root), result = collectImpact({ repo: root, paths: ["src/app.ts"] });
  expect(result.outcome).toBe("candidates"); expect(paths(result)).toEqual(["docs/guide.md", "docs/other.md"]);
  expect(result.metadata.excluded_dirty_docs).toContain("docs/guide.md"); expect(result.source.excluded_dirty_paths).toContain("src/unrelated.ts");
  const selected = collectImpact({ repo: root, paths: ["src/app.ts"], metadataPaths: ["docs/guide.md"] });
  expect(selected.outcome).toBe("incomplete"); expect(paths(selected)).toEqual(["docs/other.md"]);
  expect(selected.diagnostics.some(finding => finding.path === "docs/guide.md")).toBe(true);
  expect(fingerprint(root)).toBe(before); expect(readFileSync(join(root, "src/unrelated.ts"), "utf8")).toBe("another task\n");
});

test("reads selected new metadata directly while leaving a stale generated index untouched", () => {
  const root = fixture({ "docs-coverage.json": '{"wrong/**":["invented.md"]}\n' });
  put(root, "docs/new.md", guide("other/**"));
  const result = collectImpact({ repo: root, paths: ["other/new.ts"], metadataPaths: ["docs/new.md"] });
  expect(result.outcome).toBe("candidates"); expect(paths(result)).toEqual(["docs/new.md"]);
  expect(result.metadata.bindings.find(binding => binding.path === "docs/new.md")?.view).toBe("working-tree");
  expect(readFileSync(join(root, "docs-coverage.json"), "utf8")).toBe('{"wrong/**":["invented.md"]}\n');
  expect(collectImpact({ repo: root, paths: ["other/new.ts"] }).outcome).toBe("none");
});
test('a missing selected overlay is a gap, while a real tracked-doc deletion remains explicit', () => {
  const root = fixture({ 'docs/other.md': guide() });
  const missing = collectImpact({ repo: root, paths: ['src/app.ts'], metadataPaths: ['docs/never-created.md'] });
  expect(missing.outcome).toBe('incomplete'); expect(missing.diagnostics.some(item => item.code === 'metadata-path' && item.path === 'docs/never-created.md')).toBe(true);
  expect(paths(missing)).toContain('docs/guide.md');
  unlinkSync(join(root, 'docs/guide.md'));
  const deleted = collectImpact({ repo: root, paths: ['src/app.ts'], metadataPaths: ['docs/guide.md'] });
  expect(deleted.outcome).toBe('candidates'); expect(deleted.metadata.bindings.find(item => item.path === 'docs/guide.md')?.sha256).toBeNull();
  expect(deleted.diagnostics).toEqual([]);
});

test("policy and classification use committed HEAD and feature candidates never trigger on themselves", () => {
  const root = fixture({ "docs/specs/change.md": guide("docs/**") }, declaration + "Feature documents: docs/specs/\n");
  put(root, "AGENTS.md", 'Documentation impact roots: ["elsewhere/"]\nFeature document format: local\n');
  const resolved = resolveRoots(root);
  expect(resolved.outcome).toBe("declared"); expect(resolved.roots).toEqual(["docs"]); expect(resolved.policy.excluded_dirty).toBe(true);
  const self = collectImpact({ repo: root, paths: ["docs/specs/change.md"] });
  expect(paths(self)).not.toContain("docs/specs/change.md");
  const other = collectImpact({ repo: root, paths: ["docs/another.md"] });
  expect(other.candidates.find(candidate => candidate.path === "docs/specs/change.md")?.feature_attention).toBe(true);
});

test("local-format documents stay ordinary and an explicit direct root needs no adoption marker", () => {
  const root = fixture({ "docs/internal/plans/change.md": guide("docs/**") }, "Feature document format: local\n");
  expect(resolveRoots(root).outcome).toBe("absent");
  const result = collectImpact({ repo: root, roots: ["docs"], paths: ["docs/internal/plans/change.md"] });
  expect(result.outcome).toBe("candidates"); expect(result.candidates[0].feature_attention).toBe(false);
});

const declarations: Array<[string | null, ReturnType<typeof resolveRoots>["outcome"]]> = [
  [null, "absent"], ['```yaml\nDocumentation impact roots: ["elsewhere"]\n```\n', "absent"],
  [declaration + declaration, "incomplete"], [' Documentation impact roots: ["docs"]\n', "incomplete"],
  ['Documentation impact roots: []\n', "incomplete"], ['Documentation impact roots: [unclosed\n', "incomplete"],
  ['Documentation impact roots: ["../outside"]\n', "incomplete"],
];
test.each(declarations)("roots declaration %j gives %s", (agents, outcome) => {
  const root = fixture({}, agents); expect(resolveRoots(root).outcome).toBe(outcome);
});

test("merge-base selection keeps rename/deletion names and excludes unselected dirty changes", () => {
  const root = fixture({ "src/old.ts": "old\n", "src/deleted.ts": "deleted\n", "src/unrelated.ts": "original\n" });
  const base = git(root, "rev-parse", "HEAD");
  git(root, "mv", "src/old.ts", "src/new.ts"); unlinkSync(join(root, "src/deleted.ts")); commit(root);
  git(root, "checkout", "-qb", "base-race", base); put(root, "base-only.ts", "base moved\n"); commit(root); git(root, "checkout", "-q", "main");
  put(root, "src/unrelated.ts", "another task\n"); put(root, "src/new-untracked.ts", "new\n");
  const result = collectImpact({ repo: root, base: "base-race" });
  expect(result.source.merge_base).toBe(base); expect(result.source.paths).toEqual(["src/deleted.ts", "src/new.ts", "src/old.ts"]);
  expect(result.source.excluded_dirty_paths).toContain("src/unrelated.ts"); expect(result.source.excluded_dirty_paths).toContain("src/new-untracked.ts");
  const selected = collectImpact({ repo: root, base: "base-race", paths: ["src/unrelated.ts", "src/new-untracked.ts"] });
  expect(selected.source.paths).toContain("src/new-untracked.ts"); expect(selected.source.paths).toContain("src/unrelated.ts");
  expect(collectImpact({ repo: root, paths: ["src/no-longer-present.ts"] }).outcome).toBe("candidates");
});

test("uncovered files are counted but malformed headers and fields remain gaps", () => {
  const root = fixture({ "docs/plain.md": "No metadata.\n", "docs/uncovered.md": "---\ndescription: plain\n---\n", "docs/empty.md": "---\ncovers: []\n---\n", "docs/example.md": "```yaml\ncovers: [wrong/**]\n```\n" });
  const result = collectImpact({ repo: root, paths: ["src/app.ts", "unmatched.txt"] });
  expect(result.outcome).toBe("candidates"); expect(result.metadata.uncovered_docs).toHaveLength(4); expect(result.unmatched_sources).toEqual(["unmatched.txt"]);
  for (const header of ["covers: null", "covers: src/**", "covers: [null]", "covers: ['../escape']", "covers: [src/**]\ncovers: [other/**]"]) {
    put(root, "docs/bad.md", `---\n${header}\n---\n`);
    const bad = collectImpact({ repo: root, paths: ["src/app.ts"], metadataPaths: ["docs/bad.md"] });
    expect(bad.outcome).toBe("incomplete"); expect(paths(bad)).toContain("docs/guide.md");
  }
  put(root, "docs/bad.md", "---\ncovers: [src/**]\n");
  expect(collectImpact({ repo: root, paths: ["src/app.ts"], metadataPaths: ["docs/bad.md"] }).outcome).toBe("incomplete");
  const uncovered = fixture({ "docs/guide.md": "---\ndescription: no mapping\n---\n" });
  expect(collectImpact({ repo: uncovered, paths: ["src/app.ts"] }).outcome).toBe("incomplete");
});

test("refuses tracked and selected symlinks rather than silently losing coverage", () => {
  const root = fixture({ "docs/other.md": guide() });
  unlinkSync(join(root, "docs/guide.md")); symlinkSync("other.md", join(root, "docs/guide.md"));
  expect(collectImpact({ repo: root, paths: ["src/app.ts"] }).outcome).toBe("candidates");
  const overlay = collectImpact({ repo: root, paths: ["src/app.ts"], metadataPaths: ["docs/guide.md"] });
  expect(overlay.outcome).toBe("incomplete"); expect(paths(overlay)).toEqual(["docs/other.md"]);
  commit(root);
  expect(collectImpact({ repo: root, paths: ["src/app.ts"] }).outcome).toBe("incomplete");
  const linkedRoot = fixture(); git(linkedRoot, "mv", "docs", "real-docs"); symlinkSync("real-docs", join(linkedRoot, "docs")); commit(linkedRoot);
  expect(collectImpact({ repo: linkedRoot, paths: ["src/app.ts"] }).outcome).toBe("incomplete");
});

test("an unreadable HEAD blob retains the other known candidates", () => {
  const root = fixture({ "docs/bad.md": guide() });
  const object = git(root, "rev-parse", "HEAD:docs/bad.md");
  // Make this fixture's separate blob unavailable; no source or shared cache is changed.
  put(root, "docs/bad.md", guide("src/app.ts")); commit(root);
  const unique = git(root, "rev-parse", "HEAD:docs/bad.md"); expect(unique).not.toBe(object);
  unlinkSync(join(root, ".git/objects", unique.slice(0, 2), unique.slice(2)));
  const result = collectImpact({ repo: root, paths: ["src/app.ts"] });
  expect(result.outcome).toBe("incomplete"); expect(paths(result)).toContain("docs/guide.md");
});

test("rejects scope escapes and does not run configured Git hooks or touch the index", () => {
  const root = fixture(), sentinel = join(root, "hook-ran"), hook = join(root, "fsmonitor");
  writeFileSync(hook, `#!/bin/sh\nprintf hook > '${sentinel}'\n`); chmodSync(hook, 0o700); git(root, "config", "core.fsmonitor", hook);
  const before = fingerprint(root);
  expect(collectImpact({ repo: root, paths: ["src/app.ts"] }).outcome).toBe("candidates");
  expect(existsSync(sentinel)).toBe(false); expect(fingerprint(root)).toBe(before);
  expect(collectImpact({ repo: root, roots: ["../outside"], paths: ["src/app.ts"] }).outcome).toBe("incomplete");
  expect(collectImpact({ repo: root, paths: ["../outside"] }).outcome).toBe("incomplete");
});

test("feature classification follows the existing first-declaration resolver, including exact local-format syntax", () => {
  const root = fixture({ "docs/first/guide.md": guide(), "docs/second/guide.md": guide() }, declaration + 'Feature documents: `docs/first/`\nFeature documents: docs/second/\nFeature document format: local \n');
  const report = collectImpact({ repo: root, paths: ["src/app.ts"] });
  expect(report.candidates.find(candidate => candidate.path === "docs/first/guide.md")?.feature_attention).toBe(true);
  expect(report.candidates.find(candidate => candidate.path === "docs/second/guide.md")?.feature_attention).toBe(false);
});

test("a repository input must identify the actual Git root rather than silently scanning a subtree", () => {
  const root = fixture();
  expect(collectImpact({ repo: join(root, "docs"), roots: ["docs"], paths: ["src/app.ts"] }).diagnostics.some(finding => finding.code === "repository")).toBe(true);
});

test("declared missing and symlinked roots fail entry roots preflight", () => {
  const root = fixture({}, 'Documentation impact roots: ["missing"]\n');
  expect(resolveRoots(root).outcome).toBe("incomplete");
  const linked = fixture(); git(linked, "mv", "docs", "real-docs"); symlinkSync("real-docs", join(linked, "docs")); commit(linked);
  expect(resolveRoots(linked).outcome).toBe("incomplete");
});

test('frontmatter delimiters accept trailing spaces and tabs without losing declared candidates', () => {
  const root = fixture({ 'docs/space.md': '--- \t\r\ncovers: ["extra/**"]\r\n--- \t\r\nA guide.\r\n' });
  const result = collectImpact({ repo: root, paths: ['extra/app.ts'] });
  expect(result.outcome).toBe('candidates'); expect(paths(result)).toContain('docs/space.md');
});
test('tracked directory links inside a documentation root are explicit gaps', () => {
  const root = fixture({ 'generated/api/guide.md': guide('extra/**') });
  symlinkSync('../generated/api', join(root, 'docs/api')); commit(root);
  expect(resolveRoots(root).outcome).toBe('incomplete');
  const result = collectImpact({ repo: root, roots: ['docs'], paths: ['extra/app.ts'] });
  expect(result.outcome).toBe('incomplete'); expect(result.diagnostics.some(item => item.code === 'symlink')).toBe(true);
});
test('invalid UTF-8 metadata is refused before it can become a replacement-character pattern', () => {
  const root = fixture();
  writeFileSync(join(root, 'docs/invalid.md'), Buffer.concat([Buffer.from('---\ncovers: ["src/'), Buffer.from([0xff]), Buffer.from('.ts"]\n---\n')])); commit(root);
  const result = collectImpact({ repo: root, paths: ['src/app.ts'] });
  expect(result.outcome).toBe('incomplete'); expect(paths(result)).toContain('docs/guide.md');
});

test('offline feature classification agrees with the actual pinned Go resolver', () => {
  const plugin = join(import.meta.dir, '../../../plugins/vh-adlc');
  // Explicit test preparation may acquire the verified runtime; the checker stays offline.
  const ensured = Bun.spawnSync(['bash', join(plugin, 'scripts/ensure-vh-adlc.sh')], { stdout: 'pipe', stderr: 'pipe' });
  expect(ensured.exitCode).toBe(0); const binary = ensured.stdout.toString().trim();
  const pin = readFileSync(join(plugin, 'knowledge.md'), 'utf8').match(/\b[a-f0-9]{40}\b/u)?.[0];
  expect(pin).toBeDefined(); if (!pin) throw Error('missing exact plugin pin');
  const inputs = [
    '', 'Feature documents: docs/specs/\n',
    'Feature documents: `docs/first/`\nFeature documents: docs/second/\n',
    'Feature document format: local\n', 'Feature document format: local \n',
    '```text\nFeature documents: docs/fenced/\nFeature document format: local\n```\n',
  ];
  for (const [index, fields] of inputs.entries()) {
    const root = fixture({}, declaration + fields);
    const argv = [binary, 'knowledge', ...(index ? ['--offline'] : []), '--repo', root, '--plugin-pin', pin, '--page', 'conventions/feature-documents.md', '--page', 'guides/humanize-prose.md'];
    const native = Bun.spawnSync(argv, { stdout: 'pipe', stderr: 'pipe' }); expect(native.exitCode).toBe(0);
    const report = JSON.parse(native.stdout.toString()); expect(report.result).toBe('answered');
    const actual = resolveRoots(root);
    expect(actual.policy.feature_root).toBe(report.knowledge.feature_root.replace(/\/+$/u, ''));
    expect(actual.policy.local_format).toBe(report.knowledge.local_format);
  }
});
