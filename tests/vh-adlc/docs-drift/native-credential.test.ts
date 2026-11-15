import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readNativeCredential } from "../../../plugins/vh-adlc/scripts/docs-drift/transport";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function fixture(program: string) {
  const root = mkdtempSync(join(tmpdir(), "vh-native-auth-")); roots.push(root);
  const bin = join(root, "bin"); mkdirSync(bin);
  writeFileSync(join(bin, "gh"), "#!/bin/sh\n" + program, { mode: 0o755 });
  return { root, bin };
}

test.each(["github.com", "enterprise.example"])("ordinary auth uses the explicitly selected environment credential for %s", async hostname => {
  const f = fixture("exit 71\n");
  const environment = { GH_TOKEN: "synthetic-public-token", GH_ENTERPRISE_TOKEN: "synthetic-enterprise-token" };
  const token = await readNativeCredential({ hostname, cwd: f.root, path: f.bin, environment });
  expect(token).toBe(hostname === "github.com" ? environment.GH_TOKEN : environment.GH_ENTERPRISE_TOKEN);
  expect(readdirSync(f.root)).toEqual(["bin"]);
});

test("ordinary auth reads the normal gh configuration with bounded memory capture", async () => {
  const f = fixture('if [ "$HOME" != "$EXPECTED_AUTH_HOME" ] || [ -n "$ANTHROPIC_API_KEY" ] || [ -n "$SSH_AUTH_SOCK" ]; then exit 72; fi\nprintf "%s\\n" "$*" > "$HOME/calls"\nprintf "%s\\n" "synthetic-native-auth-token"\n');
  // The fake command checks the real normal-auth paths without receiving unrelated credentials.
  const program = readFileSync(join(f.bin, "gh"), "utf8").replace('"$EXPECTED_AUTH_HOME"', "'" + f.root + "'");
  writeFileSync(join(f.bin, "gh"), program, { mode: 0o755 });
  const token = await readNativeCredential({ hostname: "github.com", cwd: f.root, path: f.bin,
    environment: { HOME: f.root, XDG_CONFIG_HOME: join(f.root, "config"), GH_CONFIG_DIR: join(f.root, "gh"),
      ANTHROPIC_API_KEY: "unrelated-provider-secret", SSH_AUTH_SOCK: "unrelated-agent-socket" } });
  expect(token).toBe("synthetic-native-auth-token");
  expect(readFileSync(join(f.root, "calls"), "utf8")).toBe("auth token --hostname github.com\n");
  expect(readdirSync(f.root).sort()).toEqual(["bin", "calls"]);
});

test("failed native auth exposes no captured credential or stderr and writes no capture file", async () => {
  const f = fixture('printf "%s\\n" "synthetic-private-stdout"\nprintf "%s\\n" "synthetic-private-stderr" >&2\nexit 73\n');
  let message = "";
  try { await readNativeCredential({ hostname: "github.com", cwd: f.root, path: f.bin, environment: { HOME: f.root } }); }
  catch (error) { message = error instanceof Error ? error.message : ""; }
  expect(message).toContain("native GitHub authentication");
  expect(message).not.toContain("synthetic-private");
  expect(readdirSync(f.root)).toEqual(["bin"]);
});
