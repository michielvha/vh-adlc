import { afterEach } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { LabelsGitHub } from "../../../plugins/vh-adlc/scripts/labels/github";

export type FixtureLabel = { name: string; color: string; description: string | null };
const made: string[] = [];
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function git(root: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

/** A checkout whose origin is example/project, optionally with triage settings. */
export function checkout(settings?: string, origin = "https://github.com/example/project.git") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-labels-repo-"))); made.push(root);
  git(root, "init", "-q"); git(root, "remote", "add", "origin", origin);
  if (settings !== undefined) { mkdirSync(join(root, ".vh-adlc")); writeFileSync(join(root, ".vh-adlc/triage.yaml"), settings); }
  return root;
}

/** A fake GitHub holding labels for one repository; returns the transport and its call log. */
export function tracker(labels: FixtureLabel[], options: { actor?: string; host?: string; repository?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vh-labels-gh-")); made.push(dir);
  const state = join(dir, "state.json");
  writeFileSync(state, JSON.stringify({ host: options.host ?? "github.com", repository: options.repository ?? "example/project", actor: options.actor ?? "owner", labels }));
  const executable = join(dir, "gh");
  writeFileSync(executable, `#!/usr/bin/env bash\nexec '${process.execPath}' '${resolve(import.meta.dir, "fake-gh.ts")}' "$@"\n`); chmodSync(executable, 0o755);
  const env = { ...process.env, LABELS_FIXTURE: state };
  return {
    state, executable, env,
    gh: (host = options.host ?? "github.com") => new LabelsGitHub(host, { executable, env }),
    calls: (): { method: string; args: string[]; input: unknown }[] => existsSync(state + ".calls") ? readFileSync(state + ".calls", "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [],
    writes() { return this.calls().filter((call) => call.method !== "GET"); },
    labels: (): FixtureLabel[] => JSON.parse(readFileSync(state, "utf8")).labels,
    edit(change: (labels: FixtureLabel[]) => void) { const value = JSON.parse(readFileSync(state, "utf8")); change(value.labels); writeFileSync(state, JSON.stringify(value)); },
  };
}

export const vocabularyPath = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/labels/vocabulary.json");
export const write = (path: string, text: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
