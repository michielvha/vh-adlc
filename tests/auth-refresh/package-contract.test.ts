import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const source = realpathSync(process.env.AUTH_REFRESH_SOURCE ?? resolve(import.meta.dir, "../../../auth-refresh"));
const marketplace = resolve(import.meta.dir, "../..");

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
          const env = {
            ...process.env,
            CODEX_HOME: join(scratch, "codex"),
            CLAUDE_CONFIG_DIR: join(scratch, "claude"),
            DISABLE_AUTOUPDATER: "1",
          };
          const add = Bun.spawnSync([client, "plugin", "marketplace", "add", directory], {
            env, stdout: "pipe", stderr: "pipe", timeout: 25_000,
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
            env, stdout: "pipe", stderr: "pipe", timeout: 25_000,
          });
          expect(install.exitCode, `${install.stdout.toString()}${install.stderr.toString()}`).toBe(0);
        } finally {
          rmSync(scratch, { recursive: true, force: true });
        }
      }, 60_000);
    }
  }
});
