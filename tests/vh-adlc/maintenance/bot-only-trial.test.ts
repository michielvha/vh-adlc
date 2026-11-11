import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createBotOnlyCase } from "./bot-only-trial";
import { installRecordingTransport } from "./publication-cases";
import { git } from "./fixtures";
test("real go mod tidy changes the selected manifest without selecting a new constraint or authored source repair", () => {
  const root = mkdtempSync(join(tmpdir(), "maintenance-go-bot-"));
  try {
    const transport = installRecordingTransport(root), f = createBotOnlyCase(root, transport), cache = join(root, "go-cache"); mkdirSync(cache);
    const env = { ...transport.env, GOTOOLCHAIN: "local", GOWORK: "off", GOCACHE: cache, GOMODCACHE: join(root, "go-modules") }, call = (...args: string[]) => Bun.spawnSync([join(transport.bin, "go"), ...args], { cwd: f.seed, env, stdout: "pipe", stderr: "pipe" });
    const before = readFileSync(join(f.seed, "go.mod"), "utf8"); expect(before).toContain("example/widget v1.1.0"); expect(before).toContain("example/unused v1.0.0");
    const tidy = call("mod", "tidy"); expect({ exit: tidy.exitCode, error: tidy.stderr.toString() }).toEqual({ exit: 0, error: "" });
    const after = readFileSync(join(f.seed, "go.mod"), "utf8"); expect(after).toContain("example/widget v1.1.0"); expect(after).not.toContain("example/unused v1.0.0");
    expect(git(f.seed, "diff", "--name-only")).toBe("go.mod"); const check = call("test", "-mod=readonly", "./..."); expect({ exit: check.exitCode, error: check.stderr.toString() }).toEqual({ exit: 0, error: "" });
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 120_000);
