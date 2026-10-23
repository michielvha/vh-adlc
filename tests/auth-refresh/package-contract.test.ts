import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const source = realpathSync(process.env.AUTH_REFRESH_SOURCE ?? resolve(import.meta.dir, "../../../auth-refresh"));
const marketplace = resolve(import.meta.dir, "../..");
const remote = process.env.AUTH_REFRESH_REMOTE_ACCEPTANCE === "1";
const remoteRef = process.env.AUTH_REFRESH_MARKETPLACE_REF ?? "feat/portable-auth-refresh";

test("both marketplaces pin the same canonical component commit", () => {
  const entries = [".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"].map((path) =>
    JSON.parse(readFileSync(join(marketplace, path), "utf8")).plugins.find((entry: { name: string }) => entry.name === "auth-refresh"));
  expect(entries[0]?.source).toEqual(entries[1]?.source);
  expect(entries[0]?.source.url).toBe("https://github.com/michielvha/auth-refresh.git");
  const pin = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: source });
  expect(pin.exitCode).toBe(0);
  expect(entries[0]?.source.sha).toBe(pin.stdout.toString().trim());
});

test("the existing standalone Claude manifest passes its native validator", () => {
  const result = Bun.spawnSync(["claude", "plugin", "validate", source], {
    stdout: "pipe", stderr: "pipe", timeout: 20_000,
  });
  expect(result.exitCode, `${result.stdout}${result.stderr}`).toBe(0);
});

test("standalone portable discovery includes a manifest and shared skill", () => {
  expect(existsSync(join(source, "plugin.json")), "portable root manifest is missing").toBe(true);
  const manifest = JSON.parse(readFileSync(join(source, "plugin.json"), "utf8"));
  expect(manifest.name).toBe("auth-refresh");
  expect(existsSync(join(source, "skills/auth-refresh/SKILL.md")), "shared skill is missing").toBe(true);
});

describe("native installs in isolated profiles", () => {
  for (const client of ["codex", "claude"]) {
    for (const [route, directory] of [["standalone", source], ["vhco-tools", marketplace]]) {
      test(`${client} installs auth-refresh through ${route}`, () => {
        const scratch = mkdtempSync(join(tmpdir(), `auth-refresh-${client}-`));
        try {
          mkdirSync(join(scratch, "codex"));
          mkdirSync(join(scratch, "claude"));
          const privateConfig = join(scratch, "auth-config.json");
          const privateCredentials = join(scratch, "credentials");
          writeFileSync(privateConfig, '{"sentinel":"preserve"}\n', { mode: 0o600 });
          writeFileSync(privateCredentials, "[fixture]\npass=fixture-only\n", { mode: 0o600 });
          const env = {
            ...process.env,
            CODEX_HOME: join(scratch, "codex"),
            CLAUDE_CONFIG_DIR: join(scratch, "claude"),
            DISABLE_AUTOUPDATER: "1",
            AUTH_REFRESH_CONFIG: privateConfig,
            AUTH_REFRESH_HOME: join(scratch, "lane-state"),
            XDG_CACHE_HOME: join(scratch, "cache"),
          };
          // Test the real source selectors and exact Git commit before publication.
          // Only this child process remaps the remote to the canonical local Git repo.
          if (!remote) {
            const count = Number(process.env.GIT_CONFIG_COUNT ?? "0");
            Object.assign(env, {
              GIT_CONFIG_COUNT: String(count + 1),
              [`GIT_CONFIG_KEY_${count}`]: `url.${pathToFileURL(source).href}.insteadOf`,
              [`GIT_CONFIG_VALUE_${count}`]: "https://github.com/michielvha/auth-refresh.git",
            });
          }
          const repo = route === "standalone" ? "michielvha/auth-refresh" : "michielvha/vh-adlc";
          const selector = remote ? (client === "codex" ? repo : `https://github.com/${repo}.git#${remoteRef}`) : directory;
          const add = Bun.spawnSync([client, "plugin", "marketplace", "add", selector,
            ...(remote && client === "codex" ? ["--ref", remoteRef] : [])], {
            env, stdout: "pipe", stderr: "pipe", timeout: 90_000,
          });
          const added = `${add.stdout.toString()}${add.stderr.toString()}`;
          expect(add.exitCode, `marketplace add failed: ${added}`).toBe(0);
          const catalogs = client === "codex"
            ? [".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"]
            : [".claude-plugin/marketplace.json"];
          const catalog = catalogs.map((path) => join(directory, path)).find(existsSync);
          expect(catalog, "installed marketplace metadata is missing").toBeDefined();
          const name = JSON.parse(readFileSync(catalog!, "utf8")).name;
          const install = Bun.spawnSync([client, "plugin", client === "codex" ? "add" : "install", `auth-refresh@${name}`], {
            env, stdout: "pipe", stderr: "pipe", timeout: 90_000,
          });
          expect(install.exitCode, `${install.stdout.toString()}${install.stderr.toString()}`).toBe(0);
          if (remote) {
            const paths = Bun.spawnSync(["rg", "--files", "--hidden", scratch, "-g", "ensure-auth-refresh.sh"]);
            const installer = paths.stdout.toString().trim().split("\n").find((path) => path.includes("/plugins/cache/"));
            expect(installer, "installed plugin bootstrap is missing").toBeDefined();
            const installedRoot = dirname(dirname(installer!));
            for (const path of ["auth-refresh.lock.json", "scripts/ensure-auth-refresh.sh", "scripts/runtime-install.py",
              "skills/auth-refresh/SKILL.md", "skills/auth-refresh/references/workflow.md",
              "skills/auth-refresh/references/capabilities.md"]) {
              expect(readFileSync(join(installedRoot, path)), `installed ${path} differs from the canonical pin`)
                .toEqual(readFileSync(join(source, path)));
            }
            const provision = Bun.spawnSync(["bash", installer!], { env, stdout: "pipe", stderr: "pipe", timeout: 150_000 });
            expect(provision.exitCode, provision.stderr.toString()).toBe(0);
            const binary = provision.stdout.toString().trim();
            expect(binary.startsWith(join(scratch, "cache/auth-refresh/bin/"))).toBe(true);
            const lock = JSON.parse(readFileSync(join(source, "auth-refresh.lock.json"), "utf8"));
            const version = Bun.spawnSync([binary, "version"], { env, stdout: "pipe", stderr: "pipe" });
            expect(version.exitCode).toBe(0);
            expect(version.stdout.toString().trim()).toBe(`auth-refresh ${lock.version}`);
            const reuse = Bun.spawnSync(["bash", installer!], { env, stdout: "pipe", stderr: "pipe", timeout: 20_000 });
            expect(reuse.exitCode, reuse.stderr.toString()).toBe(0);
            expect(reuse.stdout.toString().trim()).toBe(binary);
            const probeConfig = join(scratch, "probe-config.json");
            writeFileSync(probeConfig, JSON.stringify({ identities: [{
              name: "fixture-token", type: "http_token", file: join(scratch, "absent-token"),
              url: "https://example.invalid/token",
            }] }), { mode: 0o600 });
            const probe = Bun.spawnSync([binary, "check", "--json"], {
              env: { ...env, AUTH_REFRESH_CONFIG: probeConfig }, stdout: "pipe", stderr: "pipe", timeout: 10_000,
            });
            expect(probe.exitCode, probe.stderr.toString()).toBe(1);
            expect(JSON.parse(probe.stdout.toString())[0].status).toBe("MISSING");
          }
          for (const command of [
            // Codex's upgrade command applies to Git marketplaces, not these local
            // directory fixtures. Re-adding below refreshes its local plugin copy.
            ...(remote && client === "codex" ? [[client, "plugin", "marketplace", "upgrade", name]] : []),
            ...(client === "claude" ? [[client, "plugin", "marketplace", "update", name]] : []),
            [client, "plugin", client === "codex" ? "add" : "update", `auth-refresh@${name}`],
            [client, "plugin", client === "codex" ? "remove" : "uninstall", `auth-refresh@${name}`],
          ]) {
            const result = Bun.spawnSync(command, { env, stdout: "pipe", stderr: "pipe", timeout: 90_000 });
            expect(result.exitCode, `${command.join(" ")}: ${result.stdout.toString()}${result.stderr.toString()}`).toBe(0);
          }
          expect(readFileSync(privateConfig, "utf8")).toBe('{"sentinel":"preserve"}\n');
          expect(readFileSync(privateCredentials, "utf8")).toBe("[fixture]\npass=fixture-only\n");
          expect(statSync(privateCredentials).mode & 0o077).toBe(0);
        } finally {
          rmSync(scratch, { recursive: true, force: true });
        }
      }, remote ? 420_000 : 150_000);
    }
  }
});
