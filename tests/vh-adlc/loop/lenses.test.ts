// Project procedure, instruction files and declared lenses reach every SDD operation and the reviewer.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadLoopSettings } from "../../../plugins/vh-adlc/scripts/loop/settings";
import { loopContext } from "../../../plugins/vh-adlc/scripts/loop/procedure";
import { reviewPrompt } from "../../../plugins/vh-adlc/scripts/loop/cli";
import { runReviewRoute } from "../../../plugins/vh-adlc/scripts/loop/review-route";

const made: string[] = [];
afterAll(() => { for (const dir of made) { Bun.spawnSync(["chmod", "-R", "u+w", dir]); rmSync(dir, { recursive: true, force: true }); } });
function git(root: string, ...args: string[]) {
  const run = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } });
  if (run.exitCode !== 0) throw Error(run.stderr.toString());
  return run.stdout.toString().trim();
}
function repo(files: Record<string, string>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-lens-")));
  made.push(root);
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); }
  git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "commit", "-q", "-m", "f");
  return { root, commit: git(root, "rev-parse", "HEAD") };
}

const settings = `schema_version: 1
project_procedure: agents/loop-project.md
instruction_files: [CLAUDE.md, AGENTS.md]
lenses:
  - name: api-ui-provider
    check: Every user-configurable capability names its API route, its UI and its provider resource.
    severity: blocking
  - name: satellite
    check: A new deployable component names its satellite repository.
    severity: blocking
`;
const base = {
  ".vh-adlc/loop.yaml": settings, "agents/loop-project.md": "# Project procedure\nRun make verify.\n",
  "CLAUDE.md": "Every capability exists in the API first.\n", "AGENTS.md": "Read CLAUDE.md.\n",
};

describe("loop context", () => {
  test("settings name the project procedure, instruction files and lenses", () => {
    const loaded = loadLoopSettings(repo(base).root, { overridePath: null });
    expect(loaded.project_procedure).toBe("agents/loop-project.md");
    expect(loaded.instruction_files).toEqual(["CLAUDE.md", "AGENTS.md"]);
    expect(loaded.lenses.map(lens => [lens.name, lens.severity])).toEqual([["api-ui-provider", "blocking"], ["satellite", "blocking"]]);
  });

  test("every operation's reading list starts with the instruction files and the project procedure", () => {
    const context = loopContext(loadLoopSettings(repo(base).root, { overridePath: null }));
    expect(context.read).toEqual(["CLAUDE.md", "AGENTS.md", "agents/loop-project.md"]);
    expect(context.lensText).toContain("api-ui-provider (blocking): Every user-configurable capability");
  });

  test("a missing referenced file, an unknown severity or a duplicate lens is refused", () => {
    for (const [yaml, reason] of [
      [settings.replace("agents/loop-project.md", "agents/absent.md"), "project_procedure must reference a file"],
      [settings.replace("severity: blocking\n  - name: satellite", "severity: urgent\n  - name: satellite"), "lenses[0].severity"],
      [settings.replace("name: satellite", "name: api-ui-provider"), "lenses duplicates"],
    ] as const) {
      let error = "";
      try { loadLoopSettings(repo({ ...base, ".vh-adlc/loop.yaml": yaml }).root, { overridePath: null }); } catch (e) { error = String(e); }
      expect(error).toContain(reason);
    }
  });

  test("without settings the reading list is empty and no lens applies", () => {
    const context = loopContext(loadLoopSettings(repo({ "README.md": "x\n" }).root, { overridePath: null }));
    expect(context).toEqual({ read: [], lenses: [], lensText: "" });
  });
});

describe("the reviewer receives the lenses", () => {
  test("the review prompt carries each declared lens and the instruction files to read", () => {
    const loaded = loadLoopSettings(repo(base).root, { overridePath: null });
    const prompt = reviewPrompt({ repository: "r", document: "d", commit: "c", kind: "spec", docsRevision: "x", binary: "b", pluginPin: "p" }, loopContext(loaded));
    expect(prompt).toContain("Repository instructions to check the document against: CLAUDE.md, AGENTS.md, agents/loop-project.md");
    expect(prompt).toContain("satellite (blocking): A new deployable component names its satellite repository.");
  });

  test("a stub reviewer that only flags what reaches it returns a finding for a lens-breaking spec and none for a compliant one", async () => {
    const stubDir = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-lens-stub-")));
    made.push(stubDir);
    const stub = join(stubDir, "reviewer.sh");
    // Flags a document that adds a deployable component without naming a satellite, but only if the lens reached it.
    writeFileSync(stub, `#!/bin/bash\nprompt="$1"; commit=$(grep -o 'Commit: [0-9a-f]*' <<<"$prompt" | cut -d' ' -f2)\nprintf 'MODEL: m\\nTARGET: %s\\n\\n' "$commit"\nif grep -q 'satellite (blocking)' <<<"$prompt" && grep -q 'new deployable' docs/specs/f.md && ! grep -q 'satellite' docs/specs/f.md; then\nprintf 'FINDING: F-01\\nKIND: judgement\\nSEVERITY: blocking\\nWHERE: Design\\nEVIDENCE: no satellite named\\nPROPOSAL: name it\\n'\nelse echo 'NO FINDINGS'; fi\n`);
    chmodSync(stub, 0o700);
    for (const [doc, expected] of [["# F\nAdds a new deployable launcher image.\n", "FINDING: F-01"], ["# F\nAdds a new deployable image, published by its satellite.\n", "NO FINDINGS"]] as const) {
      const { root, commit } = repo({ ...base, "docs/specs/f.md": doc });
      const loaded = loadLoopSettings(root, { overridePath: null });
      const prompt = reviewPrompt({ repository: "export", document: "docs/specs/f.md", commit, kind: "spec", docsRevision: "x", binary: "b", pluginPin: "p" }, loopContext(loaded));
      const outcome = await runReviewRoute({ repo: root, commit, kind: "spec", document: "docs/specs/f.md", route: { model: "m", argv: [stub, "{prompt}"] }, prompt, timeoutMs: 10_000 });
      expect(outcome.status).toBe("ready");
      if (outcome.status === "ready") expect(outcome.records).toContain(expected);
    }
  });
});
