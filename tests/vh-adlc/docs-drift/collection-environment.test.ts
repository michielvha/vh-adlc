import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectionReaders, readGit, verifiedHelperEnvironment } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { resolveRoots } from "../../../plugins/vh-adlc/scripts/docs-impact/collection";
import { readYAML } from "../../../plugins/vh-adlc/scripts/settings-file";
import { commitAll, populateRepository, put } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function temporary(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-environment-")));
  roots.push(root);
  return root;
}

function environment(values: Record<string, string>, run: () => void): void {
  const before = new Map(Object.keys(values).map(key => [key, process.env[key]]));
  try { Object.assign(process.env, values); run(); }
  finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("unsupported no-lazy-fetch capability fails before any fallback read", () => {
  const root = temporary();
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "git"), '#!/bin/sh\nfor arg do\n  if [ "$arg" = "--no-lazy-fetch" ]; then printf checked >> "${0%/*}/calls"; exit 129; fi\ndone\nprintf "uncontrolled fallback\\n"\n', { mode: 0o700 });
  environment({ PATH: bin + ":" + process.env.PATH }, () => {
    expect(() => readGit(root, "show", "HEAD:file")).toThrow();
  });
  expect(readFileSync(join(bin, "calls"), "utf8")).toBe("checked");
});

test("root collection uses the restricted reader instead of inheriting credentials or Git tracing", () => {
  const root = temporary();
  const repo = join(root, "source");
  mkdirSync(repo);
  populateRepository(repo);
  put(repo, "AGENTS.md", "Feature documents: plans/\nDocumentation impact roots: [docs]\n");
  commitAll(repo);
  const actualGit = Bun.which("git");
  if (!actualGit) throw new Error("Git setup unavailable");
  const bin = join(root, "bin");
  mkdirSync(bin);
  mkdirSync(join(bin, "native"));
  symlinkSync(actualGit, join(bin, "native/git"));
  writeFileSync(join(bin, "git"), '#!/bin/sh\nprintf "%s\\n" "${GH_TOKEN-unset}" >> "${0%/*}/probe"\nexec "${0%/*}/native/git" "$@"\n', { mode: 0o700 });
  const trace = join(root, "trace-must-not-exist");
  environment({ PATH: bin + ":" + process.env.PATH, GH_TOKEN: "synthetic-parent-token", GIT_TRACE: trace }, () => {
    const report = resolveRoots(repo, collectionReaders());
    expect(report.outcome, JSON.stringify(report)).toBe("declared");
  });
  const probes = readFileSync(join(bin, "probe"), "utf8").trim().split("\n");
  expect(probes.length).toBeGreaterThan(0);
  expect(probes.every(value => value === "unset")).toBe(true);
  expect(existsSync(trace)).toBe(false);
});

test("verified YAML setup and parsing share an explicit environment without parent tokens", () => {
  const root = temporary();
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "bash"), '#!/bin/sh\nprintf "%s\\n" "${GH_TOKEN-unset}" > "${0%/*}/probe"\nexec /bin/bash "$@"\n', { mode: 0o700 });
  environment({ PATH: bin + ":" + process.env.PATH, GH_TOKEN: "synthetic-parent-token", COPILOT_GITHUB_TOKEN: "synthetic-copilot" }, () => {
    const selected = verifiedHelperEnvironment();
    expect(selected.GH_TOKEN).toBeUndefined();
    expect(selected.COPILOT_GITHUB_TOKEN).toBeUndefined();
    expect(selected.HOME).toBe(process.env.HOME);
    expect(readYAML(Buffer.from("covers: [src/]\n"), reason => { throw new Error(reason); }, { offline: true, environment: selected })).toEqual({ covers: ["src/"] });
  });
  expect(readFileSync(join(bin, "probe"), "utf8")).toBe("unset\n");
});
