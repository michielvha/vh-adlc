// The loop context reports, for every file it lists, whether the local copy matches origin's default
// branch tip and which version an operation reads (docs/specs/instruction-freshness.md).
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loopContext } from "../../../plugins/vh-adlc/scripts/loop/procedure";
import { loadLoopSettings } from "../../../plugins/vh-adlc/scripts/loop/settings";

const CLI = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/loop/cli.ts");
const made: string[] = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

const ENV = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" };
function git(root: string, ...args: string[]) {
  const run = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe", env: { ...process.env, ...ENV } });
  if (run.exitCode !== 0) throw Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
  return run.stdout.toString().trim();
}
function scratch(prefix: string) { const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix))); made.push(dir); return dir; }
function write(root: string, files: Record<string, string | null>) {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) { rmSync(join(root, path), { force: true }); continue; }
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text);
  }
}
function commit(root: string, files: Record<string, string | null>, message = "change") {
  write(root, files); git(root, "add", "-A"); git(root, "commit", "-q", "-m", message); return git(root, "rev-parse", "HEAD");
}
const settings = (files: string[], procedure?: string, lenses: string[] = []) =>
  `schema_version: 1\ninstruction_files:\n${files.map(file => `  - ${file}\n`).join("")}` +
  (procedure ? `project_procedure: ${procedure}\n` : "") +
  (lenses.length ? `lenses:\n${lenses.map(name => `  - name: ${name}\n    check: Check ${name}.\n    severity: nit\n`).join("")}` : "");

/** A seed repository that publishes to a bare origin, and a clone of it. Advance origin by committing in the seed and pushing. */
function fixture(files: Record<string, string>) {
  const seed = scratch("vh-fresh-seed-"), origin = scratch("vh-fresh-origin-"), parent = scratch("vh-fresh-clone-");
  git(seed, "init", "-q", "-b", "main"); commit(seed, files, "first");
  git(origin, "init", "-q", "--bare", "-b", "main");
  git(seed, "remote", "add", "origin", origin); git(seed, "push", "-q", "origin", "main");
  git(parent, "clone", "-q", origin, "clone");
  const clone = join(parent, "clone");
  git(clone, "config", "user.name", "t"); git(clone, "config", "user.email", "t@example.invalid");
  const advance = (change: Record<string, string | null>) => { const sha = commit(seed, change, "advance"); git(seed, "push", "-q", "origin", "main"); return sha; };
  return { seed, origin, clone, advance };
}

type Entry = { path: string; state: string; read: string | null };
type Freshness = { default_branch: string; tip: string | null; reason?: string; settings: Entry & { error?: string }; files: Entry[] };
function context(repo: string, ...extra: string[]) {
  const run = Bun.spawnSync([process.execPath, CLI, "context", "--repo", repo, ...extra], { stdout: "pipe", stderr: "pipe",
    env: { ...process.env, XDG_CONFIG_HOME: join(tmpdir(), "vh-fresh-no-override"), GIT_TERMINAL_PROMPT: "0" }, timeout: 90_000 });
  const out = run.stdout.toString();
  return { code: run.exitCode, stderr: run.stderr.toString(), json: JSON.parse(out || "{}") as { read: string[]; lenses: unknown[]; lensText: string; plugin: unknown; freshness: Freshness } };
}
const byPath = (freshness: Freshness) => Object.fromEntries(freshness.files.map(entry => [entry.path, entry]));

describe("per-file states against the default branch tip", () => {
  test("stale, current and edited files each report their state and the version to read (AC-01, AC-02)", () => {
    const { clone, advance } = fixture({
      ".vh-adlc/loop.yaml": settings(["AGENTS.md", "a.md", "b.md", "c.md"], "agents/procedure.md"),
      "AGENTS.md": "rules v1\n", "agents/procedure.md": "procedure v1\n", "a.md": "same\n", "b.md": "b v1\n", "c.md": "c v1\n",
    });
    const tip = advance({ "AGENTS.md": "rules v2\n", "agents/procedure.md": "procedure v2\n", "b.md": "b v2 at tip\n", "c.md": "c v2 at tip\n" });
    commit(clone, { "b.md": "b edited on this branch\n" });
    write(clone, { "c.md": "c edited, not committed\n" });

    const { code, json } = context(clone, "--default-branch", "main");
    expect(code).toBe(0);
    expect(json.freshness.tip).toBe(tip);
    expect(json.freshness.default_branch).toBe("main");
    expect(json.read).toEqual(["AGENTS.md", "a.md", "b.md", "c.md", "agents/procedure.md"]);
    const files = byPath(json.freshness);
    expect(files["AGENTS.md"]).toEqual({ path: "AGENTS.md", state: "stale", read: `${tip}:AGENTS.md` });
    expect(files["agents/procedure.md"]).toEqual({ path: "agents/procedure.md", state: "stale", read: `${tip}:agents/procedure.md` });
    expect(files["a.md"]).toEqual({ path: "a.md", state: "current", read: "a.md" });
    expect(files["b.md"]).toEqual({ path: "b.md", state: "edited", read: "b.md" });
    expect(files["c.md"]).toEqual({ path: "c.md", state: "edited", read: "c.md" });
    expect(json.freshness.files.map(entry => entry.path)).toEqual(json.read);
    expect(git(clone, "show", files["AGENTS.md"].read!)).toBe("rules v2");
    expect(git(clone, "show", files["agents/procedure.md"].read!)).toBe("procedure v2");
  });

  test("a listed file the tip deleted reads as removed while this branch keeps its own settings (AC-04)", () => {
    const { clone, advance } = fixture({
      ".vh-adlc/loop.yaml": settings(["AGENTS.md", "d.md"]), "AGENTS.md": "rules\n", "d.md": "d\n",
    });
    advance({ "d.md": null, ".vh-adlc/loop.yaml": settings(["AGENTS.md"]) });
    commit(clone, { ".vh-adlc/loop.yaml": settings(["AGENTS.md", "d.md"], undefined, ["local-lens"]) });

    const { code, json } = context(clone, "--default-branch", "main");
    expect(code).toBe(0);
    expect(json.freshness.settings.state).toBe("edited");
    expect(byPath(json.freshness)["d.md"]).toEqual({ path: "d.md", state: "removed", read: null });
    expect(byPath(json.freshness)["AGENTS.md"].state).toBe("current");
  });
});

describe("the checkout stays as it was", () => {
  test("only origin's tracking ref for the default branch moves, even when origin has a new tag (AC-06)", () => {
    const { seed, clone, advance } = fixture({ ".vh-adlc/loop.yaml": settings(["AGENTS.md"]), "AGENTS.md": "v1\n" });
    const tip = advance({ "AGENTS.md": "v2\n" });
    git(seed, "tag", "v9.9.9", tip); git(seed, "push", "-q", "origin", "v9.9.9");
    write(clone, { "scratch.txt": "untracked\n" });
    const snapshot = () => ({
      head: git(clone, "rev-parse", "HEAD"), branch: git(clone, "symbolic-ref", "HEAD"),
      status: git(clone, "status", "--porcelain=v2"), tree: git(clone, "write-tree"),
      // A symbolic ref such as origin/HEAD is compared by its target, not by the commit it resolves to.
      refs: git(clone, "for-each-ref", "--format=%(refname) %(if)%(symref)%(then)-> %(symref)%(else)%(objectname)%(end)")
        .split("\n").filter(line => !line.startsWith("refs/remotes/origin/main ")),
    });
    const before = snapshot();
    const { code } = context(clone, "--default-branch", "main");
    expect(code).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(git(clone, "rev-parse", "refs/remotes/origin/main")).toBe(tip);
    expect(git(clone, "tag", "--list")).toBe("");
  });
});

describe("resolving the default branch", () => {
  test("a clone without origin/HEAD still verifies, with and without the flag (AC-08)", () => {
    const { clone, advance } = fixture({ ".vh-adlc/loop.yaml": settings(["AGENTS.md"]), "AGENTS.md": "v1\n" });
    const tip = advance({ "AGENTS.md": "v2\n" });
    git(clone, "symbolic-ref", "--delete", "refs/remotes/origin/HEAD");
    for (const extra of [["--default-branch", "main"], []]) {
      const { code, json } = context(clone, ...extra);
      expect(code).toBe(0);
      expect(json.freshness.tip).toBe(tip);
      expect(json.freshness.files.some(entry => entry.state === "unverified")).toBe(false);
      expect(json.freshness.settings.state).not.toBe("unverified");
    }
  });
});

describe("the read rule in the skills and references (AC-07)", () => {
  const PLUGIN = resolve(import.meta.dir, "../../../plugins/vh-adlc");
  const COMMAND = "`bun scripts/loop/cli.ts context --default-branch <default branch>`";
  const POINTER = "`references/loop-settings.md` (Instruction freshness)";
  const CONVENTIONS = "The conventions revision is always the one `vh-adlc knowledge` resolves from the checkout.";
  const sentences = (text: string) => text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z`])/);
  const points = (text: string) => sentences(text).some(sentence => sentence.includes(COMMAND) && sentence.includes(POINTER));
  function section(text: string, heading: string): string {
    const match = new RegExp(`^(#+) ${heading}\\s*$`, "m").exec(text);
    if (!match) return "";
    const rest = text.slice(match.index + match[0].length);
    const next = new RegExp(`^#{1,${match[1].length}} `, "m").exec(rest);
    return next ? rest.slice(0, next.index) : rest;
  }
  const ruleOk = (text: string) => ["`--default-branch <default branch>`", "`git show <read>`", CONVENTIONS].every(phrase => section(text, "Instruction freshness").includes(phrase));

  test("the pointer pattern accepts the planned sentence and rejects the two wrong ones", () => {
    expect(points("Before acting, run `bun scripts/loop/cli.ts context --default-branch <default branch>` and read every file it lists at the version `references/loop-settings.md` (Instruction freshness) names.")).toBe(true);
    expect(points("Before acting, read every file `bun scripts/loop/cli.ts context` lists.")).toBe(false);
    expect(points("Run `bun scripts/loop/cli.ts context --default-branch <default branch>`. Read `references/loop-settings.md` (Instruction freshness).")).toBe(false);
  });

  test("the rule pattern accepts the three rule bullets and rejects the conventions sentence alone or replaced", () => {
    const bullets = "## Instruction freshness\n\n- Run `context` with `--default-branch <default branch>`.\n- Read each entry of `freshness.files` at its `read` value, a revision with `git show <read>`.\n- " + CONVENTIONS + "\n\n## Next\n";
    expect(ruleOk(bullets)).toBe(true);
    expect(ruleOk("## Instruction freshness\n\n" + CONVENTIONS + "\n")).toBe(false);
    expect(ruleOk(bullets.replace(CONVENTIONS, "The conventions revision is the one the tip's `AGENTS.md` pins."))).toBe(false);
  });

  const pointed = [...["spec", "tasks", "implement", "review", "ship", "investigate", "resume", "orchestrate"].map(name => `skills/vh-adlc-${name}/SKILL.md`), "references/loop.md"];
  test.each(pointed)("%s points to the read rule with the default-branch command", path => {
    expect(points(readFileSync(join(PLUGIN, path), "utf8"))).toBe(true);
  });

  test("references/loop-settings.md states the read rule and keeps the conventions revision from the checkout", () => {
    expect(ruleOk(readFileSync(join(PLUGIN, "references", "loop-settings.md"), "utf8"))).toBe(true);
  });
});

describe("settings behind the tip", () => {
  test("stale local settings take the reading list and lenses from the tip, including a file the clone lacks (AC-03)", () => {
    const { clone, advance } = fixture({ ".vh-adlc/loop.yaml": settings(["AGENTS.md"]), "AGENTS.md": "rules\n" });
    const tip = advance({ "e.md": "new rule file\n", ".vh-adlc/loop.yaml": settings(["AGENTS.md", "e.md"], undefined, ["tip-lens"]) });

    const { code, json } = context(clone, "--default-branch", "main");
    expect(code).toBe(0);
    expect(json.freshness.settings).toEqual({ path: ".vh-adlc/loop.yaml", state: "stale", read: `${tip}:.vh-adlc/loop.yaml` });
    expect(json.read).toEqual(["AGENTS.md", "e.md"]);
    expect(byPath(json.freshness)["e.md"]).toEqual({ path: "e.md", state: "stale", read: `${tip}:e.md` });
    expect(json.lenses).toEqual([{ name: "tip-lens", check: "Check tip-lens.", severity: "nit" }]);
    expect(json.lensText).toBe("- tip-lens (nit): Check tip-lens.");
  });

  test("tip settings that fail to load keep the local list and report the error (AC-03)", () => {
    const { clone, advance } = fixture({ ".vh-adlc/loop.yaml": settings(["AGENTS.md"], undefined, ["local-lens"]), "AGENTS.md": "rules\n" });
    advance({ ".vh-adlc/loop.yaml": "schema_version: 2\ninstruction_files:\n  - AGENTS.md\n" });

    const { code, json } = context(clone, "--default-branch", "main");
    expect(code).toBe(0);
    expect(json.freshness.settings.state).toBe("stale");
    expect(json.freshness.settings.error).toMatch(/schema_version/);
    expect(json.read).toEqual(["AGENTS.md"]);
    expect(json.lenses).toEqual([{ name: "local-lens", check: "Check local-lens.", severity: "nit" }]);
  });
});

describe("without a usable origin or tip", () => {
  const files = { ".vh-adlc/loop.yaml": settings(["AGENTS.md"], "agents/procedure.md", ["local-lens"]), "AGENTS.md": "rules\n", "agents/procedure.md": "procedure\n" };
  const local = (clone: string) => loopContext(loadLoopSettings(clone, { overridePath: null }));
  function expectUnverified(clone: string, extra: string[], reason: RegExp) {
    const { code, json } = context(clone, ...extra);
    expect(code).toBe(0);
    expect(json.freshness.tip).toBeNull();
    expect(json.freshness.reason).toMatch(reason);
    expect(json.freshness.files.length).toBeGreaterThan(0);
    for (const entry of json.freshness.files) expect(entry).toEqual({ path: entry.path, state: "unverified", read: entry.path });
    expect(json.freshness.settings.state).toBe("unverified");
    expect({ read: json.read, lenses: json.lenses, lensText: json.lensText }).toEqual(local(clone));
  }

  test("a clone with no remote (AC-05)", () => {
    const { clone } = fixture(files);
    git(clone, "remote", "remove", "origin");
    expectUnverified(clone, ["--default-branch", "main"], /no origin remote/);
  });

  test("an origin at a missing path, without origin/HEAD or the flag, names --default-branch (AC-05)", () => {
    const { clone } = fixture(files);
    git(clone, "remote", "set-url", "origin", join(clone, "missing-origin"));
    git(clone, "symbolic-ref", "--delete", "refs/remotes/origin/HEAD");
    expectUnverified(clone, [], /--default-branch/);
  });

  test("an origin at a missing path with the flag names the failed fetch (AC-05)", () => {
    const { clone } = fixture(files);
    git(clone, "remote", "set-url", "origin", join(clone, "missing-origin"));
    expectUnverified(clone, ["--default-branch", "main"], /fetching origin\/main failed/);
  });

  test("a held lock on the tracking ref, with origin ahead, names the failed fetch (AC-05)", () => {
    const { clone, advance } = fixture(files);
    advance({ "AGENTS.md": "rules v2\n" });
    const gitDir = git(clone, "rev-parse", "--absolute-git-dir");
    mkdirSync(join(gitDir, "refs", "remotes", "origin"), { recursive: true });
    writeFileSync(join(gitDir, "refs", "remotes", "origin", "main.lock"), "");
    expectUnverified(clone, ["--default-branch", "main"], /fetching origin\/main failed/);
  });

  test("a branch with history unrelated to origin's names the missing merge base (AC-05)", () => {
    const { clone } = fixture(files);
    git(clone, "checkout", "-q", "--orphan", "unrelated");
    commit(clone, { "AGENTS.md": "unrelated rules\n" }, "unrelated root");
    expectUnverified(clone, ["--default-branch", "main"], /merge base/);
  });
});
