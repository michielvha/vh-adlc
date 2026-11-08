import { runOwnedClient } from "../../plugins/vh-adlc/scripts/triage/owned-process";
// Tests for plugins/vh-adlc/scripts/ensure-vh-adlc.sh (scenario S15). Each case
// copies the real installer into a throwaway plugin directory with its own lock,
// so no production flag or URL override exists to bypass verification.

import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const INSTALLER = join(ROOT, "plugins", "vh-adlc", "scripts", "ensure-vh-adlc.sh");
const REAL_LOCK = join(ROOT, "plugins", "vh-adlc", "vh-adlc.lock.json");
const VERSION = "9.9.9";
const DOWNLOAD_BOUNDS = { connection: 5, archive: 25, metadata: 10, retryWindow: 2, retries: 1 };
const PLATFORMS = ["darwin_amd64", "darwin_arm64", "linux_amd64", "linux_arm64"];

// Every throwaway directory a case makes, removed when the file's tests end.
const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

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
  const dir = scratch("vh-adlc-ensure-");
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
  test("Bash invocation verifies a mode-0644 extracted installer", () => {
    const f = fixture();
    const script = join(f.plugin, "scripts", "ensure-vh-adlc.sh");
    chmodSync(script, 0o644);
    const r = run(f);
    expect(r.code).toBe(0);
    expect(r.out).toBe(cached(f));
    expect(sha256(readFileSync(cached(f)))).toBe(sha256(f.binary));
    expect(statSync(script).mode & 0o111).toBe(0);
  });

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
  test.each([false, true])("offline ignores unverified PATH without probing it; verified cache: %s", warm => {
    const f = fixture();
    if (warm) expect(run(f).code).toBe(0);
    const before = snapshot(f.home), marker = join(f.dir, "unverified-path-ran");
    const bin = onPath(f, fakeBinary(VERSION, marker, "# unverified\n"));
    const r = run(f, ["--offline"], [bin]);
    expect(r.code).toBe(warm ? 0 : 1);
    expect(r.out).toBe(warm ? cached(f) : "");
    expect(r.err).toContain("unverified");
    expect(existsSync(marker)).toBe(false);
    const after = snapshot(f.home);
    expect(after).toEqual(before);
  });

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
  const dir = scratch("vh-adlc-real-");
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
  // The settings loaders send YAML to this command, so the locked release must have it.
  const yaml = "# Settings a person edits.\nschema_version: 1\nsource_roots:\n  - src\n";
  const read = Bun.spawnSync([path, "settings", "read", "--stdin"], { stdin: Buffer.from(yaml), stdout: "pipe", stderr: "pipe" });
  const report = JSON.parse(read.stdout.toString() || "{}");
  expect({ exit: read.exitCode, result: report.result, value: report.data?.value })
    .toEqual({ exit: 0, result: "answered", value: { schema_version: 1, source_roots: ["src"] } });
}, 120_000);

function apiFallbackFixture(mode: "valid" | "bounded" | "retry-after" | "missing-download" | "empty-primary" | "wrong-primary" | "missing-metadata" | "empty-metadata" | "missing-api-archive" | "empty-api-archive" | "partial-primary-missing-api" | "wrong-host" | "wrong-browser" | "duplicate" | "wrong-archive" | "wrong-binary", canonicalProxy?: string) {
  const f = fixture(mode === "wrong-binary" ? { binarySha: "0".repeat(64) } : {});
  const assets = f.lock.assets as Record<string, Record<string, string>>;
  const selected = assets[platform()];
  selected.url = `https://github.com/michielvha/vh-adlc/releases/download/v${VERSION}/${selected.name}`;
  writeFileSync(join(f.plugin, "vh-adlc.lock.json"), `${JSON.stringify(f.lock, null, 2)}\n`);
  const endpoint = "https://api.github.com/repos/michielvha/vh-adlc/releases/assets/42";
  const asset = { id: 42, name: selected.name, browser_download_url: mode === "wrong-browser" ? "https://other.invalid/file" : selected.url,
    url: mode === "wrong-host" ? "https://other.invalid/42" : endpoint };
  const release = { tag_name: "v" + VERSION, assets: mode === "duplicate" ? [asset, asset] : [asset] };
  const bin = join(f.dir, "download-bin"), calls = join(f.dir, "downloads.log"); mkdirSync(bin);
  writeFileSync(join(bin, "curl"), `#!${process.execPath}
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const args = process.argv.slice(2), url = args.at(-1), output = args[args.indexOf('-o') + 1];
appendFileSync(${JSON.stringify(calls)}, url + '\\n');
if (${JSON.stringify(mode)} === 'bounded') {
  const connect = Number(args[args.indexOf('--connect-timeout') + 1]);
  const total = Number(args[args.indexOf('--max-time') + 1]);
  const retries = Number(args[args.indexOf('--retry') + 1]);
  const retryTime = Number(args[args.indexOf('--retry-max-time') + 1]);
  const bounds = ${JSON.stringify(DOWNLOAD_BOUNDS)};
  const metadata = url === ${JSON.stringify("https://api.github.com/repos/michielvha/vh-adlc/releases/tags/v" + VERSION)};
  if (!args.includes('--connect-timeout') || !args.includes('--max-time') || !args.includes('--retry') || !args.includes('--retry-max-time')
    || connect !== bounds.connection || total !== (metadata ? bounds.metadata : bounds.archive) || retryTime !== bounds.retryWindow
    || !Number.isInteger(retries) || retries < 0 || retries > bounds.retries) process.exit(91);
}
if (url === ${JSON.stringify(selected.url)} && ${JSON.stringify(canonicalProxy ?? null)} !== null) {
  const result = Bun.spawnSync([${JSON.stringify(Bun.which("curl", { PATH: "/usr/local/bin:/usr/bin:/bin" }))}, ...args.slice(0, -1), ${JSON.stringify(canonicalProxy ?? "")}], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  process.exit(result.exitCode ?? 1);
}
if (url === ${JSON.stringify(selected.url)}) {
  if (${JSON.stringify(mode)} === 'empty-primary') { writeFileSync(output, ''); process.exit(0); }
  if (${JSON.stringify(mode)} === 'wrong-primary') { writeFileSync(output, 'nonempty wrong primary bytes'); process.exit(0); }
  if (${JSON.stringify(mode)} === 'partial-primary-missing-api') writeFileSync(output, 'partial primary bytes');
  process.exit(${mode === "missing-download" ? 0 : 22});
}
if (url === ${JSON.stringify("https://api.github.com/repos/michielvha/vh-adlc/releases/tags/v" + VERSION)}) {
  if (${JSON.stringify(mode)} === 'missing-metadata') process.exit(0);
  writeFileSync(output, ${mode === "empty-metadata" ? "''" : "JSON.stringify(" + JSON.stringify(release) + ")"});
} else if (url === ${JSON.stringify(endpoint)} && args.includes('Accept: application/octet-stream')) {
  if (${JSON.stringify(mode)} === 'missing-api-archive' || ${JSON.stringify(mode)} === 'partial-primary-missing-api') process.exit(0);
  writeFileSync(output, ${mode === "empty-api-archive" ? "Buffer.alloc(0)" : mode === "wrong-archive" ? "Buffer.from('unverified archive')" : "readFileSync(" + JSON.stringify(f.asset) + ")"});
} else process.exit(90);
`, { mode: 0o755 });
  return { f, bin, calls };
}

test("a failed canonical download can use the same locked public asset through the GitHub API", () => {
  const { f, bin, calls } = apiFallbackFixture("valid"), r = run(f, [], [bin]);
  expect(r.code).toBe(0);
  expect(r.out).toBe(cached(f));
  expect(sha256(readFileSync(cached(f)))).toBe(sha256(f.binary));
  expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(3);
});

for (const mode of ["wrong-host", "wrong-browser", "duplicate", "wrong-archive", "wrong-binary"] as const) {
  test(`public asset API fallback rejects ${mode} without executing or caching it`, () => {
    const { f, bin, calls } = apiFallbackFixture(mode), r = run(f, [], [bin]);
    expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(mode === "wrong-archive" || mode === "wrong-binary" ? 3 : 2);
    expect(r.code).toBe(1);
    expect(existsSync(cached(f))).toBe(false);
    expect(existsSync(f.marker)).toBe(false);
  });
}

test("release metadata parsing cannot import code from the caller's checkout", () => {
  const { f, bin } = apiFallbackFixture("valid"), marker = join(f.dir, "unverified-import-ran");
  writeFileSync(join(f.dir, "json.py"), `open(${JSON.stringify(marker)}, "w").write("unverified checkout code ran")\nraise RuntimeError("shadowed json")\n`);
  const r = run(f, [], [bin]);
  expect(r.code).toBe(0);
  expect(existsSync(marker)).toBe(false);
});

test("every download has bounded connection, transfer and retry attempts", () => {
  const maximumTransferTime = 2 * (DOWNLOAD_BOUNDS.archive + DOWNLOAD_BOUNDS.retryWindow)
    + DOWNLOAD_BOUNDS.metadata + DOWNLOAD_BOUNDS.retryWindow;
  expect(maximumTransferTime).toBeLessThan(120);
  const { f, bin, calls } = apiFallbackFixture("bounded");
  const result = run(f, [], [bin]);
  expect(result.code).toBe(0);
  expect(result.out).toBe(cached(f));
  expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(3);
});

test("a server Retry-After cannot keep the installer waiting past its fallback budget", async () => {
  let requests = 0;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
    requests++; return new Response("synthetic temporary outage", { status: 503, headers: { "Retry-After": "120" } });
  } });
  try {
    const { f, bin, calls } = apiFallbackFixture("retry-after", server.url.toString());
    let processGroup = 0;
    const outcome = await runOwnedClient(["bash", join(f.plugin, "scripts", "ensure-vh-adlc.sh")], {
      started: pid => { processGroup = pid; },
      cwd: f.dir, env: { HOME: f.home, XDG_CACHE_HOME: join(f.home, "cache"),
        PATH: [bin, "/usr/local/bin", "/usr/bin", "/bin"].join(":"), LC_ALL: "C", NO_PROXY: "127.0.0.1" },
      stdout: join(f.dir, "installer.stdout"), stderr: join(f.dir, "installer.stderr"),
    }, { timeout_ms: 8000, grace_ms: 100, reap_ms: 2000 });
    expect(outcome.timed_out).toBe(false);
    expect(outcome.reaped).toBe(true);
    expect(processGroup).toBeGreaterThan(0);
    let groupEmpty = false;
    try { process.kill(-processGroup, 0); }
    catch (error) { groupEmpty = error instanceof Error && "code" in error && error.code === "ESRCH"; }
    expect(groupEmpty).toBe(true);
    if (outcome.exit_code !== 0) throw new Error(readFileSync(join(f.dir, "installer.stderr"), "utf8"));
    expect(readFileSync(join(f.dir, "installer.stdout"), "utf8").trim()).toBe(cached(f));
    expect(requests).toBeGreaterThan(0);
    expect(requests).toBeLessThanOrEqual(2);
    expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(3);
  } finally { await server.stop(true); }
}, 15000);

test("a successful curl exit without an archive still takes the verified fallback", () => {
  const { f, bin, calls } = apiFallbackFixture("missing-download");
  const result = run(f, [], [bin]);
  expect(result.code).toBe(0);
  expect(result.out).toBe(cached(f));
  expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(3);
});

test("an empty primary archive takes the locked fallback", () => {
  const { f, bin, calls } = apiFallbackFixture("empty-primary"), result = run(f, [], [bin]);
  expect(result.code).toBe(0);
  expect(result.out).toBe(cached(f));
  expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(3);
});

test("nonempty wrong primary bytes fail integrity without contacting the API", () => {
  const { f, bin, calls } = apiFallbackFixture("wrong-primary"), result = run(f, [], [bin]);
  expect(result.code).toBe(1);
  expect(result.err).toContain("digest does not match the lock");
  expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(1);
  expect(existsSync(cached(f))).toBe(false);
  expect(existsSync(f.marker)).toBe(false);
});

for (const mode of ["missing-metadata", "empty-metadata", "missing-api-archive", "empty-api-archive", "partial-primary-missing-api"] as const) {
  test(`missing download data reports unavailable for ${mode}`, () => {
    const { f, bin, calls } = apiFallbackFixture(mode), result = run(f, [], [bin]);
    const metadata = mode === "missing-metadata" || mode === "empty-metadata";
    expect(result.code).toBe(1);
    expect(result.err).toContain(metadata ? "binary unavailable: reading the locked release metadata failed"
      : "binary unavailable: downloading the locked API asset failed");
    expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(metadata ? 2 : 3);
    expect(existsSync(cached(f))).toBe(false);
    expect(existsSync(f.marker)).toBe(false);
  });
}
