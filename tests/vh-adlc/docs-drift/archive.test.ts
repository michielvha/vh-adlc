import { expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import fixtures from "./archive-fixtures.json";
import { readReportArchive } from "../../../plugins/vh-adlc/scripts/docs-drift/archive";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const limits = { max_archive_bytes: 200000, max_entry_bytes: 1000 };
function bytes(name: keyof typeof fixtures) { return Buffer.from(fixtures[name], "base64"); }
async function read(name: keyof typeof fixtures) {
  const raw = bytes(name);
  return readReportArchive(raw, { sha256: sha256(raw), size: raw.length }, limits);
}
for (const name of ["deflate", "stored"] as const) test(`packaged reader accepts only the exact regular JSON pair (${name})`, async () => {
  const parsed = await read(name);
  expect(parsed.report).toEqual({ schema: "fixture", items: [] });
  expect(parsed.provenance).toEqual({ run_id: 101 });
  expect(parsed.report_sha256).toBe(sha256(parsed.report_bytes));
});
for (const name of Object.keys(fixtures) as Array<keyof typeof fixtures>) {
  if (name === "deflate" || name === "stored") continue;
  test(`archive ${name} cannot become history evidence`, async () => {
    await expect(read(name)).rejects.toThrow();
  });
}
test("API size, digest and configured archive/entry bounds are checked before decoding", async () => {
  const raw = bytes("deflate");
  await expect(readReportArchive(raw, { sha256: "0".repeat(64), size: raw.length }, limits)).rejects.toThrow("digest");
  await expect(readReportArchive(raw, { sha256: sha256(raw), size: raw.length + 1 }, limits)).rejects.toThrow("size");
  await expect(readReportArchive(raw, { sha256: sha256(raw), size: raw.length }, { ...limits, max_archive_bytes: 10 })).rejects.toThrow("bound");
  await expect(readReportArchive(raw, { sha256: sha256(raw), size: raw.length }, { ...limits, max_entry_bytes: 1 })).rejects.toThrow("bound");
});
test("reader bundle works from installed files without node_modules, fetch or system unzip", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-drift-zip-install-"));
  try {
    const component = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift");
    cpSync(join(component, "vendor"), join(root, "vendor"), { recursive: true });
    const program = `const {readEntries}=await import(${JSON.stringify(join(root, "vendor/zip-reader.cjs"))}); const value=await readEntries(Buffer.from(${JSON.stringify(fixtures.deflate)},'base64'),${JSON.stringify(limits)}); if(JSON.parse(value.report.toString()).schema!=='fixture') process.exit(1);`;
    const result = Bun.spawnSync([process.execPath, "--eval", program], { cwd: root, env: { PATH: "/nonexistent", BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" }, stdout: "pipe", stderr: "pipe" });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    const bundle = readFileSync(join(root, "vendor/zip-reader.cjs"), "utf8");
    expect(bundle).not.toMatch(/require\(["'](?:yauzl|pend)["']\)/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("missing or corrupt installed bundles hand off to verified setup", () => {
  for (const corrupt of [false, true]) {
    const root = mkdtempSync(join(tmpdir(), "docs-drift-zip-setup-"));
    try {
      const component = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift");
      for (const name of ["archive.ts", "protocol.ts"]) cpSync(join(component, name), join(root, name));
      if (corrupt) {
        mkdirSync(join(root, "vendor"));
        writeFileSync(join(root, "vendor/zip-reader.cjs"), "exports.readEntries = 2;\n");
      }
      const raw = bytes("deflate");
      const program = `const {readReportArchive}=await import(${JSON.stringify(join(root, "archive.ts"))}); try {await readReportArchive(Buffer.from(${JSON.stringify(fixtures.deflate)},'base64'),${JSON.stringify({ sha256: sha256(raw), size: raw.length })},${JSON.stringify(limits)});process.exit(2);} catch(error){if(!error.message.includes('verified setup'))throw error;}`;
      const result = Bun.spawnSync([process.execPath, "--eval", program], { cwd: root, env: { PATH: "/nonexistent", BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" }, stdout: "pipe", stderr: "pipe" });
      expect(result.stderr.toString()).toBe("");
      expect(result.exitCode).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("the runtime bundle has pinned dependencies, notices and stable source labels", () => {
  const component = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift");
  const manifest: unknown = JSON.parse(readFileSync(join(component, "package.json"), "utf8"));
  expect(manifest).toMatchObject({ packageManager: "bun@1.4.4", dependencies: { yauzl: "3.4.0" } });
  const lock = readFileSync(join(component, "bun.lock"), "utf8");
  expect(lock).toContain('"pend@1.2.0"');
  expect(lock).toContain('"yauzl@3.4.0"');
  expect(lock).toContain("sha512-jIH9yLR9wqr0wOS0TpBvo/g/2UgZH5qePVbjgRliiF0BYvOZyaBknKsF+x9Iht0O6sqgnB93rCICdOZFecJuDw==");
  const notices = readFileSync(join(component, "vendor/NOTICES.md"), "utf8");
  expect(notices).toContain("Josh Wolfe");
  expect(notices).toContain("Andrew Kelley");
  expect(notices).toContain("Permission is hereby granted");
  const bundle = readFileSync(join(component, "vendor/zip-reader.cjs"), "utf8");
  expect(bundle).toContain("// node_modules/yauzl/index.js");
  expect(bundle).not.toContain("vh-docs-drift-bundle-");
});
