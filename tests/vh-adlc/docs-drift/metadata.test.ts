import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectImpact, readDocumentMetadata, resolveRoots } from "../../../plugins/vh-adlc/scripts/docs-impact/collection";

const bytes = (text: string) => Buffer.from(text);
const repositories: string[] = [];
afterAll(() => {
  for (const repo of repositories) rmSync(repo, { recursive: true, force: true });
});

function fixture(agents: string): string {
  const repo = mkdtempSync(join(tmpdir(), "vh-drift-metadata-"));
  repositories.push(repo);
  mkdirSync(join(repo, "docs"));
  writeFileSync(join(repo, "AGENTS.md"), agents);
  writeFileSync(join(repo, "docs/guide.md"), "---\ncovers: [src/**]\nstatus: [unvalidated]\nbranch: 7\n---\nGuide\n");
  const result = Bun.spawnSync(["git", "-c", "init.defaultBranch=main", "init", "-q"], { cwd: repo });
  expect(result.exitCode).toBe(0);
  for (const args of [["add", "."], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture"]]) {
    const run = Bun.spawnSync(["git", ...args], { cwd: repo, stderr: "pipe" });
    if (run.exitCode !== 0) throw new Error(run.stderr.toString());
  }
  return repo;
}

test("shared metadata distinguishes absent frontmatter from an empty mapping", () => {
  expect(readDocumentMetadata(bytes("# Guide\n"))).toBeNull();
  expect(readDocumentMetadata(bytes("---\n{}\n---\nGuide\n"))).toEqual({});
  expect(readDocumentMetadata(bytes("\uFEFF--- \t\r\ncovers: [src/**]\r\n--- \t\r\nGuide\n"))).toEqual({ covers: ["src/**"] });
});

test("metadata parsing preserves unknown values and delegates branch, status and covers validation", () => {
  const metadata = readDocumentMetadata(bytes("---\nbranch: 7\nstatus: [unknown]\ncovers: 42\ncustom: {enabled: true}\n---\n"));
  expect(metadata).toEqual({ branch: 7, status: ["unknown"], covers: 42, custom: { enabled: true } });
});

test.each([
  "---\ncovers: []\ncovers: []\n---\n",
  "---\n- sequence\n---\n",
  "---\nnull\n---\n",
  "---\n42\n---\n",
  "---\ncovers: [unterminated\n---\n",
  "---\ncovers: []\n",
])("malformed or non-mapping frontmatter is refused (%s)", text => {
  expect(() => readDocumentMetadata(bytes(text))).toThrow();
});

test("invalid UTF-8 is refused even outside a metadata header", () => {
  expect(() => readDocumentMetadata(Buffer.from([35, 32, 255]))).toThrow();
});

test("an existing reader can parse several headers and absent frontmatter never invokes it", () => {
  let reads = 0;
  const reader = (_bytes: Uint8Array): unknown => {
    reads++;
    return { covers: [] };
  };
  expect(readDocumentMetadata(bytes("Guide"), reader)).toBeNull();
  expect(reads).toBe(0);
  expect(readDocumentMetadata(bytes("---\ncovers: []\n---\n"), reader)).toEqual({ covers: [] });
  expect(reads).toBe(1);
});

test("docs-impact keeps its covers-only validation and accepts other unvalidated metadata", () => {
  const repo = fixture('Documentation impact roots: [docs]\nFeature documents: plans/\n');
  const before = readFileSync(join(repo, ".git/index"));
  const result = collectImpact({ repo, paths: ["src/app.ts"] });
  expect(result.outcome).toBe("candidates");
  expect(result.candidates.map(item => item.path)).toEqual(["docs/guide.md"]);
  writeFileSync(join(repo, "docs/guide.md"), "---\ncovers: 42\n---\n");
  const invalid = collectImpact({ repo, paths: ["src/app.ts"], metadataPaths: ["docs/guide.md"] });
  expect(invalid.outcome).toBe("incomplete");
  expect(invalid.diagnostics.some(item => item.code === "metadata")).toBe(true);
  expect(readFileSync(join(repo, ".git/index"))).toEqual(before);
});

test.each([
  "Feature documents: private-plans/\nDocumentation impact roots: [missing]\n",
  "Feature documents: ../private-plans/\n",
  "Feature documents: private-plans/\nDocumentation impact roots: [unclosed\n",
])("roots defects preserve diagnostics instead of supplying usable default classification (%s)", agents => {
  const repo = fixture(agents);
  const index = readFileSync(join(repo, ".git/index"));
  const result = resolveRoots(repo);
  expect(result.outcome).toBe("incomplete");
  expect(result.diagnostics.length).toBeGreaterThan(0);
  expect(readFileSync(join(repo, ".git/index"))).toEqual(index);
});

test("clean absent documentation roots still resolve committed custom feature classification", () => {
  const repo = fixture("Feature documents: private-plans/\nFeature document format: local\n");
  writeFileSync(join(repo, "AGENTS.md"), "Feature documents: dirty-plans/\n");
  const result = resolveRoots(repo);
  expect(result.outcome).toBe("absent");
  expect(result.diagnostics).toEqual([]);
  expect(result.policy.feature_root).toBe("private-plans");
  expect(result.policy.local_format).toBe(true);
  expect(result.policy.excluded_dirty).toBe(true);
});

test("a repository without HEAD cannot supply a usable feature classification", () => {
  const repo = mkdtempSync(join(tmpdir(), "vh-drift-unborn-"));
  repositories.push(repo);
  expect(Bun.spawnSync(["git", "init", "-q"], { cwd: repo }).exitCode).toBe(0);
  const result = resolveRoots(repo);
  expect(result.head).toBeNull();
  expect(result.outcome).toBe("incomplete");
  expect(result.diagnostics.length).toBeGreaterThan(0);
});
