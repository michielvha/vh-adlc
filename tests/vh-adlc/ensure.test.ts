// Tests for plugins/vh-adlc/scripts/ensure-vh-adlc.sh (scenario S15). Each case
// copies the real installer into a throwaway plugin directory with its own lock,
// so no production flag or URL override exists to bypass verification.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const INSTALLER = join(ROOT, "plugins", "vh-adlc", "scripts", "ensure-vh-adlc.sh");
const REAL_LOCK = join(ROOT, "plugins", "vh-adlc", "vh-adlc.lock.json");
const VERSION = "9.9.9";
const PLATFORMS = ["darwin_amd64", "darwin_arm64", "linux_amd64", "linux_arm64"];

function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function platform(): string {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  return `${os}_${arch}`;
}

function cacheBase(home: string): string {
  return process.platform === "darwin" ? join(home, "Library", "Caches") : join(home, "cache");
}

// A fake vh-adlc: prints its version and leaves a marker when it runs.
function fakeBinary(version: string, marker: string, extra = ""): string {
  return `#!/bin/sh\n${extra}echo ran >> "${marker}"\necho "vh-adlc ${version}"\n`;
}

type Fixture = {
  dir: string;
  plugin: string;
  home: string;
  marker: string;
  binary: string;
  asset: string;
  lock: Record<string, unknown>;
};

function fixture(opts: { assetSha?: string; binarySha?: string | null; binaryVersion?: string } = {}): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "vh-adlc-ensure-"));
  const home = join(dir, "home");
  const marker = join(dir, "executed");
  mkdirSync(home);
  const build = join(dir, "build");
  mkdirSync(build);
  const binary = fakeBinary(opts.binaryVersion ?? VERSION, marker);
  writeFileSync(join(build, "vh-adlc"), binary);
  chmodSync(join(build, "vh-adlc"), 0o755);
  const p = platform();
  const asset = join(dir, `vh-adlc_${VERSION}_${p}.tar.gz`);
  const tar = Bun.spawnSync(["tar", "-czf", asset, "-C", build, "vh-adlc"]);
  expect(tar.exitCode).toBe(0);
  const assets: Record<string, Record<string, string>> = {};
  for (const plat of PLATFORMS) {
    const a: Record<string, string> = {
      name: `vh-adlc_${VERSION}_${plat}.tar.gz`,
      url: `file://${join(dir, `vh-adlc_${VERSION}_${plat}.tar.gz`)}`,
      asset_sha256: plat === p ? (opts.assetSha ?? sha256(readFileSync(asset))) : "0".repeat(64),
      binary_sha256: plat === p ? (opts.binarySha ?? sha256(binary)) : "0".repeat(64),
    };
    if (plat === p && opts.binarySha === null) delete a.binary_sha256;
    assets[plat] = a;
  }
  const lock = { version: VERSION, assets };
  const plugin = join(dir, "plugin");
  mkdirSync(join(plugin, "scripts"), { recursive: true });
  cpSync(INSTALLER, join(plugin, "scripts", "ensure-vh-adlc.sh"));
  writeFileSync(join(plugin, "vh-adlc.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  return { dir, plugin, home, marker, binary, asset, lock };
}

function run(f: Fixture, args: string[] = [], pathDirs: string[] = []) {
  const env: Record<string, string> = {
    HOME: f.home,
    XDG_CACHE_HOME: join(f.home, "cache"),
    PATH: [...pathDirs, "/usr/local/bin", "/usr/bin", "/bin"].join(":"),
    LC_ALL: "C",
  };
  const r = Bun.spawnSync(["bash", join(f.plugin, "scripts", "ensure-vh-adlc.sh"), ...args], {
    env,
    cwd: f.dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: r.exitCode, out: r.stdout.toString().trim(), err: r.stderr.toString() };
}

function cached(f: Fixture): string {
  return join(cacheBase(f.home), "vh-adlc", "bin", VERSION, platform(), "vh-adlc");
}

function onPath(f: Fixture, content: string): string {
  const bin = join(f.dir, "pathbin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "vh-adlc"), content);
  chmodSync(join(bin, "vh-adlc"), 0o755);
  return bin;
}

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[p] = sha256(readFileSync(p));
    }
  };
  walk(dir);
  return out;
}

describe("valid sources", () => {
  test("downloads, verifies and caches the locked binary", () => {
    const f = fixture();
    const r = run(f);
    expect(r.code).toBe(0);
    expect(r.out).toBe(cached(f));
    expect(sha256(readFileSync(cached(f)))).toBe(sha256(f.binary));
    expect(statSync(cached(f)).mode & 0o111).not.toBe(0);
  });

  test("reuses a verified cache entry without downloading", () => {
    const f = fixture();
    expect(run(f).code).toBe(0);
    (f.lock.assets as Record<string, Record<string, string>>)[platform()].url = `file://${join(f.dir, "absent.tar.gz")}`;
    writeFileSync(join(f.plugin, "vh-adlc.lock.json"), `${JSON.stringify(f.lock, null, 2)}\n`);
    const r = run(f);
    expect(r.code).toBe(0);
    expect(r.out).toBe(cached(f));
  });

  test("uses a PATH binary whose digest and version match the lock", () => {
    const f = fixture();
    const bin = onPath(f, f.binary);
    const r = run(f, [], [bin]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(join(bin, "vh-adlc"));
    expect(existsSync(cached(f))).toBe(false);
  });

  test("works offline from a verified cache", () => {
    const f = fixture();
    expect(run(f).code).toBe(0);
    const r = run(f, ["--offline"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(cached(f));
  });
});

describe("rejected sources", () => {
  test("ignores another version on PATH with a diagnostic", () => {
    const f = fixture();
    const bin = onPath(f, fakeBinary("1.0.0", join(f.dir, "path-ran")));
    const r = run(f, [], [bin]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(cached(f));
    expect(r.err).toContain("ignoring");
  });

  test("fails closed on a same-version PATH binary with the wrong digest", () => {
    const f = fixture();
    const bin = onPath(f, fakeBinary(VERSION, join(f.dir, "path-ran"), "# tampered\n"));
    const r = run(f, [], [bin]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("digest");
    expect(r.out).toBe("");
  });

  test("fails closed on a cache entry with the wrong digest", () => {
    const f = fixture();
    mkdirSync(join(cached(f), ".."), { recursive: true });
    writeFileSync(cached(f), fakeBinary(VERSION, f.marker, "# planted\n"));
    chmodSync(cached(f), 0o755);
    const r = run(f);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("digest");
    expect(existsSync(f.marker)).toBe(false);
  });

  test("fails closed when the cache is tampered with after an install", () => {
    const f = fixture();
    expect(run(f).code).toBe(0);
    writeFileSync(cached(f), `${readFileSync(cached(f), "utf8")}# tampered\n`);
    const before = existsSync(f.marker) ? readFileSync(f.marker, "utf8") : "";
    const r = run(f);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("digest");
    expect(existsSync(f.marker) ? readFileSync(f.marker, "utf8") : "").toBe(before);
  });

  test("never runs or caches a download whose asset digest is wrong", () => {
    const f = fixture({ assetSha: "1".repeat(64) });
    const r = run(f);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("digest");
    expect(existsSync(f.marker)).toBe(false);
    expect(existsSync(cached(f))).toBe(false);
  });

  test("never runs or caches a download whose binary digest is wrong", () => {
    const f = fixture({ binarySha: "2".repeat(64) });
    const r = run(f);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("digest");
    expect(existsSync(f.marker)).toBe(false);
    expect(existsSync(cached(f))).toBe(false);
  });

  test("fails closed when the lock has no binary digest", () => {
    const f = fixture({ binarySha: null });
    const r = run(f);
    expect(r.code).not.toBe(0);
    expect(existsSync(f.marker)).toBe(false);
    expect(existsSync(cached(f))).toBe(false);
  });

  test("fails when the verified binary reports another version", () => {
    const f = fixture({ binaryVersion: "1.2.3" });
    const r = run(f);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("version");
    expect(existsSync(cached(f))).toBe(false);
  });

  test("reports the binary unavailable offline with an empty cache", () => {
    const f = fixture();
    const r = run(f, ["--offline"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("unavailable");
    expect(existsSync(f.marker)).toBe(false);
  });
});

test("writes nothing outside the user cache", () => {
  const f = fixture();
  const plugin = snapshot(f.plugin);
  const asset = sha256(readFileSync(f.asset));
  expect(run(f).code).toBe(0);
  expect(snapshot(f.plugin)).toEqual(plugin);
  expect(sha256(readFileSync(f.asset))).toBe(asset);
  const homeFiles = Object.keys(snapshot(f.home));
  expect(homeFiles).toEqual([cached(f)]);
  const top = readdirSync(f.dir).sort();
  expect(top).toEqual(["build", "executed", "home", "plugin", `vh-adlc_${VERSION}_${platform()}.tar.gz`].sort());
});

test("installs the released binary from the real lock", () => {
  const lock = JSON.parse(readFileSync(REAL_LOCK, "utf8"));
  const dir = mkdtempSync(join(tmpdir(), "vh-adlc-real-"));
  const home = join(dir, "home");
  mkdirSync(home);
  const r = Bun.spawnSync(["bash", INSTALLER], {
    env: { HOME: home, XDG_CACHE_HOME: join(home, "cache"), PATH: "/usr/local/bin:/usr/bin:/bin", LC_ALL: "C" },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(r.exitCode).toBe(0);
  const path = r.stdout.toString().trim();
  expect(sha256(readFileSync(path))).toBe(lock.assets[platform()].binary_sha256);
  const v = Bun.spawnSync([path, "--version"], { stdout: "pipe" });
  expect(v.stdout.toString()).toBe(`vh-adlc ${lock.version}\n`);
}, 120_000);
