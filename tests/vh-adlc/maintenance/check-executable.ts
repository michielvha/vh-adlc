import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
export function checkExecutable(path: string, cwd: string, runtime = process.execPath) {
  const info = lstatSync(path); if (!info.isFile() || info.isSymbolicLink()) throw Error("fixed check executable must be an owned regular file");
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex"), actualRuntime = realpathSync(runtime), version = Bun.spawnSync([path, "--version"], { cwd, stdout: "pipe", stderr: "pipe" });
  if (version.exitCode !== 0) throw Error("fixed check executable version failed");
  return { path, sha256: hash(readFileSync(path)), mode: info.mode & 0o777, version: { argv: [path, "--version"], exit_code: version.exitCode, stdout: version.stdout.toString(), stderr: version.stderr.toString() }, runtime: { path: actualRuntime, sha256: hash(readFileSync(actualRuntime)), mode: lstatSync(actualRuntime).mode & 0o777 } };
}
