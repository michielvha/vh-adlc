import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { cli, example, resultSchema } from "./helpers/cli";
import { sha } from "./helpers/bundle";

test("real commands run without network or child execution and preserve other features", async () => {
  if (process.platform !== "linux") throw new Error("The required offline proof needs Linux namespaces");
  const bwrap = Bun.which("bwrap"); const strace = Bun.which("strace");
  if (!bwrap || !strace) throw new Error("Required offline proof: install bubblewrap and strace");
  const root = await mkdtemp(join(tmpdir(), "seo-offline-test-")); const repo = resolve(import.meta.dir, "../../..");
  const protectedFiles = ["docs/specs/seo-assessment.md", "docs/specs/seo-search-ai-discovery.md", "plugins/vh-adlc/plugin.json"];
  const before = await Promise.all(protectedFiles.map(async p => sha(await readFile(join(repo, p)))));
  const snapshot = join(root, "snapshot"); const input = join(snapshot, "snapshot.json");
  const invocations = [["snapshot", "--input", example, "--output", snapshot], ["inspect", "--snapshot", input, "--output", join(root, "inspect")], ["compare", "--baseline", input, "--current", input, "--output", join(root, "compare")]];
  for (const [i, args] of invocations.entries()) {
    const trace = join(root, `trace-${i}.log`);
    const p = Bun.spawn([bwrap, "--unshare-net", "--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--bind", root, root, "--", strace, "-f", "-qq", "-e", "trace=network,process", "-o", trace, process.execPath, cli, ...args, "--json"], { stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", HOME: root } });
    const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    expect(stderr).toBe(""); expect(code).toBe(0); expect(resultSchema.parse(JSON.parse(stdout) as unknown).exit_code).toBe(0);
    const events = await readFile(trace, "utf8");
    expect(events).not.toMatch(/socket\(AF_INET6?\b|connect\(.*AF_INET6?\b|sendto\(.*AF_INET6?\b/);
    expect(events.split("\n").filter(line => /execve\(/.test(line))).toHaveLength(1);
    expect(events).not.toMatch(/\b(vfork|fork)\(/);
  }
  expect(await Promise.all(protectedFiles.map(async p => sha(await readFile(join(repo, p)))))).toEqual(before);
});
