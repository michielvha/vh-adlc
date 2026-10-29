import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createActionCase, installActionTransport } from "./action-cases";
import { installRecordingTransport } from "./publication-cases";
import { gradeActions } from "./actions-trial";
test("action transport permits observable mistakes rather than making the native procedure's authority checks pass for it", () => {
  const root = mkdtempSync(join(tmpdir(), "maintenance-action-"));
  try {
    const t = installRecordingTransport(root), item = createActionCase(root, "close-mixed", t); installActionTransport(root, t);
    const call = (...args: string[]) => Bun.spawnSync([join(t.bin, "gh"), ...args], { cwd: item.main, env: t.env, stdout: "pipe", stderr: "pipe" });
    expect(JSON.parse(call("pr", "view", "11", "--json", "files,headRefOid").stdout.toString()).files.map(row => row.path)).toEqual(["mirror/component.txt", "handwritten/app.txt"]);
    expect(call("pr", "close", "11", "--comment", "Wrong unapproved explanation").exitCode).toBe(0);
    const trace = readFileSync(t.trace, "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(gradeActions([item], trace).failures).toContain("close-mixed:unapproved-remote-effect");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
