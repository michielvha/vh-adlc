import { once } from "node:events";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, readlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { ExpectedResponse, RequiredRequest } from "./observations";

function executable(name: string, override?: string) {
  const path = override || Bun.which(name, { PATH: "/usr/bin:/bin" });
  if (!path || !isAbsolute(path) || !existsSync(path)) throw new Error(`Missing prerequisite: ${name}`);
  return path;
}

/** The one playwright-core version the runner supports, pinned in this directory's package manifest. */
export async function pinnedPlaywrightVersion(): Promise<string> {
  const manifest: unknown = await Bun.file(join(import.meta.dir, "package.json")).json();
  const version = typeof manifest === "object" && manifest !== null && "dependencies" in manifest &&
    typeof manifest.dependencies === "object" && manifest.dependencies !== null && "playwright-core" in manifest.dependencies
    ? manifest.dependencies["playwright-core"] : undefined;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid pinned playwright-core version");
  return version;
}

export async function confinedChromium(options: {
  scratch: string; origin: URL; caFile?: string; url: URL; heading: string; deadlineMs: number;
  rules: { required: RequiredRequest[]; expected: ExpectedResponse[] };
}) {
  const { scratch, origin } = options;
  const bwrap = executable("bwrap");
  const socat = executable("socat");
  const squid = executable("squid", process.env.WEBSITE_CHECK_SQUID);
  const module = process.env.WEBSITE_CHECK_PLAYWRIGHT_MODULE;
  if (!module || !isAbsolute(module) || !existsSync(module)) throw new Error("Missing pinned Playwright module");
  const pinned = await pinnedPlaywrightVersion();
  const metadata: unknown = await Bun.file(join(dirname(module), "package.json")).json();
  if (typeof metadata !== "object" || metadata === null || !("version" in metadata) || metadata.version !== pinned) {
    throw new Error(`Website smoke requires playwright-core ${pinned}`);
  }
  const playwright = await import(module);
  const browser = playwright.chromium.executablePath().replace(/\/chromium-(\d+)\/chrome-linux64\/chrome$/, "/chromium_headless_shell-$1/chrome-headless-shell-linux64/chrome-headless-shell");
  if (!existsSync(browser)) throw new Error("Missing pinned Chromium executable");
  const probe = createServer();
  try {
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
  } catch (error) {
    probe.close();
    throw error;
  }
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Cannot allocate local port");
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));

  const guest = join(scratch, "guest");
  const home = join(guest, "home");
  const db = join(home, ".pki/nssdb");
  await mkdir(db, { recursive: true });
  if (options.caFile) {
    const certutil = executable("certutil");
    for (const args of [
      ["-N", "--empty-password", "-d", `sql:${db}`],
      ["-A", "-d", `sql:${db}`, "-t", "C,,", "-n", "website-check fixture CA", "-i", options.caFile],
    ]) {
      if (Bun.spawnSync([certutil, ...args], { stdout: "ignore", stderr: "ignore" }).exitCode !== 0) {
        throw new Error("Cannot configure Chromium fixture trust");
      }
    }
  }
  const socket = join(scratch, "proxy.sock");
  const config = join(scratch, "squid.conf");
  const packageRoot = process.env.WEBSITE_CHECK_SQUID_ROOT;
  if (packageRoot && !/^\/[a-zA-Z0-9/_.-]+$/.test(packageRoot)) {
    throw new Error("Invalid Squid package root");
  }
  const tls = origin.protocol === "https:";
  await writeFile(config, [
    `http_port 127.0.0.1:${address.port}`,
    `pid_filename ${join(scratch, "squid.pid")}`,
    `cache_log ${join(scratch, "squid.log")}`,
    "access_log none", "cache deny all", "forwarded_for delete", "via off",
    "debug_options ALL,1", "shutdown_lifetime 0 seconds",
    ...(packageRoot ? [
      `error_directory ${packageRoot}/usr/share/squid/errors/en`,
      `icon_directory ${packageRoot}/usr/share/squid/icons`,
      `mime_table ${packageRoot}/etc/squid/mime.conf`,
      `unlinkd_program ${packageRoot}/usr/lib64/squid/unlinkd`,
    ] : []),
    `acl selected_host dstdomain -n ${origin.hostname}`,
    `acl selected_port port ${origin.port || (tls ? "443" : "80")}`,
    "acl connect method CONNECT", "acl plain proto HTTP",
    `http_access allow selected_host selected_port ${tls ? "connect" : "!connect plain"}`,
    "http_access deny all", "",
  ].join("\n"));

  const processEnv = { PATH: "/usr/bin:/bin", LANG: "C", LD_LIBRARY_PATH: process.env.WEBSITE_CHECK_SQUID_LIB || "" };
  const proxy = Bun.spawn([squid, "-N", "-f", config], { env: processEnv, stderr: "ignore", stdout: "ignore" });
  let relay: ReturnType<typeof Bun.spawn<["ignore", "ignore", "ignore"]>> | undefined;
  try {
    const start = performance.now();
    while (!existsSync(join(scratch, "squid.log")) || !(await Bun.file(join(scratch, "squid.log")).text()).includes("Accepting HTTP Socket connections")) {
      if (proxy.exitCode !== null || performance.now() - start > 5_000) throw new Error("Squid failed to start");
      await Bun.sleep(20);
    }
    relay = Bun.spawn([socat, `UNIX-LISTEN:${socket},fork,mode=0600`, `TCP4:127.0.0.1:${address.port}`], {
      stdin: "ignore", stdout: "ignore", stderr: "ignore",
    });
    while (!existsSync(socket)) {
      if (relay.exitCode !== null || performance.now() - start > 5_000) throw new Error("Proxy relay failed to start");
      await Bun.sleep(20);
    }

    const worker = join(import.meta.dir, "smoke-worker.ts");
    const cache = dirname(dirname(browser));
    const parentNetwork = await readlink("/proc/self/ns/net");
    const moduleDirectory = dirname(module);
    const command = [
      bwrap, "--unshare-net", "--unshare-pid", "--unshare-ipc", "--die-with-parent",
      "--clearenv", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp",
      "--ro-bind", "/usr", "/usr", "--symlink", "usr/bin", "/bin",
      "--symlink", "usr/lib64", "/lib64", "--symlink", "usr/lib", "/lib",
      "--ro-bind-try", "/etc/fonts", "/etc/fonts",
      "--ro-bind-try", "/etc/ssl", "/etc/ssl",
      "--ro-bind-try", "/etc/pki", "/etc/pki",
      "--ro-bind-try", "/etc/ld.so.cache", "/etc/ld.so.cache",
      "--ro-bind", process.execPath, "/run/website-bun",
      "--ro-bind", worker, "/run/smoke-worker.ts",
      "--ro-bind", join(import.meta.dir, "observations.ts"), "/run/observations.ts",
      "--ro-bind", cache, cache, "--ro-bind", moduleDirectory, moduleDirectory,
      "--ro-bind", socket, "/run/proxy.sock", "--bind", guest, "/run/website-check",
      "--setenv", "HOME", "/run/website-check/home", "--setenv", "PATH", "/usr/bin:/bin",
      "--setenv", "LANG", "C.UTF-8", "--",
      "/bin/sh", "-c",
      'socat TCP4-LISTEN:3128,bind=127.0.0.1,reuseaddr,fork UNIX-CONNECT:/run/proxy.sock & PID=$!; trap \'kill "$PID" 2>/dev/null || true\' EXIT; /run/website-bun /run/smoke-worker.ts "$@"',
      "website-check", parentNetwork, module, browser, options.url.href, options.heading, String(options.deadlineMs),
      JSON.stringify(options.rules),
    ];
    const child = Bun.spawn(command, { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
    const deadline = setTimeout(() => child.kill(), options.deadlineMs + 12_000);
    try {
      const [code, stdout] = await Promise.all([child.exited, child.stdout.text()]);
      if (code !== 0) throw new Error("Confined Chromium did not complete");
      return JSON.parse(stdout);
    } finally {
      clearTimeout(deadline);
    }
  } finally {
    if (relay) { relay.kill(); await relay.exited; }
    proxy.kill();
    await proxy.exited;
  }
}
