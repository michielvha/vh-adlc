import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const component = import.meta.dir;
const { packageManager } = await Bun.file(join(component, "package.json")).json();
if (`bun@${Bun.version}` !== packageManager) throw new Error(`Build with the declared ${packageManager} toolchain`);
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) throw new Error("usage: bun build-zip.ts [--check]");
const originalDirectory = process.cwd();
const work = mkdtempSync(join(tmpdir(), "vh-docs-drift-bundle-"));
try {
  for (const file of ["package.json", "bun.lock", "zip-reader.ts"]) cpSync(join(component, file), join(work, file));
  const install = Bun.spawnSync([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], { cwd: work, stdout: "pipe", stderr: "pipe" });
  if (install.exitCode !== 0) throw new Error("Frozen dependency installation failed");
  process.chdir(work);
  const build = await Bun.build({ entrypoints: [join(work, "zip-reader.ts")], root: work,
    outdir: join(work, "output"), naming: "zip-reader.cjs", target: "node", format: "cjs", minify: false, sourcemap: "none", packages: "bundle" });
  if (!build.success || build.outputs.length !== 1) throw new Error("ZIP reader bundle build failed");
  const bytes = Buffer.from(await build.outputs[0].arrayBuffer());
  const target = join(component, "vendor/zip-reader.cjs");
  if (args[0] === "--check") {
    if (!existsSync(target) || !readFileSync(target).equals(bytes)) throw new Error("Vendored ZIP reader differs from frozen dependency build");
    console.log("Frozen ZIP reader bundle is byte-identical");
  } else {
    writeFileSync(target, bytes);
    console.log("Built the licensed ZIP reader bundle");
  }
} finally {
  process.chdir(originalDirectory);
  rmSync(work, { recursive: true, force: true });
}
