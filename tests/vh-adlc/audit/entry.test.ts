import { afterEach, beforeAll, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { fixture, baseSettings, git } from "./fixtures";
const plugin = process.env.VH_ADLC_AUDIT_ENTRY_PLUGIN ?? resolve(import.meta.dir, "../../../plugins/vh-adlc");
const pin = "0e52f51f01b84eda75a976763c42d8ec0a07b544";
const pages = ["conventions/feature-documents.md", "conventions/coding.md", "conventions/documentation.md", "conventions/delivery.md", "guides/humanize-prose.md", "conventions/typescript.md"];
const made: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of made.splice(0)) f.dispose(); });
const hash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const pinnedPages = new Map<string, { bytes: Buffer; blob: string }>();
// Explicit test setup is online-capable; the entry subprocesses below are never online.
beforeAll(async () => {
  const ensured = Bun.spawnSync(["bash", join(plugin, "scripts/ensure-vh-adlc.sh")], { stdout: "pipe", stderr: "pipe" });
  expect(ensured.exitCode).toBe(0);
  const proof = JSON.parse(readFileSync(resolve(import.meta.dir, "../evidence/shared-audit/offline-knowledge/result.json"), "utf8")) as { results: { case: string; docs_setup: { page: string; sha256: string; git_blob: string }[] }[] };
  const recorded = proof.results.find(row => row.case === "warm")!.docs_setup;
  for (const page of pages) {
    const cached = join(process.platform === "darwin" ? join(homedir(), "Library/Caches") : process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "vh-adlc/docs", pin, page);
    const bytes = existsSync(cached) ? readFileSync(cached) : Buffer.from(await (await fetch(`https://raw.githubusercontent.com/vhco-pro/docs/${pin}/${page}`)).arrayBuffer());
    const expected = recorded.find(row => row.page === page)!;
    expect(hash(bytes)).toBe(expected.sha256);
    const blob = createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex");
    expect(blob).toBe(expected.git_blob); pinnedPages.set(page, { bytes, blob });
  }
});
function fingerprint(root: string): string {
  const files: unknown[] = [];
  function walk(dir: string) { for (const name of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, name.name); files.push([path, name.isDirectory() ? "directory" : hash(readFileSync(path))]); if (name.isDirectory()) walk(path); } }
  walk(root); return hash(JSON.stringify(files));
}

test("direct audit and lifecycle intake choose offline entry before ordinary bootstrap", () => {
  const skill = readFileSync(join(plugin, "skills/vh-adlc-audit/SKILL.md"), "utf8"), loop = readFileSync(join(plugin, "references/loop.md"), "utf8"), intake = readFileSync(join(plugin, "references/lifecycle.md"), "utf8");
  expect(skill).toContain("scripts/audit/bootstrap.ts"); expect(skill).toContain("--offline");
  expect(loop.indexOf("Audit entry overrides")).toBeGreaterThan(0);
  expect(loop.indexOf("Audit entry overrides")).toBeLessThan(loop.indexOf("VH_ADLC="));
  expect(intake).toContain("before its installer"); expect(intake).toContain("defer bootstrap"); expect(intake).toContain("scripts/audit/bootstrap.ts");
});

for (const state of ["binary-missing", "docs-empty", "docs-partial", "ready"] as const) test(`bounded audit entry is offline with ${state}`, () => {
  const f = fixture(); made.push(f); f.settings(baseSettings({ knowledge_pages: ["conventions/typescript.md"] }));
  f.write("AGENTS.md", `# Rules\nRead https://github.com/vhco-pro/docs/blob/${pin}/AGENTS.md\n`); f.commit();
  const home = join(f.outer, "entry-home"), bin = join(f.outer, "entry-bin"), marker = join(f.outer, "network-attempt"); mkdirSync(home); mkdirSync(bin);
  for (const name of ["bash", "dirname", "uname", "sed", "awk", "cut", "sha256sum", "shasum"]) { const path = Bun.which(name); if (path) symlinkSync(path, join(bin, name)); }
  const shellQuote = (v: string) => "'" + v.replaceAll("'", "'\\''") + "'";
  writeFileSync(join(bin, "git"), `#!/bin/bash\nfor arg in "$@"; do case "$arg" in fetch|clone|ls-remote) printf git > ${shellQuote(marker)}; exit 88;; esac; done\nexec /usr/bin/git "$@"\n`); chmodSync(join(bin, "git"), 0o700);
  writeFileSync(join(bin, "curl"), `#!/bin/sh\nprintf curl > ${shellQuote(marker)}\nexit 88\n`); chmodSync(join(bin, "curl"), 0o700);
  const setup: Record<string, unknown> = { kind: "exact-pinned-blob-cache-seeding", pages: [] };
  if (state !== "binary-missing") {
    const ensured = Bun.spawnSync(["bash", join(plugin, "scripts/ensure-vh-adlc.sh"), "--offline"], { stdout: "pipe", stderr: "pipe" }); expect(ensured.exitCode).toBe(0);
    const binary = ensured.stdout.toString().trim(), lock = JSON.parse(readFileSync(join(plugin, "vh-adlc.lock.json"), "utf8"));
    const platform = `${process.platform === "darwin" ? "darwin" : "linux"}_${process.arch === "x64" ? "amd64" : "arm64"}`;
    const observed = hash(readFileSync(binary)); expect(observed).toBe(lock.assets[platform].binary_sha256);
    copyFileSync(binary, join(bin, "vh-adlc")); chmodSync(join(bin, "vh-adlc"), 0o700); setup.binary = { source: binary, expected_sha256: lock.assets[platform].binary_sha256, sha256: observed, version: lock.version };
  }
  if (["ready", "docs-partial"].includes(state)) for (const page of pages.filter(p => state === "ready" || p !== "guides/humanize-prose.md")) {
    const source = pinnedPages.get(page)!;
    const target = join(home, "cache/vh-adlc/docs", pin, page); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, source.bytes);
    (setup.pages as unknown[]).push({ page, sha256: hash(source.bytes), blob: source.blob });
  }
  writeFileSync(join(f.outer, "explicit-setup.json"), JSON.stringify(setup));
  const before = fingerprint(home), source = git(f.root, "status", "--porcelain"), refs = git(f.root, "for-each-ref", "--format=%(refname) %(objectname)");
  const run = Bun.spawnSync([process.execPath, join(plugin, "scripts/audit/bootstrap.ts"), "--repo", f.root, "--plugin-pin", pin], {
    env: { HOME: home, XDG_CACHE_HOME: join(home, "cache"), PATH: bin, TMPDIR: f.outer, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", LANG: "C", HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9" }, stdout: "pipe", stderr: "pipe", timeout: 20_000,
  });
  const archive = process.env.VH_ADLC_AUDIT_ENTRY_EVIDENCE;
  if (archive) {
    mkdirSync(archive, { recursive: true, mode: 0o700 });
    writeFileSync(join(archive, `${state}.json`), JSON.stringify({ state, setup, pin, argv: [process.execPath, join(plugin, "scripts/audit/bootstrap.ts"), "--repo", f.root, "--plugin-pin", pin],
      exit_code: run.exitCode, stdout: run.stdout.toString(), stderr: run.stderr.toString(), home_before: before, home_after: fingerprint(home), network_attempt: existsSync(marker),
      source_before: source, source_after: git(f.root, "status", "--porcelain"), refs_before: refs, refs_after: git(f.root, "for-each-ref", "--format=%(refname) %(objectname)"),
      limitation: "Bounded executor and instruction contracts; actual model route choice is tested separately." }, null, 2), { mode: 0o600 });
  }
  const report = JSON.parse(run.stdout.toString()); expect(report.ready).toBe(state === "ready"); expect(run.exitCode).toBe(state === "ready" ? 0 : 1);
  if (state === "ready") { expect(report.pages).toEqual(pages); expect(report.knowledge.result).toBe("answered"); }
  else expect(report.phase).toBe(state === "binary-missing" ? "binary" : "knowledge");
  expect(existsSync(marker)).toBe(false); expect(fingerprint(home)).toBe(before); expect(git(f.root, "status", "--porcelain")).toBe(source); expect(git(f.root, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(refs);
});
