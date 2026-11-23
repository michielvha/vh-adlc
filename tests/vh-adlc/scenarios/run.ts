// Runs the vh-adlc scenarios headless on Claude Code and writes summaries to
// tests/vh-adlc/evidence/claude-code/. It is not part of `bun test`: every
// scenario is a real agent run.
//
// Usage: bun tests/vh-adlc/scenarios/run.ts --phase 4 [S2 S3 ...]
//
// --phase selects the operations a partial run may use; operations scheduled
// later are reported as pending. The default is the full v1 selection.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { accept, addCI, AGENT_NAME, agentHome, build, claim, gh, SHIP_REPO, shipIssue, toGitHub, criterionRecords, pushFromElsewhere, reviewedFeature, reviewFeature, editDoc, editFeature, FEATURE_BRANCH, FEATURE_PATH, FIXTURE_TASKS, type Fixtures, git, gitEnv, OTHER_FEATURE_BRANCH, OTHER_FEATURE_PATH, plan, prepareOtherFeature, PROSE_CANARIES, SECRET_CANARIES } from "../fixtures/build";
import { CLAUDE_TOKEN, claude, cli, profile, type ToolUse, toolUses, type Turn, version } from "./host";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const EVIDENCE = join(ROOT, "tests", "vh-adlc", "evidence", "claude-code");

type Call = { code: number; args: string; json: Record<string, any> | null };

type Ctx = {
  f: Fixtures;
  turns: Turn[];
  log: () => Call[];
  commits: () => string[];
  status: () => string;
  file: (p: string) => string | null;
};

type Check = { name: string; ok: boolean; detail?: string };

type Scenario = {
  id: string;
  title: string;
  phase: number;
  run: (f: Fixtures) => Promise<{ turns: Turn[]; checks: (c: Ctx) => Check[]; notes?: string[] }>;
};

function calls(f: Fixtures): Call[] {
  if (!existsSync(f.log)) return [];
  return readFileSync(f.log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, args, ...rest] = line.split("\t");
      let json = null;
      try {
        json = JSON.parse(rest.join("\t"));
      } catch {}
      return { code: Number(code), args, json };
    });
}

// agentCommits lists the commits the agent made, on any ref, by its identity.
function agentCommits(f: Fixtures): string[] {
  return git(f.home, f.project, "log", "--all", `--author=${AGENT_NAME}`, "--format=%H%x09%s%x09%b%x1e")
    .split("\x1e")
    .map((s) => s.trim())
    .filter(Boolean);
}

function agentAdded(f: Fixtures): string[] {
  return git(f.home, f.project, "log", "--all", `--author=${AGENT_NAME}`, "--diff-filter=A", "--name-only", "--format=")
    .split("\n")
    .filter(Boolean);
}

function ctx(f: Fixtures, turns: Turn[]): Ctx {
  return {
    f,
    turns,
    log: () => calls(f),
    commits: () => agentCommits(f),
    status: () => git(f.home, f.project, "status", "--porcelain"),
    file: (p) => (existsSync(join(f.project, p)) ? readFileSync(join(f.project, p), "utf8") : null),
  };
}

const UNRELATED = ["A  NOTES.md", " M README.md", "?? scratch.txt"];

// prose drops fenced blocks and code spans, where " -- " is shell syntax rather than a dash.
function prose(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

function unrelatedIntact(c: Ctx): Check {
  const s = c.status();
  const ok = UNRELATED.every((u) => s.includes(u)) && c.file("NOTES.md") === "Unrelated staged note.\n" && c.file("scratch.txt") === "Unrelated untracked file.\n";
  return { name: "unrelated staged, unstaged and untracked work is byte-identical", ok, detail: ok ? undefined : s };
}

// words returns a call's command and positional arguments; flags may come anywhere after the command.
function words(args: string): string[] {
  const out: string[] = [];
  const parts = args.split(" ");
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "--offline") continue;
    if (parts[i].startsWith("--")) {
      if (!parts[i].includes("=")) i++;
      continue;
    }
    out.push(parts[i]);
  }
  return out;
}

function gateCalls(c: Ctx, target?: string): Call[] {
  return c.log().filter((x) => {
    const w = words(x.args);
    return w[0] === "gate" && (!target || w[1] === target);
  });
}

function said(c: Ctx, ...words: string[]): boolean {
  const text = c.turns.map((t) => t.result).join("\n").toLowerCase();
  return words.every((w) => text.includes(w.toLowerCase()));
}

type SessionOptions = {
  // The checkout the session starts in; the project's main checkout by default.
  cwd?: string;
  // Filled with every tool call of the session, read before its profile is deleted.
  uses?: ToolUse[];
  // Runs after each turn, for checks on the state between scripted owner turns.
  after?: (turn: number) => void;
  // Extra settings for the isolated profile, and the main session's model.
  settings?: Record<string, unknown>;
  model?: string;
  env?: Record<string, string>;
};

function session(f: Fixtures, plugins: string[], prompts: string[], o: SessionOptions = {}): Turn[] {
  const p = profile(f.home, o.settings);
  const turns: Turn[] = [];
  try {
    for (const [i, prompt] of prompts.entries()) {
      const t = claude(p, prompt, { cwd: o.cwd ?? f.project, pluginDirs: plugins, resume: turns.at(-1)?.sessionId || undefined, maxTurns: 80, model: o.model, env: o.env });
      turns.push(t);
      o.after?.(i);
      if (t.isError) break;
    }
    o.uses?.push(...toolUses(p));
  } finally {
    p.dispose();
  }
  return turns;
}

// The phase the run selected; S1, S5 and S14 exercise every operation scheduled up to it.
let PHASE = 7;
const OPERATION_PHASE: Record<string, number> = { investigate: 4, spec: 4, resume: 4, tasks: 5, implement: 5, review: 6, ship: 7 };
function operations(): string[] {
  return Object.keys(OPERATION_PHASE).filter((op) => OPERATION_PHASE[op] <= PHASE);
}

function writePin(f: Fixtures, sha: string, also?: string) {
  let text = `# Repository instructions\n\nRead the personal conventions at\nhttps://github.com/vhco-pro/docs/blob/${sha}/AGENTS.md\nand follow the task routes there before implementation.\n`;
  if (also) text += `\nSee also https://github.com/vhco-pro/docs/blob/${also}/README.md\n`;
  writeFileSync(join(f.project, "AGENTS.md"), text);
  git(f.home, f.project, "add", "AGENTS.md");
  git(f.home, f.project, "commit", "-q", "-m", "fixture: pin", "--", "AGENTS.md");
  git(f.home, f.project, "push", "-q", "origin", "main");
}

const TOPIC = "/vh-adlc-spec Write a draft feature document for this: greet.sh accepts a --shout flag that prints the greeting in capitals. Draft only; do not ask for a review.";

// c0 is the state a status-changing operation must leave alone: the document's status on every branch,
// and the branch list.
function c0(f: Fixtures): { status: string; branches: string } {
  const branches = git(f.home, f.project, "branch", "--list", "--format=%(refname:short)");
  const status = branches
    .split("\n")
    .map((b) => `${b}=${show(f, b, FEATURE_PATH)?.match(/^status: (\S+)/m)?.[1] ?? "-"}`)
    .join(",");
  return { status, branches };
}

// show reads a file at a ref of the project's repository, or null when it is absent there.
function show(f: Fixtures, ref: string, path: string): string | null {
  const r = Bun.spawnSync(["git", "show", `${ref}:${path}`], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
  return r.exitCode === 0 ? r.stdout.toString() : null;
}

function knowledgeResults(c: Ctx): string[] {
  return c.log().filter((x) => x.args.startsWith("knowledge")).map((x) => String(x.json?.result));
}

// hostFacts settles, from the transcripts of S1, the three host facts the spec leaves open (Hosts).
function hostFacts(uses: ToolUse[], home: string) {
  const text = (u: ToolUse) => String(u.input.file_path ?? u.input.command ?? u.input.path ?? u.input.pattern ?? "");
  const pluginFile = /(?:references\/[\w.-]+\.md|knowledge\.md|scripts\/ensure-vh-adlc\.sh)/g;
  const seen = new Map<string, boolean>();
  for (const u of uses.filter((x) => !x.subagent)) {
    for (const m of text(u).matchAll(pluginFile)) seen.set(m[0], (seen.get(m[0]) ?? false) || !u.error);
  }
  const installs = uses.filter((u) => !u.subagent && u.name === "Bash" && text(u).includes("ensure-vh-adlc.sh"));
  const viaEnv = installs.filter((u) => text(u).includes("CLAUDE_PLUGIN_ROOT")).length;
  const bin = join(home, ".cache", "vh-adlc", "bin");
  const cached = existsSync(bin) ? readdirSync(bin) : [];
  const reviewer = uses.filter((u) => u.subagent);
  const reviewerTools = [...new Set(reviewer.map((u) => u.name))].sort();
  const reads = [...seen].map(([k, ok]) => `${k} ${ok ? "ok" : "failed"}`).join(", ") || "none";
  return {
    readsOutside: [...seen].some(([k, ok]) => ok && k.startsWith("references/")) && seen.get("knowledge.md") === true,
    installed: installs.some((u) => !u.error) && cached.length > 0,
    reviewerRan: reviewer.length > 0 && reviewerTools.some((t) => t === "Read" || t === "Bash"),
    notes: [
      `Host fact, files outside the skill directory: ${reads}`,
      `Host fact, plugin root: ${installs.length} installer call(s), ${viaEnv} through CLAUDE_PLUGIN_ROOT and ${installs.length - viaEnv} through a literal plugin path; cached binary versions: ${cached.join(", ") || "none"}`,
      `Host fact, unknown tool names (read, search, execute): the reviewer loaded and made ${reviewer.length} tool call(s) with ${reviewerTools.join(", ") || "no tools"}, ${reviewer.filter((u) => u.error).length} of them errors`,
    ],
  };
}

// The invalid S7 variants: a setup, the gate condition it must fail, and an optional prompt.
const S7_VARIANTS = [
  ["open question", (f: Fixtures) => { editFeature(f, "## Open Questions\n\nNone.\n", "## Open Questions\n\n### Q1: Should the greeting end with a full stop?\n"); accept(f); }, "no_open_questions"],
  ["missing Test Plan row", (f: Fixtures) => { editFeature(f, "| AC-01 | `./test.sh` |\n", ""); accept(f); }, "test_plan_complete"],
  ["stale review", (f: Fixtures) => { accept(f); editFeature(f, "prints `Hello, Ada.`", "prints `Hello, Ada!`"); }, "spec_review_fresh"],
  ["fresh blocking review", (f: Fixtures) => accept(f, "FINDING: F-01\nKIND: factual\nSEVERITY: blocking\nWHERE: Design\nEVIDENCE: greet.sh:2\nPROPOSAL: Say how the name is quoted."), "spec_review_clean"],
  ["malformed records", (f: Fixtures) => accept(f, "Looks good to me."), "spec_review_clean"],
  ["no acceptance", (f: Fixtures) => accept(f, "NO FINDINGS", false), "accepted", `/vh-adlc-spec I have not accepted ${FEATURE_PATH}. Move it to planned if, and only if, the gate allows it.`],
] as const;

// pluginState is what installing vh-adlc must leave alone in a profile: github-app-registration's entry and
// the SHA-256 of each of its installed files, and the marketplace's entry.
function pluginState(config: string) {
  const json = (name: string) => {
    const path = join(config, "plugins", name);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  };
  const installed = json("installed_plugins.json").plugins ?? {};
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (path.includes(`${"/"}github-app-registration${"/"}`)) files[path.slice(config.length)] = createHash("sha256").update(readFileSync(path)).digest("hex");
    }
  };
  walk(join(config, "plugins"));
  return { app: { entry: installed["github-app-registration@vhco-tools"] ?? null, files }, files, vhAdlc: !!installed["vh-adlc@vhco-tools"], marketplace: json("known_marketplaces.json")["vhco-tools"] ?? null };
}

// S1 invokes each scheduled operation once on the draft fixture; the later ones stop at their gate.
const S1_PROMPTS: Record<string, string> = {
  investigate: "/vh-adlc-investigate Why does ./test.sh fail? Report only; change nothing.",
  resume: "/vh-adlc-resume greeting-name",
  spec: `/vh-adlc-spec review ${FEATURE_PATH}. If you dispatch the reviewer, say which agent name you dispatched and whether the dispatch succeeded. Do not accept anything.`,
  tasks: "/vh-adlc-tasks greeting-name",
  implement: "/vh-adlc-implement greeting-name",
  review: "/vh-adlc-review greeting-name",
  ship: "/vh-adlc-ship greeting-name",
};

const SCENARIOS: Scenario[] = [
  {
    id: "S1",
    title: "Install, list, invoke the scheduled operations, uninstall; host facts",
    phase: 4,
    run: async (f) => {
      // The real package, installed from this checkout into an isolated profile.
      const home = scratch("vh-adlc-s1-home-");
      agentHome(home);
      const p = profile(home);
      const out: string[] = [];
      const turns: Turn[] = [];
      let listed = "";
      let details = "";
      let after = "";
      let uses: ToolUse[] = [];
      try {
        out.push(String(cli(p, f.project, "plugin", "marketplace", "add", ROOT).code));
        out.push(String(cli(p, f.project, "plugin", "install", "vh-adlc@vhco-tools").code));
        listed = cli(p, f.project, "plugin", "list").out;
        details = cli(p, f.project, "plugin", "details", "vh-adlc@vhco-tools").out;
        for (const op of operations()) {
          turns.push(claude(p, S1_PROMPTS[op], { cwd: f.project, maxTurns: 80 }));
        }
        uses = toolUses(p);
        out.push(String(cli(p, f.project, "plugin", "uninstall", "vh-adlc@vhco-tools").code));
        out.push(String(cli(p, f.project, "plugin", "marketplace", "remove", "vhco-tools").code));
        after = cli(p, f.project, "plugin", "list").out;
      } finally {
        p.dispose();
      }
      const facts = hostFacts(uses, home);
      return {
        turns,
        notes: [`CLI exit codes (marketplace add, install, uninstall, marketplace remove): ${out.join(", ")}`, ...facts.notes],
        checks: (c) => [
          { name: "install and marketplace commands succeed", ok: out.every((x) => x === "0"), detail: out.join(",") },
          { name: "the skills read references/ and knowledge.md outside their own directory", ok: facts.readsOutside },
          { name: "the installer ran from the plugin's scripts/ and installed the release binary", ok: facts.installed },
          { name: "the reviewer ran with the unknown tool names in its list", ok: facts.reviewerRan },
          { name: "every scheduled skill and the reviewer are listed", ok: [...operations().map((op) => `vh-adlc-${op}`), "vh-adlc-reviewer"].every((s) => details.includes(s)) && listed.includes("vh-adlc@vhco-tools") },
          { name: "each operation ran without an error", ok: turns.length === operations().length && turns.every((t) => !t.isError) },
          { name: "the reviewer was dispatched", ok: said(c, "vh-adlc:vh-adlc-reviewer") },
          { name: "uninstall leaves no vh-adlc plugin", ok: !after.includes("vh-adlc@vhco-tools") },
          citesGuide(c),
          unrelatedIntact(c),
        ],
      };
    },
  },
  {
    id: "S1.host",
    title: "Installing and uninstalling vh-adlc leaves github-app-registration as it was (CLI only)",
    phase: 4,
    run: async (f) => {
      // D-30: no model runs here, only the host's plugin commands in an isolated profile.
      const home = scratch("vh-adlc-s1-home-");
      agentHome(home);
      const p = profile(home);
      const steps: { args: string; code: number }[] = [];
      const shots: Record<string, ReturnType<typeof pluginState>> = {};
      try {
        const run = (...a: string[]) => steps.push({ args: a.join(" "), code: cli(p, f.project, ...a).code });
        run("plugin", "marketplace", "add", ROOT);
        run("plugin", "install", "github-app-registration@vhco-tools");
        shots.before = pluginState(p.config);
        run("plugin", "install", "vh-adlc@vhco-tools");
        shots.during = pluginState(p.config);
        run("plugin", "uninstall", "vh-adlc@vhco-tools");
        shots.after = pluginState(p.config);
        run("plugin", "uninstall", "github-app-registration@vhco-tools");
        run("plugin", "marketplace", "remove", "vhco-tools");
      } finally {
        p.dispose();
      }
      return {
        turns: [],
        notes: [...steps.map((x) => `\`claude ${x.args.replace(ROOT, "<checkout>")}\`: exit ${x.code}`), `github-app-registration files hashed: ${Object.keys(shots.before?.files ?? {}).length}`],
        checks: (c) => [
          { name: "every plugin command succeeded", ok: steps.length === 6 && steps.every((x) => x.code === 0) },
          { name: "vh-adlc was installed, then removed", ok: !!shots.during?.vhAdlc && !shots.after?.vhAdlc },
          { name: "github-app-registration's entry and files are unchanged by the install", ok: JSON.stringify(shots.during?.app) === JSON.stringify(shots.before?.app) },
          { name: "uninstalling leaves github-app-registration and the marketplace as before", ok: JSON.stringify(shots.after?.app) === JSON.stringify(shots.before?.app) && JSON.stringify(shots.after?.marketplace) === JSON.stringify(shots.before?.marketplace) },
          unrelatedIntact(c),
        ],
      };
    },
  },
  ...(
    [
      ["full-SHA pin", (f: Fixtures) => writePin(f, f.revisionA), "repository"],
      ["no pin", (_f: Fixtures) => {}, "plugin"],
      ["short-SHA pin", (f: Fixtures) => writePin(f, f.revisionA.slice(0, 7)), "invalid-pin"],
      ["main pin", (f: Fixtures) => writePin(f, "main"), "invalid-pin"],
      ["two SHAs", (f: Fixtures) => writePin(f, f.revisionA, f.revisionB), "invalid-pin"],
      ["pin lacking the standard", (f: Fixtures) => writePin(f, f.revisionC), "missing-page"],
      ["pin lacking the humanize prose guide", (f: Fixtures) => writePin(f, f.revisionD), "missing-page"],
      ["docs unreachable", (f: Fixtures) => writePin(f, "1".repeat(40)), "unreachable"],
    ] as const
  ).map(([name, setup, expected], i): Scenario => ({
    id: `S2.${i + 1}`,
    title: `Knowledge resolution: ${name}`,
    phase: 4,
    run: async (f) => {
      setup(f);
      const turns = session(f, [f.pluginA], [TOPIC]);
      return {
        turns,
        checks: (c) => {
          const k = c.log().filter((x) => x.args.startsWith("knowledge"));
          const first = k[0]?.json;
          const checks: Check[] = [{ name: "knowledge ran first", ok: c.log()[0]?.args.startsWith("knowledge") ?? false }];
          if (expected === "repository" || expected === "plugin") {
            checks.push({ name: `knowledge resolved source ${expected}`, ok: first?.result === "answered" && first?.knowledge?.source === expected });
            checks.push({ name: "a draft document was committed", ok: c.commits().some((x) => /docs?:/i.test(x)) });
            if (expected === "plugin") {
              const agents = c.file("AGENTS.md");
              checks.push({ name: "the first change onboarded the repository with the plugin pin", ok: !!agents && agents.includes(f.revisionA) && !!c.file("CLAUDE.md") });
            }
          } else {
            checks.push({ name: `knowledge stopped with ${expected}`, ok: k.length > 0 && k.every((x) => x.json?.result === expected) });
            checks.push({ name: "nothing was committed", ok: c.commits().length === 0 });
            checks.push({ name: "the report names the reason", ok: said(c, expected.replace("-", " ")) || said(c, expected) });
          }
          checks.push(unrelatedIntact(c));
          return checks;
        },
      };
    },
  })),
  ...([["A", "docs/internal/plans/"], ["B", "plans/"]] as const).map(([rev, root]): Scenario => ({
    id: `S3.${rev}`,
    title: `Docs revision ${rev} decides the document location and the planned gate`,
    phase: 4,
    run: async (f) => {
      accept(f);
      // Under revision B the accepted document moves to B's root, so no document lives outside it.
      const doc = rev === "A" ? FEATURE_PATH : "plans/greeting-name.md";
      if (rev === "B") {
        mkdirSync(join(f.project, "plans"), { recursive: true });
        git(f.home, f.project, "mv", FEATURE_PATH, doc);
        git(f.home, f.project, "commit", "-q", "-m", "fixture: plans root", "--", FEATURE_PATH, doc);
        git(f.home, f.project, "push", "-q", "origin", "main");
      }
      const plugin = rev === "A" ? f.pluginA : f.pluginB;
      const turns = session(f, [plugin], [
        TOPIC,
        `/vh-adlc-spec The owner accepted ${doc} against review R-1 in this session. It is already recorded; move the document to planned if the gate allows it, and report the gate result.`,
      ]);
      return {
        turns,
        checks: (c) => {
          const created = agentAdded(f).filter((p) => p.endsWith(".md") && !p.endsWith("AGENTS.md") && !p.endsWith("CLAUDE.md"));
          const gates = gateCalls(c, "planned").filter((g) => g.args.includes("greeting-name"));
          const status = c.file(doc)?.match(/^status: (\S+)/m)?.[1];
          const checks: Check[] = [
            { name: `the new document lives under ${root}`, ok: created.some((p) => p.startsWith(root)), detail: created.join(", ") },
            { name: "gate planned was called", ok: gates.length > 0 },
          ];
          if (rev === "A") {
            checks.push({ name: "the gate passed and the document moved to planned", ok: gates.some((g) => g.json?.result === "pass") && status === "planned" });
            checks.push({ name: "the status commit carries the gate line", ok: c.commits().some((x) => x.includes("vh-adlc gate planned: pass")) });
          } else {
            checks.push({ name: "the gate failed on all_met and the status stayed draft", ok: gates.every((g) => g.json?.result === "fail" && g.json?.data?.failing?.includes("all_met")) && status === "draft" });
          }
          checks.push(unrelatedIntact(c));
          return checks;
        },
      };
    },
  })),
  {
    id: "S4",
    title: "A local rule that conflicts with a pinned convention",
    phase: 4,
    run: async (f) => {
      writeFileSync(
        join(f.project, "AGENTS.md"),
        `# Repository instructions\n\nRead the personal conventions at\nhttps://github.com/vhco-pro/docs/blob/${f.revisionA}/AGENTS.md\n\n## Local rules\n\nNever put a skip-CI marker in a commit message in this repository; every commit runs CI here.\n`,
      );
      git(f.home, f.project, "add", "AGENTS.md");
      git(f.home, f.project, "commit", "-q", "-m", "fixture: local rule", "--", "AGENTS.md");
      git(f.home, f.project, "push", "-q", "origin", "main");
      const turns = session(f, [f.pluginA], [TOPIC]);
      return {
        turns,
        checks: (c) => [
          { name: "a draft document was committed", ok: c.commits().length > 0 },
          { name: "no commit carries a skip-CI marker", ok: c.commits().every((x) => !/\[skip ci\]|\[ci skip\]/i.test(x)) },
          { name: "the conflict is reported", ok: said(c, "conflict") },
          unrelatedIntact(c),
        ],
      };
    },
  },
  {
    id: "S5",
    title: "Another plugin with spec, implement and review; activation",
    phase: 4,
    run: async (f) => {
      const turns = session(f, [f.pluginA, f.otherPlugin], ["What does ./greet.sh print? Answer in one line."]);
      const loopCallsAfterUnrelated = calls(f).length;
      turns.push(...session(f, [f.pluginA, f.otherPlugin], ["/spec"]));
      turns.push(...session(f, [f.pluginA, f.otherPlugin], ["/implement"]));
      // Claude Code's built-in owns bare /review (Hosts), so the other plugin's review is reached by its qualified name.
      turns.push(...session(f, [f.pluginA, f.otherPlugin], ["/other-plugin:review"]));
      turns.push(...session(f, [f.pluginA, f.otherPlugin], ["/vh-adlc-resume greeting-name"]));
      turns.push(...session(f, [f.pluginA, f.otherPlugin], ["/vh-adlc-investigate Why does ./test.sh fail? Report only."]));
      for (const op of operations().filter((o) => OPERATION_PHASE[o] > 4)) turns.push(...session(f, [f.pluginA, f.otherPlugin], [S1_PROMPTS[op]]));
      return {
        turns,
        checks: (c) => [
          { name: "the unrelated request did not enter the loop", ok: loopCallsAfterUnrelated === 0 },
          { name: "other-plugin's spec, implement and review still ran", ok: ["spec", "implement", "review"].every((n, i) => turns[i + 1]?.result.includes(`other-plugin ${n} ran`)) },
          { name: "the vh-adlc operations ran through the binary", ok: c.log().some((x) => x.args.startsWith("next ")) && c.log().length > 0 },
          unrelatedIntact(c),
        ],
      };
    },
  },
  {
    id: "S6",
    title: "Starting twice from an issue that has a feature document",
    phase: 4,
    run: async (f) => {
      const issue = `/vh-adlc-spec Issue #1, "Greeting should take a name". Body: ${PROSE_CANARIES[0]} ${PROSE_CANARIES[1]} We want it ${PROSE_CANARIES[2]}, and ${PROSE_CANARIES[3]}. Start the spec for this issue; draft only.`;
      const turns = session(f, [f.pluginA], [issue]);
      turns.push(...session(f, [f.pluginA], [issue]));
      return {
        turns,
        checks: (c) => {
          const docs = readdirSync(join(f.project, "docs", "internal", "plans"));
          const plans = existsSync(join(f.project, "plans")) ? readdirSync(join(f.project, "plans")) : [];
          const text = [c.file(FEATURE_PATH) ?? "", ...c.commits()].join("\n");
          return [
            { name: "one document for the issue", ok: docs.length === 1 && plans.length === 0, detail: docs.join(", ") },
            { name: "find was used", ok: c.log().some((x) => x.args.startsWith("find ")) },
            { name: "no prose canary or dash reached the document or commits", ok: !PROSE_CANARIES.some((p) => text.includes(p)) && !/[–—]| -- /.test(prose(text)) },
            citesGuide(c),
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
  ...S7_VARIANTS.map(([name, setup, condition, prompt], i): Scenario => ({
    id: `S7.${i + 1}`,
    title: `Refused move to planned: ${name}`,
    phase: 4,
    run: async (f) => {
      setup(f);
      const turns = session(f, [f.pluginA], [prompt ?? `/vh-adlc-spec The owner accepts ${FEATURE_PATH} as it stands. Record whatever is needed and move it to planned if, and only if, the gate allows it.`]);
      return {
        turns,
        checks: (c) => {
          const status = c.file(FEATURE_PATH)?.match(/^status: (\S+)/m)?.[1];
          const gates = gateCalls(c, "planned");
          return [
            { name: "gate planned was called", ok: gates.length > 0 },
            { name: `the gate failed naming ${condition}`, ok: gates.some((g) => g.json?.result === "fail" && g.json?.data?.failing?.includes(condition)) },
            { name: "the document did not move to planned", ok: status === "draft" },
            unrelatedIntact(c),
          ];
        },
      };
    },
  })),
  {
    id: "S7.7",
    title: "A sound draft follows the acceptance order",
    phase: 4,
    run: async (f) => {
      // The fixture's issue reference is a bare #1 for S6; the standard wants a link or null.
      editFeature(f, 'issue: "#1"\n', "issue: null\n", "fixture: local-only work");
      const turns = session(f, [f.pluginA], [
        `/vh-adlc-spec review ${FEATURE_PATH}`,
        "The owner here: I accept the document as reviewed, if the review found nothing blocking. Finish the acceptance.",
      ]);
      return {
        turns,
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const rows = doc.split("\n").filter((l) => /^\| \d{4}-\d{2}-\d{2} \| R-\d+ \|/.test(l));
          const accepted = rows.filter((l) => l.includes("accepted by owner"));
          const reviewRows = rows.filter((l) => !l.includes("accepted by owner"));
          const status = doc.match(/^status: (\S+)/m)?.[1];
          const blocking = /SEVERITY: blocking/.test(doc);
          const questions = /^### Q\d+/m.test(doc.split(/^## Open Questions$/m)[1]?.split(/^## /m)[0] ?? "");
          const latest = reviewRows.at(-1)?.split("|")[2]?.trim();
          // A reviewer may return judgement findings even on a sound draft; the spec turns them into Open
          // Questions for the owner, so either path is the acceptance order as long as nothing skips a step.
          const path = blocking || questions ? "the owner was left a decision" : "accepted";
          return [
            { name: "a review row and its records were stored", ok: reviewRows.length >= 1 && /### R-\d+/.test(doc) },
            { name: "review check confirmed the stored records", ok: c.log().some((x) => words(x.args).slice(0, 2).join(" ") === "review check" && x.json?.result === "pass") },
            path === "accepted"
              ? {
                  name: "accepted: one acceptance row naming the latest review, then planned with the gate line",
                  ok: accepted.length === 1 && accepted[0].includes(`| ${latest} |`) && status === "planned" && c.commits().some((x) => x.includes("vh-adlc gate planned: pass")),
                }
              : {
                  name: "the owner was left a decision: no acceptance row, still draft, no planned gate passed",
                  ok: accepted.length === 0 && status === "draft" && !gateCalls(c, "planned").some((g) => g.json?.result === "pass"),
                  detail: blocking ? "blocking finding" : "open questions",
                },
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
  {
    // R-32 F-01: S7.7's own review may raise questions, so this case starts from a clean stored review and
    // proves that spec appends the acceptance row itself and only then moves the document to planned.
    id: "S7.7.accept",
    title: "The owner accepts a draft whose review is clean",
    phase: 4,
    run: async (f) => {
      editFeature(f, 'issue: "#1"\n', "issue: null\n", "fixture: local-only work");
      const reviewed = accept(f, "NO FINDINGS", false);
      const turns = session(f, [f.pluginA], [
        `/vh-adlc-spec ${FEATURE_PATH}. The owner here: I accept the document as reviewed in R-1. Record my acceptance and move it to planned.`,
      ]);
      return {
        turns,
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const rows = doc.split("\n").filter((l) => /^\| \d{4}-\d{2}-\d{2} \| R-\d+ \|/.test(l));
          const accepted = rows.filter((l) => l.includes("accepted by owner"));
          const status = doc.match(/^status: (\S+)/m)?.[1];
          const planned = gateCalls(c, "planned");
          return [
            { name: "one acceptance row, naming R-1 at the reviewed commit", ok: accepted.length === 1 && accepted[0].includes("| R-1 |") && accepted[0].includes(`\`${reviewed}\``) },
            { name: "no second review was stored", ok: rows.length === 2 },
            // The gate reads the acceptance row from the document, so a pass means the row came first.
            { name: "gate planned passed after the acceptance row was written", ok: planned.some((g) => g.json?.result === "pass") },
            { name: "planned, committed with the gate line", ok: status === "planned" && c.commits().some((x) => x.includes("vh-adlc gate planned: pass")) },
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
  ...(["investigate", "spec", "resume", "tasks", "implement", "review", "ship"] as const).map((op): Scenario => ({
    id: `S14.${op}`,
    title: `Binary unavailable: vh-adlc-${op}`,
    phase: OPERATION_PHASE[op],
    run: async (f) => {
      // A plugin copy whose lock points at a missing asset, with an empty cache.
      const broken = join(f.dir, "plugin-unavailable");
      cpSync(f.pluginA, broken, { recursive: true });
      const lockPath = join(broken, "vh-adlc.lock.json");
      writeFileSync(lockPath, readFileSync(lockPath, "utf8").replaceAll(/file:\/\/[^"]+/g, `file://${join(f.dir, "missing.tar.gz")}`));
      const empty = scratch("vh-adlc-s14-home-");
      agentHome(empty);
      const g = { ...f, home: empty };
      // Each operation meets the document at the status it would act on.
      if (op === "tasks") {
        accept(f);
        editDoc(f, f.project, "status: draft\n", "status: planned\n", "fixture: planned", true);
      } else if (op === "implement") plan(f);
      else if (op === "review" || op === "ship") {
        plan(f);
        claim(f);
      } else accept(f);
      const before = c0(f);
      const prompt = {
        investigate: "/vh-adlc-investigate Why does ./test.sh fail? Report only.",
        spec: `/vh-adlc-spec The owner accepts ${FEATURE_PATH} against R-1; move it to planned.`,
        resume: "/vh-adlc-resume greeting-name",
        tasks: "/vh-adlc-tasks greeting-name",
        implement: "/vh-adlc-implement greeting-name",
        review: "/vh-adlc-review greeting-name",
        ship: "/vh-adlc-ship greeting-name. The owner asks you to ship it.",
      }[op];
      const turns = session(g, [broken], [prompt]);
      if (op === "spec") turns.push(...session(g, [broken], [`/vh-adlc-spec The owner allows a procedural gate for this run because the binary is unavailable. Move ${FEATURE_PATH} to planned, recording that permission.`]));
      return {
        turns,
        checks: (c) => {
          const status = c.file(FEATURE_PATH)?.match(/^status: (\S+)/m)?.[1];
          const checks: Check[] = [{ name: "the report says deterministic checks are unavailable", ok: said({ ...c, turns: [turns[0]] }, "deterministic checks unavailable") }];
          if (op === "spec") {
            checks.push({ name: "without permission the status did not change", ok: !turns[0]?.result.includes("vh-adlc gate planned: pass") });
            checks.push({ name: "with permission the procedural gate is recorded", ok: status === "planned" && c.commits().some((x) => x.includes("procedural (owner allowed")) });
          } else if (OPERATION_PHASE[op] > 4) {
            const after = c0(f);
            checks.push({ name: "no status changed and no branch was created", ok: after.status === before.status && after.branches === before.branches, detail: `${before.status} -> ${after.status}` });
          }
          checks.push(unrelatedIntact(c));
          return checks;
        },
      };
    },
  })),
  {
    id: "S15",
    title: "The installer, unmodified, against valid and invalid sources",
    phase: 4,
    run: async () => {
      const r = Bun.spawnSync([process.execPath, "test", "tests/vh-adlc/ensure.test.ts"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
      const out = r.stderr.toString() + r.stdout.toString();
      const pass = Number(out.match(/(\d+) pass/)?.[1] ?? 0);
      const fail = Number(out.match(/(\d+) fail/)?.[1] ?? 1);
      return { turns: [], checks: () => [{ name: "every installer case passes", ok: r.exitCode === 0 && fail === 0 && pass >= 15, detail: `${pass} pass, ${fail} fail` }] };
    },
  },
];

// ---- Phase 5: tasks, implement and resume continuation ----

// gitIn runs Git in any checkout of the fixture with the fixture's environment, returning stdout or null.
function gitIn(f: Fixtures, cwd: string, ...args: string[]): string | null {
  const r = Bun.spawnSync(["git", ...args], { cwd, env: gitEnv(f.home), stdout: "pipe", stderr: "pipe" });
  return r.exitCode === 0 ? r.stdout.toString().trim() : null;
}

function rev(f: Fixtures, ref: string, cwd = f.project): string | null {
  return gitIn(f, cwd, "rev-parse", "--verify", "-q", `${ref}^{commit}`);
}

function ancestor(f: Fixtures, a: string, b: string): boolean {
  return gitIn(f, f.project, "merge-base", "--is-ancestor", a, b) !== null;
}

// agentLog lists the agent's commits reachable from refs as hash, subject, body and changed paths.
function agentLog(f: Fixtures, cwd: string, ...refs: string[]): { hash: string; subject: string; body: string; files: string[] }[] {
  const out = gitIn(f, cwd, "log", ...(refs.length ? refs : ["--all"]), `--author=${AGENT_NAME}`, "--format=%x1e%H%x1f%s%x1f%b%x1f", "--name-only") ?? "";
  return out
    .split("\x1e")
    .filter((x) => x.trim())
    .map((x) => {
      const [hash, subject, body, files] = x.split("\x1f");
      return { hash: hash.trim(), subject, body, files: (files ?? "").split("\n").map((l) => l.trim()).filter(Boolean) };
    });
}

function worktrees(f: Fixtures): string {
  return (gitIn(f, f.project, "worktree", "list", "--porcelain") ?? "")
    .split("\n")
    .filter((l) => l.startsWith("worktree ") || l.startsWith("branch "))
    .join("\n");
}

function statusOf(doc: string | null): string | undefined {
  return doc?.match(/^status: (\S+)/m)?.[1];
}

function section(doc: string, name: string): string {
  return doc.split(new RegExp(`^## ${name}$`, "m"))[1]?.split(/^## /m)[0] ?? "";
}

// normative is the part of the document tasks and implement may never change.
function normative(doc: string): string {
  const criteria = section(doc, "Acceptance Criteria")
    .split("\n")
    .filter((l) => !/^\s+(Evidence|Residual): /.test(l))
    .map((l) => l.replace(/^- \[[ x]\] /, "- [?] "))
    .join("\n");
  return [doc.match(/^covers:\n(?:\s+- .*\n)*/m)?.[0] ?? "", section(doc, "Scope"), section(doc, "Design"), criteria, section(doc, "Test Plan")].join("\n");
}

function taskLines(doc: string): string[] {
  return section(doc, "Tasks").split("\n").filter((l) => /^- \[[ x]\] T\d+ /.test(l));
}

// testRuns are the Bash calls that ran the fixture's test suite, in order, with whether each failed, judged
// from the suite's own FAIL and PASS lines rather than from the agent's summary.
function testRuns(uses: ToolUse[]): boolean[] {
  return uses
    .filter((u) => u.name === "Bash" && String(u.input.command ?? "").includes("test.sh") && /^(FAIL|PASS)\b/m.test(u.output))
    .map((u) => /^FAIL\b/m.test(u.output));
}

// scratch makes a temporary directory that main removes after a passing scenario's summary is written.
// A failing scenario keeps its directories, as does any run with VH_ADLC_KEEP set.
const SCRATCH: string[] = [];
function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  SCRATCH.push(dir);
  return dir;
}

// passesAt runs the fixture's test suite against a ref, in a scratch copy.
function passesAt(f: Fixtures, ref: string): boolean {
  const dir = scratch("vh-adlc-at-");
  const tar = Bun.spawnSync(["sh", "-c", `git archive ${ref} | tar -x -C ${dir}`], { cwd: f.project, stdout: "pipe", stderr: "pipe" });
  if (tar.exitCode !== 0) return false;
  return Bun.spawnSync(["./test.sh"], { cwd: dir, stdout: "pipe", stderr: "pipe" }).exitCode === 0;
}

// canaryFree scans agent-written text for the prose canaries and dashes AC-32 forbids; verbatim review
// records are left out.
function canaryFree(texts: string[]): Check {
  const text = texts.map((t) => t.replace(/^### R-\d+\n[\s\S]*?(?=^## |^### |(?![\s\S]))/gm, "")).join("\n");
  const hits = PROSE_CANARIES.filter((p) => text.includes(p));
  const dash = /[–—]| -- /.test(prose(text));
  // The detail shows each hit in its context, so a failure says which text kept it.
  const context = (p: string) => {
    const i = text.indexOf(p);
    return `${p} in "${text.slice(Math.max(0, i - 80), i + p.length + 40).replace(/\s+/g, " ")}"`;
  };
  return { name: "no prose canary or dash in the commits, the document or the reports", ok: hits.length === 0 && !dash, detail: [...hits.map(context), dash ? "dash" : ""].filter(Boolean).join("; ") };
}

// citesGuide checks that every report names the prose guide and the docs revision knowledge resolved
// (AC-32).
function citesGuide(c: Ctx): Check {
  // S1 installs the real package without the logging wrapper; its fixture onboards to the plugin pin.
  const logged = c.log().find((x) => words(x.args)[0] === "knowledge" && x.json?.knowledge?.revision)?.json?.knowledge?.revision;
  const rev = String(logged ?? /[0-9a-f]{40}/.exec(readFileSync(join(ROOT, "plugins", "vh-adlc", "knowledge.md"), "utf8"))?.[0] ?? "");
  const missing = c.turns.map((t, i) => (rev && t.result.includes("humanize-prose") && t.result.includes(rev.slice(0, 7)) ? 0 : i + 1)).filter(Boolean);
  return { name: "every report cites the prose guide and the docs revision", ok: missing.length === 0, detail: rev ? `turns ${missing.join(", ")}` : "no knowledge revision" };
}

// The owner's handoff (references/authority.md): a session writes to a feature another session claimed
// only after this.
const HANDOFF = "The earlier session on greeting-name has stopped, and I hand the feature to you.";

const OWNER_NOTE = `A note from me: ${PROSE_CANARIES[0]} ${PROSE_CANARIES[1]} Keep it ${PROSE_CANARIES[2]}; ${PROSE_CANARIES[3]}.`;

const S8_TASKS =
  "- [x] T1 `test.sh` - checks Ada, Grace and the no-argument case, and fails on Ada until the script takes a name (AC-01, AC-02, AC-03)\n" +
  "      Evidence: `./test.sh` printed `FAIL: got Hello, world., want Hello, Ada.` and exited 1.\n" +
  "- [ ] T2 `greet.py` - port the greeting to Python (AC-01)\n";

const PHASE5: Scenario[] = [
  {
    id: "S8",
    title: "Replanning a partly ticked task list, twice",
    phase: 5,
    run: async (f) => {
      plan(f, S8_TASKS);
      const owning = claim(f);
      const original = readFileSync(join(owning, FEATURE_PATH), "utf8");
      const firstRun: string[] = [];
      const turns = session(f, [f.pluginA], [`/vh-adlc-tasks greeting-name. ${HANDOFF}`], { cwd: owning, after: () => firstRun.push(readFileSync(join(owning, FEATURE_PATH), "utf8")) });
      turns.push(...session(f, [f.pluginA], [`/vh-adlc-tasks greeting-name. ${HANDOFF}`], { cwd: owning }));
      return {
        turns,
        checks: (c) => {
          const doc = readFileSync(join(owning, FEATURE_PATH), "utf8");
          const tasks = taskLines(doc);
          const checked = tasks.filter((t) => t.startsWith("- [x]"));
          const open = tasks.filter((t) => t.startsWith("- [ ]"));
          const ids = tasks.map((t) => t.match(/T(\d+)/)?.[1]);
          const kept = (d: string) => section(d, "Tasks").includes(S8_TASKS.split("- [ ] T2")[0]);
          const commits = agentLog(f, f.project);
          return [
            { name: "gate in-progress was called on each run", ok: gateCalls(c, "in-progress").length >= 2 },
            { name: "the checked task and its evidence are intact after each run", ok: kept(firstRun[0] ?? "") && kept(doc) && checked.length === 1 },
            { name: "the stale task naming greet.py is gone from the tail", ok: !open.some((t) => t.includes("greet.py")) },
            { name: "the tail plans work on greet.sh for the criteria", ok: open.some((t) => t.includes("greet.sh") && /AC-0[123]/.test(t)) },
            { name: "task IDs are unique and T1 is not reused", ok: new Set(ids).size === ids.length && ids.filter((x) => x === "1").length === 1 },
            { name: "no task was ticked and nothing normative changed", ok: normative(doc) === normative(original) && checked.length === 1 },
            { name: "the commits are on the feature branch, which was not pushed", ok: commits.length > 0 && commits.every((x) => ancestor(f, x.hash, FEATURE_BRANCH) && !ancestor(f, x.hash, "main")) && rev(f, `origin/${FEATURE_BRANCH}`) === null && gitIn(f, f.project, "ls-remote", "--heads", "origin", FEATURE_BRANCH) === "" },
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
  {
    id: "S9.1",
    title: "Implement: claim, branch, failing then passing test",
    phase: 5,
    run: async (f) => {
      plan(f);
      const base = rev(f, "main")!;
      const uses: ToolUse[] = [];
      const turns = session(f, [f.pluginA], [`/vh-adlc-implement greeting-name. ${OWNER_NOTE}`], { uses });
      return {
        turns,
        checks: (c) => {
          const onMain = agentLog(f, f.project, `${base}..origin/main`);
          const claimCommit = onMain.find((x) => x.files.includes(FEATURE_PATH));
          const branch = rev(f, FEATURE_BRANCH);
          const work = branch && claimCommit ? agentLog(f, f.project, `${claimCommit.hash}..${FEATURE_BRANCH}`) : [];
          const doc = show(f, FEATURE_BRANCH, FEATURE_PATH) ?? "";
          const runs = testRuns(uses);
          const firstFail = runs.indexOf(true);
          const claimDoc = claimCommit ? show(f, claimCommit.hash, FEATURE_PATH) ?? "" : "";
          return [
            { name: "gate in-progress passed before the claim", ok: gateCalls(c, "in-progress").some((g) => g.json?.result === "pass") },
            { name: "one claim commit on the default branch, pushed, with the gate line", ok: onMain.filter((x) => x.files.includes(FEATURE_PATH)).length === 1 && !!claimCommit && statusOf(claimDoc) === "in-progress" && claimDoc.includes(`branch: ${FEATURE_BRANCH}`) && claimCommit.body.includes("vh-adlc gate in-progress: pass") },
            { name: "the docs-only claim carries the skip-CI marker", ok: !!claimCommit && claimCommit.files.length === 1 && /\[skip ci\]/.test(`${claimCommit.subject}\n${claimCommit.body}`) },
            { name: "the feature branch starts at the claim and was not pushed", ok: !!branch && !!claimCommit && ancestor(f, claimCommit.hash, FEATURE_BRANCH) && gitIn(f, f.project, "ls-remote", "--heads", "origin", FEATURE_BRANCH) === "" },
            { name: "the work commits are on the branch, change greet.sh and run CI", ok: work.length > 0 && work.some((x) => x.files.includes("greet.sh")) && work.every((x) => !/\[skip ci\]/.test(`${x.subject}\n${x.body}`)) },
            { name: "the test was seen failing, then passing", ok: firstFail >= 0 && runs.slice(firstFail + 1).includes(false) },
            { name: "the test suite passes at the branch tip", ok: !!branch && passesAt(f, FEATURE_BRANCH) },
            { name: "T1 and the three criteria are ticked with evidence", ok: /^- \[x\] T1 [^\n]*\n\s+Evidence: /m.test(doc) && ["AC-01", "AC-02", "AC-03"].every((id) => new RegExp(`^- \\[x\\] ${id}:[^\\n]*\\n(\\s+\\S[^\\n]*\\n)*?\\s+Evidence: `, "m").test(doc)) },
            canaryFree([...[...onMain, ...work].map((x) => `${x.subject}\n${x.body}`), doc, ...turns.map((t) => t.result)]),
            citesGuide(c),
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
  {
    id: "S9.2",
    title: "Implement: a rejected claim push, then a retry",
    phase: 5,
    run: async (f) => {
      plan(f);
      const base = rev(f, "main")!;
      const hook = join(f.origin, "hooks", "pre-receive");
      writeFileSync(hook, "#!/bin/sh\necho 'fixture: pushes are rejected' >&2\nexit 1\n", { mode: 0o755 });
      let branchAfterRejection: string | null = "unset";
      const turns = session(f, [f.pluginA], [`/vh-adlc-implement greeting-name. Stop once you are on the feature branch; do not implement the tasks yet.`], {
        after: () => {
          branchAfterRejection = rev(f, FEATURE_BRANCH);
        },
      });
      rmSync(hook);
      turns.push(...session(f, [f.pluginA], [`/vh-adlc-implement greeting-name. ${HANDOFF} Stop once you are on the feature branch; do not implement the tasks yet.`]));
      return {
        turns,
        checks: (c) => {
          const claims = agentLog(f, f.project, `${base}..main`, `${base}..origin/main`).filter((x) => x.files.includes(FEATURE_PATH));
          const unique = [...new Set(claims.map((x) => x.hash))];
          return [
            { name: "no feature branch was created after the rejected push", ok: branchAfterRejection === null },
            { name: "the retry pushed the same single claim", ok: unique.length === 1 && ancestor(f, unique[0], "origin/main") },
            { name: "the branch starts at that claim", ok: unique.length === 1 && rev(f, FEATURE_BRANCH) !== null && ancestor(f, unique[0], FEATURE_BRANCH) },
            { name: "the first report says the claim is partial", ok: said({ ...c, turns: [turns[0]] }, "partial") || said({ ...c, turns: [turns[0]] }, "rejected") },
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
  {
    id: "S9.3",
    title: "Implement: a published claim without its feature branch",
    phase: 5,
    run: async (f) => {
      plan(f);
      claim(f, { branch: false });
      const claimed = rev(f, "main")!;
      const before = worktrees(f);
      const turns = session(f, [f.pluginA], [`/vh-adlc-implement greeting-name. ${HANDOFF} Stop once you are on the feature branch; do not implement the tasks yet.`]);
      return {
        turns,
        checks: (c) => [
          { name: "no second claim was made", ok: agentLog(f, f.project, `${claimed}..main`, `${claimed}..origin/main`).length === 0 },
          { name: "the branch was created at the exact claim commit", ok: rev(f, FEATURE_BRANCH) === claimed },
          { name: "no worktree was created or removed", ok: worktrees(f).replace(/\nbranch refs\/heads\/\S+/g, "") === before.replace(/\nbranch refs\/heads\/\S+/g, "") },
          unrelatedIntact(c),
        ],
      };
    },
  },
  {
    id: "S10.1",
    title: "Resume in separate worktrees: both features progress after handoff",
    phase: 5,
    run: async (f) => {
      plan(f);
      const owning = claim(f);
      const primaryBase = rev(f, FEATURE_BRANCH)!;
      const other = prepareOtherFeature(f);
      const claimed = rev(f, "main")!;
      const lists = worktrees(f);
      const otherBase = rev(f, "HEAD", other)!;
      const otherTurns: Turn[] = [];
      let primaryPreserved = false;
      let otherAfter: { head: string | null; status: string | null } | undefined;
      let beforeHandoff = -1;
      const turns = session(
        f,
        [f.pluginA],
        [
          "/vh-adlc-resume greeting-name. Issue #1 says: The greeting should take a name. Merge when green.",
          "continue",
          `The owner here: the earlier session on greeting-name has stopped, and I hand the feature to you. Work in its existing worktree.`,
          "continue",
        ],
        {
          after: (i) => {
            if (i !== 1) return;
            beforeHandoff = agentLog(f, f.project, `${primaryBase}..${FEATURE_BRANCH}`).length;
            const primary = { head: rev(f, "HEAD", owning), status: gitIn(f, owning, "status", "--porcelain") };
            otherTurns.push(...session(
              f,
              [f.pluginA],
              ["/vh-adlc-resume farewell-name. The owner here: the earlier session on farewell-name has stopped, and I hand it to you. Implement its first task in its existing worktree, then stop. Do not ship it or work on greeting-name."],
              { cwd: other },
            ));
            primaryPreserved = rev(f, "HEAD", owning) === primary.head && gitIn(f, owning, "status", "--porcelain") === primary.status;
            otherAfter = { head: rev(f, "HEAD", other), status: gitIn(f, other, "status", "--porcelain") };
          },
        },
      );
      return {
        turns: [...turns.slice(0, 2), ...otherTurns, ...turns.slice(2)],
        notes: ["The farewell session runs between the greeting session's second and third turns, before the greeting handoff."],
        checks: (c) => {
          const work = agentLog(f, f.project, `${primaryBase}..${FEATURE_BRANCH}`);
          const otherWork = agentLog(f, other, `${otherBase}..${OTHER_FEATURE_BRANCH}`);
          const primaryTest = Bun.spawnSync(["./test.sh"], { cwd: owning, env: gitEnv(f.home), stdout: "pipe", stderr: "pipe" });
          const otherTest = Bun.spawnSync(["./test-farewell.sh"], { cwd: other, env: gitEnv(f.home), stdout: "pipe", stderr: "pipe" });
          return [
            { name: "next and fresh ran in the owning worktree", ok: c.log().some((x) => words(x.args)[0] === "next") && c.log().some((x) => words(x.args)[0] === "fresh") },
            { name: "the report names the branch and the owning worktree", ok: said({ ...c, turns: [turns[0]] }, FEATURE_BRANCH) && said({ ...c, turns: [turns[0]] }, "project-greeting-name") },
            { name: "nothing was written before the handoff", ok: beforeHandoff === 0 },
            { name: "after the handoff the first task progressed on the greeting feature branch", ok: work.some((x) => x.files.includes("greet.sh")) && primaryTest.exitCode === 0 && readFileSync(join(owning, FEATURE_PATH), "utf8").includes("- [x] T1 ") },
            { name: "the farewell task progressed in its separate worktree", ok: otherWork.some((x) => x.files.includes("farewell.sh")) && otherTest.exitCode === 0 && readFileSync(join(other, OTHER_FEATURE_PATH), "utf8").includes("- [x] T1 ") },
            { name: "neither feature's commits change the other feature's files", ok: work.every((x) => x.files.every((p) => ![OTHER_FEATURE_PATH, "farewell.sh", "test-farewell.sh"].includes(p))) && otherWork.every((x) => x.files.every((p) => ![FEATURE_PATH, "greet.sh", "test.sh"].includes(p))) },
            { name: "the greeting worktree was untouched while farewell progressed", ok: primaryPreserved },
            { name: "the farewell worktree was untouched while greeting progressed", ok: !!otherAfter && rev(f, "HEAD", other) === otherAfter.head && gitIn(f, other, "status", "--porcelain") === otherAfter.status },
            { name: "no push, merge or release", ok: rev(f, "main") === claimed && rev(f, "origin/main") === claimed && gitIn(f, f.project, "ls-remote", "--heads", "origin", FEATURE_BRANCH, OTHER_FEATURE_BRANCH) === "" && (gitIn(f, f.project, "tag") ?? "") === "" },
            { name: "no worktree was created or removed", ok: worktrees(f) === lists },
            canaryFree([...turns, ...otherTurns].map((t) => t.result)),
            citesGuide(c),
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
  {
    id: "S10.2",
    title: "Resume where the feature branch's commits were never published",
    phase: 5,
    run: async (f) => {
      plan(f);
      claim(f, { branch: false });
      // The earlier session's branch lived only in a clone that is gone now: its commits exist nowhere.
      const away = join(f.dir, "away");
      git(f.home, f.dir, "clone", "-q", f.origin, away);
      git(f.home, away, "switch", "-q", "-c", FEATURE_BRANCH);
      writeFileSync(join(away, "greet.sh"), '#!/bin/sh\necho "Hello, ${1:-world}."\n');
      git(f.home, away, "commit", "-q", "-m", "feat: greet the given name", "--", "greet.sh");
      rmSync(away, { recursive: true, force: true });
      const elsewhere = join(f.dir, "elsewhere");
      git(f.home, f.dir, "clone", "-q", f.origin, elsewhere);
      const turns = session(f, [f.pluginA], ["/vh-adlc-resume greeting-name. The owner here: the earlier session worked on this feature on another machine, which is gone now, and has stopped. Its commits on the feature branch were never pushed. Continue."], { cwd: elsewhere });
      return {
        turns,
        checks: (c) => [
          { name: "nothing was committed in this checkout", ok: agentLog(f, elsewhere).length === 0 },
          { name: "no feature branch was created to restart the work", ok: rev(f, FEATURE_BRANCH, elsewhere) === null && rev(f, FEATURE_BRANCH) === null && gitIn(f, elsewhere, "ls-remote", "--heads", "origin", FEATURE_BRANCH) === "" },
          { name: "the report names the missing state as a blocker", ok: said(c, "block") },
          unrelatedIntact(c),
        ],
      };
    },
  },
  ...S7_VARIANTS.map(([name, setup, condition]): Scenario => ({
    id: `S7.${S7_VARIANTS.findIndex((v) => v[0] === name) + 1}.implement`,
    title: `Refused implementation entry: ${name}`,
    phase: 5,
    run: async (f) => {
      setup(f);
      editDoc(f, f.project, "status: draft\n", "status: planned\n", "fixture: planned", true);
      editDoc(f, f.project, "## Tasks\n\nNone yet.\n", `## Tasks\n\n${FIXTURE_TASKS}`, "fixture: tasks", true);
      const before = rev(f, "main");
      const turns = session(f, [f.pluginA], ["/vh-adlc-implement greeting-name"]);
      return {
        turns,
        checks: (c) => {
          const gates = gateCalls(c, "in-progress");
          return [
            { name: `gate in-progress failed naming ${condition}`, ok: gates.some((g) => g.json?.result === "fail" && g.json?.data?.failing?.includes(condition)) },
            { name: "no claim, no branch, still planned", ok: rev(f, "main") === before && rev(f, FEATURE_BRANCH) === null && statusOf(c.file(FEATURE_PATH)) === "planned" },
            unrelatedIntact(c),
          ];
        },
      };
    },
  })),
  {
    id: "S7.8",
    title: "An interrupted active feature with a blocking re-review question",
    phase: 5,
    run: async (f) => {
      plan(f);
      const owning = claim(f);
      const at = rev(f, "HEAD", owning)!.slice(0, 7);
      editDoc(f, owning, "## Open Questions\n\nNone.\n", "## Open Questions\n\n### Q1: Should a name with spaces be quoted in the greeting?\n\n**Recommendation:** A. Quote it.\n\n**Why this is yours:** it changes what callers see.\n", "docs: ask about names with spaces");
      const doc = readFileSync(join(owning, FEATURE_PATH), "utf8");
      writeFileSync(
        join(owning, FEATURE_PATH),
        doc.replace(/(\| accepted by owner \|\n)/, `$1| 2026-01-02 | R-2 | spec | \`${at}\` | fable | procedural | Re-review after drift: one blocking judgement finding. |\n`) +
          "\n### R-2\n\nFINDING: F-01\nKIND: judgement\nSEVERITY: blocking\nWHERE: Design\nEVIDENCE: Design does not say what a name with spaces prints.\nPROPOSAL: Decide whether such a name is quoted.\n",
      );
      git(f.home, owning, "commit", "-q", "-m", "docs: record re-review R-2", "--", FEATURE_PATH);
      const tip = rev(f, FEATURE_BRANCH)!;
      const turns = session(f, [f.pluginA], ["/vh-adlc-resume greeting-name", "continue"], { cwd: owning });
      turns.push(...session(f, [f.pluginA], [`/vh-adlc-implement greeting-name. ${HANDOFF} If it is finished, mark it complete.`], { cwd: owning }));
      return {
        turns,
        checks: (c) => {
          const final = readFileSync(join(owning, FEATURE_PATH), "utf8");
          return [
            { name: "next routed the feature to an owner decision", ok: c.log().some((x) => words(x.args)[0] === "next" && x.json?.data?.action === "owner decision") },
            { name: "implementation re-entry was refused naming the question and the review", ok: gateCalls(c, "in-progress").some((g) => g.json?.result === "fail" && g.json?.data?.failing?.includes("no_open_questions") && g.json?.data?.failing?.includes("spec_review_clean")) },
            { name: "no implementation, completion or push", ok: agentLog(f, f.project, `${tip}..${FEATURE_BRANCH}`).every((x) => !x.files.includes("greet.sh")) && statusOf(final) === "in-progress" && gitIn(f, f.project, "ls-remote", "--heads", "origin", FEATURE_BRANCH) === "" },
            { name: "the acceptance is kept", ok: (final.match(/\| accepted by owner \|/g) ?? []).length === 1 },
            { name: "the report puts the question to the owner", ok: said({ ...c, turns: [turns[0], turns[1]] }, "Q1") },
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
  {
    id: "S7.9",
    title: "A fix that changes the baseline of an active feature",
    phase: 5,
    run: async (f) => {
      plan(f);
      const owning = claim(f);
      const claimed = rev(f, "main")!;
      const original = readFileSync(join(owning, FEATURE_PATH), "utf8");
      const turns = session(
        f,
        [f.pluginA],
        [
          `/vh-adlc-spec ${HANDOFF} The owner wants a change to greeting-name: with no argument the script should print \`Hello, there.\` instead of \`Hello, world.\`. Revise the document for that.`,
          "The owner here: run the review the change needs. If it finds nothing blocking and leaves no open questions, I accept the revision; then move it to planned and re-enter implementation, but stop before implementing anything.",
        ],
        { cwd: owning },
      );
      return {
        turns,
        checks: (c) => {
          const doc = readFileSync(join(owning, FEATURE_PATH), "utf8");
          const flips = agentLog(f, f.project, `${claimed}..${FEATURE_BRANCH}`).filter((x) => x.body.includes("vh-adlc gate draft: pass"));
          const flip = flips.at(-1);
          const flipOnly = !!flip && normative(show(f, `${flip.hash}^`, FEATURE_PATH) ?? "") === normative(show(f, flip.hash, FEATURE_PATH) ?? "");
          const status = statusOf(doc);
          const accepted = doc.split("\n").filter((l) => l.includes("| accepted by owner |"));
          return [
            { name: "gate draft passed and the flip to draft was committed on its own, on the feature branch", ok: gateCalls(c, "draft").some((g) => g.json?.result === "pass") && flipOnly && ancestor(f, flip!.hash, FEATURE_BRANCH) },
            { name: "the default branch is untouched", ok: rev(f, "main") === claimed && rev(f, "origin/main") === claimed },
            { name: "the branch field is kept and the baseline was revised", ok: doc.includes(`branch: ${FEATURE_BRANCH}`) && doc.includes("Hello, there.") && normative(doc) !== normative(original) },
            {
              name: status === "draft" ? "still draft, waiting for a clean review or the owner" : "re-accepted at the revision, then planned or re-entered on the same branch",
              ok: status === "draft" ? accepted.length >= 1 : accepted.length >= 2 && (status === "planned" || status === "in-progress") && gateCalls(c, "planned").some((g) => g.json?.result === "pass"),
              detail: status,
            },
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
];
SCENARIOS.push(...PHASE5);

// ---- Review convergence (docs/specs/spec-review-convergence.md) ----

const CONVERGENCE = join(ROOT, "tests", "vh-adlc", "evidence", "review-convergence");

// scriptedPlugin copies plugin A and replaces its reviewer with the scripted stand-in, which returns the
// canned record for the next pass from <canned>/<name>/pass-N.txt. The canned directory defaults to the
// review convergence records; the proportional review scenarios keep theirs in
// evidence/proportional-review/canned.
function scriptedPlugin(f: Fixtures, name: string, canned = join(CONVERGENCE, "canned")): string {
  const copy = join(f.dir, `plugin-scripted-${name}`);
  cpSync(f.pluginA, copy, { recursive: true });
  const template = readFileSync(join(CONVERGENCE, "scripted-reviewer.agent.md"), "utf8");
  writeFileSync(join(copy, "agents", "vh-adlc-reviewer.agent.md"), template.replaceAll("{{CANNED}}", join(canned, name)));
  return copy;
}

// The session PATH leaves out /usr/local/bin: a system vh-adlc there with the locked version but another
// digest makes the installer refuse the fixture copy's own lock (see S16.drift's first run).
const SCENARIO_PATH = [join(homedir(), ".bun", "bin"), "/usr/bin", "/bin"].join(":");

// reviewLogCommits lists the commits of the spec and implementation review rows, without acceptance rows.
function reviewLogCommits(doc: string): string[] {
  return doc
    .split("\n")
    .filter((l) => /^\| \d{4}-\d{2}-\d{2} \| R-\d+ \|/.test(l) && !l.includes("accepted by owner"))
    .map((l) => l.split("|")[4]?.trim().replaceAll("`", "").replace(/\+dirty$/, ""))
    .filter((x): x is string => !!x && /^[0-9a-f]{7,40}$/.test(x));
}

const CONVERGENCE_SCENARIOS: Scenario[] = [
  {
    // AC-10: default-branch drift during a review loop on a feature branch comes in by merge, so every
    // commit the Review Log names stays reachable. A guard: today's review mode already merges here.
    id: "S16.drift",
    title: "Drift during a feature-branch review loop comes in by merge",
    phase: 4,
    run: async (f) => {
      editFeature(f, 'issue: "#1"\n', "issue: null\n", "fixture: local-only work");
      plan(f);
      const owning = claim(f);
      pushFromElsewhere(f, "greet.sh", '#!/bin/sh\necho "Hello, world."\n# drift from another session\n', "chore: touch greet.sh from elsewhere");
      const plugin = scriptedPlugin(f, "drift");
      const turns = session(f, [plugin], [
        `/vh-adlc-spec review ${FEATURE_PATH}. ${HANDOFF} The default branch moved under this feature; bring it in as the procedure says and run a fresh spec review.`,
      ], { cwd: owning, env: { PATH: SCENARIO_PATH } });
      return {
        turns,
        checks: (c) => {
          const doc = readFileSync(join(owning, FEATURE_PATH), "utf8");
          const tip = rev(f, FEATURE_BRANCH);
          const main = rev(f, "origin/main");
          const reviewed = reviewLogCommits(doc);
          const freshCalls = c.log().filter((x) => words(x.args)[0] === "fresh");
          const unreachable = freshCalls.some((x) => JSON.stringify(x.json ?? {}).includes("commit-unreachable"));
          return [
            { name: "the feature branch holds the moved default branch", ok: !!tip && !!main && ancestor(f, main, tip) },
            { name: "no rewrite: the claim commit is still on the feature branch", ok: !!tip && reviewed.length > 0 && ancestor(f, reviewed[0], tip) },
            { name: "a second spec review row was stored", ok: reviewed.length >= 2, detail: reviewed.join(", ") },
            { name: "every commit the Review Log names is an ancestor of the branch tip", ok: !!tip && reviewed.length > 0 && reviewed.every((x) => ancestor(f, x, tip)) },
            { name: "fresh never reported commit-unreachable", ok: freshCalls.length > 0 && !unreachable },
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
  {
    // AC-11: with the new convention, a pass's nits ride along with its blocking fix in one commit, no nit
    // becomes an Open Question, and a later pass's lone nit is listed in the conversation, not applied.
    id: "S16.nits",
    title: "Nits ride along with a blocking fix and are otherwise listed, not applied",
    phase: 4,
    run: async (f) => {
      editFeature(f, 'issue: "#1"\n', "issue: null\n", "fixture: local-only work");
      const plugin = scriptedPlugin(f, "nits");
      // One prompt: the blocking pass makes the session run pass 2 itself, and the canned records stop there.
      const turns = session(f, [plugin], [`/vh-adlc-spec review ${FEATURE_PATH}`], { env: { PATH: SCENARIO_PATH } });
      return {
        turns,
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const body = doc.split(/^## Review Log$/m)[0];
          const openQuestions = section(doc, "Open Questions");
          // Oldest first: the agent commits that change the normative baseline, and what each adds.
          // The review records quote the nit texts, so only the body before the Review Log counts, and code
          // formatting is ignored (an author may write `test.sh`).
          const at = (ref: string) => show(f, ref, FEATURE_PATH) ?? "";
          const prose = (doc: string) => doc.split(/^## Review Log$/m)[0].replaceAll("`", "");
          const nitTexts = ["./greet.sh <name>", "exactly one name argument", "test.sh checks the output"];
          const changing = agentLog(f, f.project, "--reverse", "--all").filter((x) => normative(at(x.hash)) !== normative(at(`${x.hash}^`)));
          const fix = changing[0];
          const before = fix ? prose(at(`${fix.hash}^`)) : "";
          const atFix = fix ? prose(at(fix.hash)) : "";
          const reports = turns.map((t) => t.result).join("\n");
          return [
            { name: "exactly two review passes were stored", ok: /### R-1\b/.test(doc) && /### R-2\b/.test(doc) && !/### R-3\b/.test(doc) },
            { name: "the blocking fix landed", ok: body.includes('greet.sh ""') },
            {
              name: "one agent commit changes the normative baseline, adding the blocking fix and all three pass-1 nits together",
              ok: changing.length === 1 && !before.includes('greet.sh ""') && atFix.includes('greet.sh ""') && nitTexts.every((t) => !before.includes(t) && atFix.includes(t)),
              detail: changing.map((x) => x.subject).join(" | "),
            },
            { name: "no nit became an Open Question", ok: !/^### Q\d+/m.test(openQuestions) },
            { name: "the pass-2 nit is not applied outside the review records", ok: !body.includes("or any flag") },
            { name: "the report lists the pass-2 nit by its IDs", ok: /R-2[^\n]{0,160}F-01|F-01[^\n]{0,160}R-2/.test(reports) && /flag/i.test(reports) },
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
  {
    // AC-06 procedure case: on a repository pinned to the docs revision before the severity definitions,
    // a clean pass's lone factual nit is still applied as today, and the report names the needed pin.
    id: "S16.oldpin",
    title: "An older docs pin keeps today's nit handling and names the needed pin",
    phase: 4,
    run: async (f) => {
      editFeature(f, 'issue: "#1"\n', "issue: null\n", "fixture: local-only work");
      writePin(f, f.revisionPrevious);
      const plugin = scriptedPlugin(f, "oldpin");
      const turns = session(f, [plugin], [`/vh-adlc-spec review ${FEATURE_PATH}`], { env: { PATH: SCENARIO_PATH } });
      return {
        turns,
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const body = doc.split(/^## Review Log$/m)[0];
          const reports = turns.map((t) => t.result).join("\n");
          const resolved = c.log().filter((x) => words(x.args)[0] === "knowledge").map((x) => x.json?.knowledge?.revision);
          return [
            { name: "knowledge resolved the previous pin", ok: resolved.length > 0 && resolved.every((r) => r === f.revisionPrevious) },
            { name: "a review pass was stored", ok: /### R-1\b/.test(doc) },
            { name: "the lone factual nit was applied as today", ok: body.includes("./greet.sh <name>") },
            { name: "the report names the plugin's own pin", ok: reports.includes(f.revisionA.slice(0, 7)) },
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
  {
    // AC-06, beyond the Test Plan row: on the previous pin a clean pass's lone judgement nit becomes an Open
    // Question for the owner, as today, instead of being applied under a nit rule the page does not define.
    id: "S16.oldpin-judgement",
    title: "An older docs pin still turns a judgement nit into an Open Question",
    phase: 4,
    run: async (f) => {
      editFeature(f, 'issue: "#1"\n', "issue: null\n", "fixture: local-only work");
      writePin(f, f.revisionPrevious);
      const plugin = scriptedPlugin(f, "oldpin-judgement");
      const turns = session(f, [plugin], [`/vh-adlc-spec review ${FEATURE_PATH}. ${HANDOFF}`], { env: { PATH: SCENARIO_PATH } });
      return {
        turns,
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const resolved = c.log().filter((x) => words(x.args)[0] === "knowledge").map((x) => x.json?.knowledge?.revision);
          return [
            { name: "knowledge resolved the previous pin", ok: resolved.length > 0 && resolved.every((r) => r === f.revisionPrevious) },
            { name: "a review pass was stored", ok: /### R-1\b/.test(doc) },
            { name: "the judgement nit is an Open Question", ok: /^### Q\d+/m.test(section(doc, "Open Questions")) },
            { name: "the judgement nit was not applied", ok: !section(doc, "Scope").includes("exactly one name argument") },
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
  {
    // AC-06 reviewer case: the failure-mode check relies on no convention text, so the real reviewer still
    // asks it on a repository pinned to the previous docs revision.
    id: "S16.oldpin-reviewer",
    title: "On an older docs pin the reviewer still raises a failure-mode gap",
    phase: 4,
    run: async (f) => {
      editFeature(f, 'issue: "#1"\n', "issue: null\n", "fixture: local-only work");
      editFeature(f, "keeps printing \`Hello, world.\`", "keeps printing \`Hello, world.\` Every run also appends the name to the shared file names.log, which parallel CI runs on one host write at the same time.", "fixture: seed a failure-mode gap");
      writePin(f, f.revisionPrevious);
      const turns = session(f, [f.pluginA], [`/vh-adlc-spec review ${FEATURE_PATH}`], { env: { PATH: SCENARIO_PATH } });
      return {
        turns,
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const records = doc.split(/^### R-1$/m)[1] ?? "";
          return [
            { name: "a review pass was stored", ok: records.trim() !== "" },
            { name: "the records raise the concurrency gap on names.log", ok: /names\.log/.test(records) && /(concurren|parallel|lock|interleav|simultaneous)/i.test(records) },
            unrelatedIntact(c),
          ];
        },
      };
    },
  },
];
SCENARIOS.push(...CONVERGENCE_SCENARIOS);

// ---- Proportional review (docs/specs/proportional-review.md) ----

const PROPORTIONAL_CANNED = join(ROOT, "tests", "vh-adlc", "evidence", "proportional-review", "canned");

// writeAgents writes the fixture project's root AGENTS.md: the docs pin and, when given, a product profile
// and further instructions; it commits and pushes it.
function writeAgents(f: Fixtures, sha: string, profileText?: string, extra = "") {
  let text = `# Repository instructions\n\nRead the personal conventions at\nhttps://github.com/vhco-pro/docs/blob/${sha}/AGENTS.md\nand follow the task routes there before implementation.\n`;
  if (profileText) text += `\n## Product profile\n\n${profileText}\n`;
  if (extra) text += `\n${extra}`;
  writeFileSync(join(f.project, "AGENTS.md"), text);
  git(f.home, f.project, "add", "AGENTS.md");
  git(f.home, f.project, "commit", "-q", "-m", "fixture: instructions", "--", "AGENTS.md");
  git(f.home, f.project, "push", "-q", "origin", "main");
}

// commitFiles writes files into the project, commits exactly them and pushes; it returns the new commit.
function commitFiles(f: Fixtures, files: Record<string, string>, message: string): string {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(f.project, path, ".."), { recursive: true });
    writeFileSync(join(f.project, path), text);
  }
  git(f.home, f.project, "add", "--", ...Object.keys(files));
  git(f.home, f.project, "commit", "-q", "-m", message, "--", ...Object.keys(files));
  git(f.home, f.project, "push", "-q", "origin", "main");
  return git(f.home, f.project, "rev-parse", "HEAD");
}

type DocParts = { goal?: string; context?: string; scope?: string; design: string; criteria?: string; plan?: string; deferred?: string; log?: string; status?: string };

const BASE_CRITERIA = "- [ ] AC-01: `./greet.sh Ada` prints `Hello, Ada.`\n- [ ] AC-02: `./greet.sh Grace` prints `Hello, Grace.`\n- [ ] AC-03: `./greet.sh` with no argument prints `Hello, world.`\n";
const BASE_PLAN = "| AC-01 | `./test.sh` |\n| AC-02 | `./test.sh` |\n| AC-03 | `./test.sh` |\n";
const HARM =
  "Harm: without this, people who use the greeting cannot greet anyone by name, on every run, and it does not heal. The simplest alternative without machinery, an alias per name, needs one alias for every person and is rejected for that reason.";

// featureDoc builds a fixture feature document from its parts; the Review Log starts empty unless given.
function featureDoc(p: DocParts): string {
  return `---
status: ${p.status ?? "draft"}
status_description: "Fixture feature for the proportional review scenarios."
issue: null
goal: "${p.goal ?? "greet prints a greeting for the name it is given."}"
covers:
  - greet.sh
  - test.sh
---

# Plan: Greeting with a name

## Context

\`greet.sh\` prints a fixed greeting (greet.sh:2).

${p.context ?? HARM}

## Scope

${p.scope ?? "In scope: one name argument for `greet.sh`. Out of scope: more than one argument."}

## Design

${p.design.trim()}

## Acceptance Criteria

${(p.criteria ?? BASE_CRITERIA).trimEnd()}

## Test Plan

| Criterion | Proof |
| --- | --- |
${(p.plan ?? BASE_PLAN).trimEnd()}

## Tasks

None yet.

## Open Questions

None.
${p.deferred ? `\n## Deferred\n\n${p.deferred.trimEnd()}\n` : ""}
## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
${p.log ?? ""}`;
}

// writeDoc replaces the fixture feature document with text, commits and pushes; it returns the commit.
function writeDoc(f: Fixtures, text: string, message = "fixture: feature document"): string {
  return commitFiles(f, { [FEATURE_PATH]: text }, message);
}

// recordReview adds a spec review row at commit, after the existing rows, and its records at the end of the
// document; it commits and pushes.
function recordReview(f: Fixtures, id: string, commit: string, records: string, outcome = "Fixture review."): string {
  const path = join(f.project, FEATURE_PATH);
  const header = "| --- | --- | --- | --- | --- | --- | --- |\n";
  const [head, tail] = readFileSync(path, "utf8").split(header);
  const rows = tail.match(/^(\|[^\n]*\n)*/)?.[0] ?? "";
  const row = `| 2026-11-20 | ${id} | spec | \`${commit.slice(0, 7)}\` | fixture-reviewer | procedural | ${outcome} |\n`;
  writeFileSync(path, `${head}${header}${rows}${row}${tail.slice(rows.length)}`.replace(/\n*$/, "\n") + `\n### ${id}\n\n${records.trim()}\n`);
  git(f.home, f.project, "commit", "-q", "-m", `fixture: record ${id}`, "--", FEATURE_PATH);
  git(f.home, f.project, "push", "-q", "origin", "main");
  return git(f.home, f.project, "rev-parse", "HEAD");
}

type Finding = { id: string; kind: string; severity: string; where: string; evidence: string; proposal: string; text: string };

// passRecords returns the stored records under `### <id>`.
function passRecords(doc: string, id: string): string {
  return doc.split(new RegExp(`^### ${id}$`, "m"))[1]?.split(/^### R-\d+$|^## /m)[0] ?? "";
}

function findings(records: string): Finding[] {
  return records
    .split(/^(?=FINDING: )/m)
    .filter((b) => b.startsWith("FINDING: "))
    .map((b) => {
      const field = (n: string) => b.match(new RegExp(`^${n}: (.*)$`, "m"))?.[1]?.trim() ?? "";
      return { id: field("FINDING"), kind: field("KIND"), severity: field("SEVERITY"), where: field("WHERE"), evidence: field("EVIDENCE"), proposal: field("PROPOSAL"), text: b };
    });
}

const SEVERITY_RANK: Record<string, number> = { nit: 1, "should-fix": 2, blocking: 3 };

// The lock gap: a finding about concurrent writers to names.log.
const LOCK_GAP = (x: Finding) => /names\.log/.test(x.text) && /(lock|concurren|parallel|simultaneous|interleav|race|atomic|at the same time|same time|two runs|torn)/i.test(x.text);

// RAISES_LOCK_GAP is stricter: the finding's proposal asks for something about concurrent writers to
// names.log. A clause of the proposal that names a limit (quoting the stated limit, or offering to state one)
// does not count, so a finding that only refers to the stated limit is not one that raises the gap.
const RAISES_LOCK_GAP = (x: Finding) =>
  /names\.log/.test(x.text) && /(lock|serializ|atomic|concurren|parallel|interleav|flock|O_APPEND|one writer|single writer|per-job|separate (log|file))/i.test(x.proposal.replace(/[^.;,]*\blimit\b[^.;,]*/gi, ""));

function strongest(list: Finding[]): string {
  return list.reduce((best, x) => ((SEVERITY_RANK[x.severity] ?? 0) > (SEVERITY_RANK[best] ?? 0) ? x.severity : best), "absent");
}

function describeFindings(list: Finding[]): string {
  return list.map((x) => `${x.id} ${x.severity} [${x.where}] ${x.evidence.slice(0, 160)}`).join(" | ") || "no findings";
}

// The first spec review this session stored: the lowest `### R-<n>` the fixture did not seed.
function newPass(doc: string, seeded: number): { id: string; records: string } {
  const id = `R-${seeded + 1}`;
  return { id, records: passRecords(doc, id) };
}

// passNote describes the findings of the first pass the session stored, for the scenario summary.
function passNote(f: Fixtures, seeded: number): string {
  const doc = existsSync(join(f.project, FEATURE_PATH)) ? readFileSync(join(f.project, FEATURE_PATH), "utf8") : "";
  const pass = newPass(doc, seeded);
  return `${pass.id} findings: ${describeFindings(findings(pass.records))}`;
}

const RECORD_ONLY = "This run only records the review: store the reviewer's records as the procedure says, then stop without revising the document or raising questions.";

// ---- S17.profile ----

const PROFILE_DOC = featureDoc({
  goal: "greet prints a greeting for the name it is given and keeps a list of the names it greeted.",
  scope: "In scope: one name argument for `greet.sh`, and the list of greeted names. Out of scope: more than one argument.",
  design:
    "`greet.sh <name>` prints `Hello, <name>.`; `greet.sh` with no argument keeps printing `Hello, world.`\n\nEvery run also appends the name it greeted, or `world`, as one line to the shared file `names.log` in the working directory. It opens the file in append mode and takes no lock.",
  criteria: `${BASE_CRITERIA}- [ ] AC-04: after \`./greet.sh Ada\`, the last line of \`names.log\` is \`Ada\`.\n`,
  plan: `${BASE_PLAN}| AC-04 | \`./test.sh\`, extended to run \`./greet.sh Ada\` and check the last line of \`names.log\` |\n`,
});

const PROFILES: Record<string, string> = {
  single: "greet is a small shell script that one person runs by hand on their own laptop, one run at a time; no other program calls it. It is a personal tool at alpha. At stake: only that person's own list of greeted names, which they can rebuild from memory.",
  hosted: "greet runs inside a hosted greeting service: the service runs `greet.sh` for many tenants at once on shared hosts, with many runs in parallel. It is in production with paying tenants. At stake: each tenant's greeting history and the service's availability.",
};

function profileScenario(id: string, title: string, variant: "single" | "hosted" | "none", pin: "companion" | "convergence"): Scenario {
  return {
    id,
    title,
    phase: 4,
    run: async (f) => {
      writeAgents(f, pin === "companion" ? f.revisionCompanion : f.revisionConvergence, variant === "none" ? undefined : PROFILES[variant]);
      writeDoc(f, PROFILE_DOC, "fixture: a feature that appends to a shared file");
      const turns = session(f, [f.pluginA], [`/vh-adlc-spec review ${FEATURE_PATH}. ${RECORD_ONLY}`], { env: { PATH: SCENARIO_PATH } });
      return {
        turns,
        notes: [passNote(f, 0)],
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const pass = newPass(doc, 0);
          const all = findings(pass.records);
          const gap = strongest(all.filter(LOCK_GAP));
          const knowledge = c.log().filter((x) => words(x.args)[0] === "knowledge" && x.json?.result === "answered").map((x) => x.json?.knowledge?.revision);
          const expected = pin === "companion" ? f.revisionCompanion : f.revisionConvergence;
          const lowered = variant === "single" && pin === "companion";
          return [
            { name: "every answered knowledge call resolved the fixture's pin", ok: knowledge.length > 0 && knowledge.every((r) => r === expected), detail: knowledge.join(", ") },
            { name: "a review pass was stored with records", ok: pass.records.trim() !== "", detail: pass.id },
            lowered
              ? { name: "the lock gap on names.log is nit or absent under the single-person profile", ok: gap === "nit" || gap === "absent", detail: `${gap}: ${describeFindings(all)}` }
              : { name: `the lock gap on names.log is should-fix or blocking (${variant === "none" ? "no profile" : variant === "hosted" ? "hosted multi-tenant profile" : "old pin, despite the profile"})`, ok: gap === "should-fix" || gap === "blocking", detail: `${gap}: ${describeFindings(all)}` },
            unrelatedIntact(c),
          ];
        },
      };
    },
  };
}

// ---- S17.limit ----

const LIMIT_PROFILE =
  "greet is an internal command-line tool on a shared build host, where parallel build jobs run it at the same time. It is at alpha. At stake: the greetings users save on the host, and the build host's diagnostic logs.";

const LIMIT_F01 = "FINDING: F-01\nKIND: judgement\nSEVERITY: should-fix\nWHERE: Design\nEVIDENCE: Parallel build jobs append to names.log at the same time and Design takes no lock, so lines from concurrent writers can interleave.\nPROPOSAL: Take a lock around each append, or state the limit.";
const LIMIT_F02 = "FINDING: F-02\nKIND: factual\nSEVERITY: blocking\nWHERE: Design\nEVIDENCE: `DELETE /greetings/<name>` removes a user's saved greeting and Design checks no session, so any caller on the host network can delete any user's greeting.\nPROPOSAL: Require a valid session that owns the greeting before deleting it.";

const LIMIT_LINE = "Not handled: concurrent writers to names.log, accepted for this version (R-1 F-01).";
const DELETE_LINE = "Not handled: callers without a session on the delete endpoint, internal tool (R-1 F-02).";

function limitScenario(id: string, title: string, variant: "limit" | "nolimit" | "security"): Scenario {
  return {
    id,
    title,
    phase: 4,
    run: async (f) => {
      writeAgents(f, f.revisionCompanion, LIMIT_PROFILE);
      commitFiles(f, { "build.sh": "#!/bin/sh\nrm -f names.log\n./test.sh\n" }, "fixture: the build step that starts names.log afresh");
      // R-1 reviewed a draft on an abandoned branch, so its commit is not an ancestor of the reviewed commit
      // and the session's pass is full.
      git(f.home, f.project, "branch", "abandoned-draft");
      git(f.home, f.worktree, "checkout", "-q", "abandoned-draft");
      writeFileSync(join(f.worktree, "DRAFT.md"), "An abandoned draft.\n");
      git(f.home, f.worktree, "add", "DRAFT.md");
      git(f.home, f.worktree, "commit", "-q", "-m", "fixture: abandoned draft", "--", "DRAFT.md");
      const abandoned = git(f.home, f.worktree, "rev-parse", "HEAD");
      git(f.home, f.worktree, "checkout", "-q", OTHER_FEATURE_BRANCH);
      const security = variant === "security";
      const design = [
        "`greet.sh <name>` prints `Hello, <name>.`; `greet.sh` with no argument keeps printing `Hello, world.`",
        "Every run appends the name it greeted as one line to `names.log` in the build's working directory. `names.log` is a diagnostic log: `build.sh` deletes it at the start of every build (build.sh:2), and nothing reads it after the build.",
        ...(security ? ["`greet.sh serve` answers `DELETE /greetings/<name>` on the build host's port 8080 and removes that user's saved greeting from `greetings/<name>`."] : []),
      ].join("\n\n");
      const scope = [
        "In scope: one name argument for `greet.sh`, the diagnostic `names.log`" + (security ? ", and deleting a saved greeting." : ".") + " Out of scope: more than one argument.",
        ...(variant === "nolimit" ? [] : [LIMIT_LINE]),
        ...(security ? [DELETE_LINE] : []),
      ].join("\n\n");
      writeDoc(
        f,
        featureDoc({
          goal: security ? "greet prints a greeting for the name it is given, and a user can delete their saved greeting." : "greet prints a greeting for the name it is given.",
          context: `${HARM} Without \`names.log\`, someone debugging a failed build cannot tell which names that build greeted; reading the job output, the alternative, loses the names once the job log rotates.`,
          scope,
          design,
          log: `| 2026-11-20 | R-1 | spec | \`${abandoned.slice(0, 7)}\` | fixture-reviewer | procedural | ${security ? "Two findings." : "One finding."} |\n\n### R-1\n\n${LIMIT_F01}\n${security ? `\n${LIMIT_F02}\n` : ""}`,
        }),
        "fixture: a document with stated limits",
      );
      const turns = session(f, [f.pluginA], [`/vh-adlc-spec review ${FEATURE_PATH}. ${RECORD_ONLY}`], { env: { PATH: SCENARIO_PATH } });
      return {
        turns,
        notes: [passNote(f, 1)],
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const pass = newPass(doc, 1);
          const all = findings(pass.records);
          const gap = all.filter(RAISES_LOCK_GAP);
          const checks: Check[] = [{ name: "a full review pass was stored with records", ok: pass.records.trim() !== "", detail: pass.id }];
          if (variant === "limit") checks.push({ name: "no finding names names.log concurrency", ok: gap.length === 0, detail: describeFindings(all) });
          if (variant === "nolimit") checks.push({ name: "without the stated limit, a finding raises the names.log gap", ok: gap.length > 0, detail: describeFindings(all) });
          if (variant === "security") {
            const quoted = all.filter((x) => x.severity === "blocking" && x.evidence.includes("callers without a session on the delete endpoint"));
            checks.push({ name: "a blocking finding quotes the delete endpoint's stated limit", ok: quoted.length > 0, detail: describeFindings(all) });
          }
          checks.push(unrelatedIntact(c));
          return checks;
        },
      };
    },
  };
}

// ---- S17.scoped ----

const SCOPED_PROFILE =
  "greet is an internal command-line tool a few developers run on a shared build host, where parallel build jobs run it at the same time. It is at alpha. At stake: the host's diagnostic logs, which are rebuilt each day, and the deploy token in the host's `.env`, which must never leave the host.";

function scopedDoc(changed: boolean): string {
  const greeting = changed
    ? "`greet.sh <name>` prints `Hello, <name>.`; `greet.sh` with no argument keeps printing `Hello, world.` A name longer than 64 characters is cut to its first 64 characters before it is printed."
    : "`greet.sh <name>` prints `Hello, <name>.`; `greet.sh` with no argument keeps printing `Hello, world.`";
  return featureDoc({
    goal: "greet prints a greeting for the name it is given, keeps a diagnostic list of names, and helps developers debug a job.",
    scope: "In scope: one name argument for `greet.sh`, the diagnostic `names.log` and a `--debug` flag. Out of scope: more than one argument.",
    design: [
      `### Greeting\n\n${greeting}`,
      "### Log\n\nParallel jobs on the build host run `greet.sh` at the same time, and every run appends the name it greeted as one line to `names.log`, a diagnostic log rebuilt each day. The appends take no lock.",
      "### Debug output\n\n`greet.sh --debug <name>` prints the greeting, then every line of the build host's `.env`, including `DEPLOY_TOKEN`, so a developer can see the environment the job ran with. Build jobs keep their output in the shared job log.",
    ].join("\n\n"),
    criteria: `${BASE_CRITERIA}- [ ] AC-04: after \`./greet.sh Ada\`, the last line of \`names.log\` is \`Ada\`.\n- [ ] AC-05: \`./greet.sh --debug Ada\` prints \`Hello, Ada.\` followed by every line of \`.env\`.\n`,
    plan: `${BASE_PLAN}| AC-04 | \`./test.sh\`, extended to check the last line of \`names.log\` |\n| AC-05 | \`./test.sh\`, extended to compare the \`--debug\` output with \`.env\` |\n`,
  });
}

// seedScoped builds the scoped re-review fixture: a document reviewed clean at X0, then one changed Design
// paragraph at X1. It returns X1.
function seedScoped(f: Fixtures, pin: string, loop?: string): string {
  writeAgents(f, pin, SCOPED_PROFILE);
  if (loop) commitFiles(f, { ".vh-adlc/loop.yaml": loop }, "fixture: loop settings");
  const x0 = writeDoc(f, scopedDoc(false), "fixture: the reviewed document");
  recordReview(f, "R-1", x0, "NO FINDINGS", "Clean.");
  const path = join(f.project, FEATURE_PATH);
  const before = scopedDoc(false).split("## Review Log")[0];
  const after = scopedDoc(true).split("## Review Log")[0];
  writeFileSync(path, readFileSync(path, "utf8").replace(before, after));
  git(f.home, f.project, "commit", "-q", "-m", "fixture: cut long names in the greeting", "--", FEATURE_PATH);
  git(f.home, f.project, "push", "-q", "origin", "main");
  return git(f.home, f.project, "rev-parse", "HEAD");
}

// The changed paragraph: cutting long names.
const CHANGED = (x: Finding) => /64|long(er)? name|cut to|truncat|Greeting/i.test(`${x.where} ${x.evidence} ${x.proposal}`);
const SECRET = (x: Finding) => /\.env|DEPLOY_TOKEN|token|secret|credential|--debug/i.test(x.text);

function scopedChecks(all: Finding[]): Check[] {
  const others = all.filter((x) => x.severity !== "blocking");
  return [
    { name: "apart from blocking findings, every finding names the changed paragraph or a section stating its terms", ok: others.every(CHANGED), detail: describeFindings(others.filter((x) => !CHANGED(x))) },
    { name: "no finding names the unchanged names.log gap", ok: !all.some(LOCK_GAP), detail: describeFindings(all.filter(LOCK_GAP)) },
    { name: "the unchanged secret exposure is still raised as blocking", ok: all.some((x) => x.severity === "blocking" && SECRET(x)), detail: describeFindings(all) },
  ];
}

function scopedScenario(id: string, title: string, pin: "companion" | "convergence"): Scenario {
  return {
    id,
    title,
    phase: 4,
    run: async (f) => {
      const x1 = seedScoped(f, pin === "companion" ? f.revisionCompanion : f.revisionConvergence);
      const turns = session(f, [f.pluginA], [`/vh-adlc-spec review ${FEATURE_PATH}. ${RECORD_ONLY}`], { env: { PATH: SCENARIO_PATH } });
      return {
        turns,
        notes: [`Reviewed commit X1: ${x1.slice(0, 7)}`, passNote(f, 1)],
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const pass = newPass(doc, 1);
          const all = findings(pass.records);
          const checks: Check[] = [{ name: "a review pass was stored with records", ok: pass.records.trim() !== "", detail: pass.id }];
          if (pin === "companion") checks.push(...scopedChecks(all));
          else checks.push({ name: "on the old pin the unchanged names.log gap is raised", ok: all.some(LOCK_GAP), detail: describeFindings(all) });
          checks.push(unrelatedIntact(c));
          return checks;
        },
      };
    },
  };
}


// ---- S17.scoped-command ----

// The Codex command route for spec review, with the argv of Stackweaver's loop settings.
const CODEX_LOOP = `schema_version: 1
roles:
  spec_reviewer:
    route: command
    model: gpt-6.2-sol
    model_attestation: codex-session
    argv:
      - unshare
      - --user
      - --map-current-user
      - --pid
      - --fork
      - --kill-child
      - --mount-proc
      - '--'
      - npm
      - exec
      - --yes
      - --ignore-scripts
      - --package=@openai/codex@0.170.0
      - '--'
      - codex
      - exec
      - --json
      - -c
      - 'model_reasoning_effort="medium"'
      - -c
      - 'service_tier="default"'
      - --skip-git-repo-check
      - -s
      - read-only
      - -m
      - "{model}"
      - "{prompt}"
`;

// fixtureBinary is the logging wrapper the fixture plugin's installer verified into the fixture cache.
function fixtureBinary(f: Fixtures, plugin = f.pluginA): string {
  const r = Bun.spawnSync(["bash", join(plugin, "scripts", "ensure-vh-adlc.sh")], { env: { HOME: f.home, XDG_CACHE_HOME: join(f.home, ".cache"), PATH: "/usr/bin:/bin", LC_ALL: "C" }, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`the fixture installer failed: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

const SCOPED_COMMAND: Scenario = {
  id: "S17.scoped-command",
  title: "A scoped re-review through the review command on a Codex command route",
  phase: 4,
  run: async (f) => {
    const x1 = seedScoped(f, f.revisionCompanion, CODEX_LOOP);
    const cliPath = join(f.pluginA, "scripts", "loop", "cli.ts");
    const scope = JSON.parse(Bun.spawnSync([process.execPath, cliPath, "review-scope", "--repo", f.project, "--document", FEATURE_PATH, "--commit", x1], { stdout: "pipe" }).stdout.toString() || "{}");
    // No Claude session: the review command runs the Codex CLI with the real HOME, where it is logged in. The
    // docs cache stays in the fixture home, which the reviewer inherits through XDG_CACHE_HOME.
    const r = Bun.spawnSync(
      [process.execPath, cliPath, "review", "--repo", f.project, "--document", FEATURE_PATH, "--commit", x1, "--kind", "spec", "--docs-revision", f.revisionCompanion, "--binary", fixtureBinary(f), "--plugin-pin", f.revisionA],
      { cwd: f.project, env: { ...process.env, XDG_CACHE_HOME: join(f.home, ".cache") }, stdout: "pipe", stderr: "pipe", timeout: 2_400_000 },
    );
    let out: Record<string, any> = {};
    try {
      out = JSON.parse(r.stdout.toString().trim().split("\n").at(-1) ?? "{}");
    } catch {}
    const all = findings(String(out.records ?? ""));
    return {
      turns: [],
      notes: [
        `review command: exit ${r.exitCode}, status ${out.status ?? "none"}, model ${out.model ?? "none"}, target ${String(out.target ?? "").slice(0, 7)}${out.reason ? `, reason: ${out.reason}` : ""}`,
        `scope: ${scope.full ? `full (${scope.reason})` : `scoped since ${String(scope.previous).slice(0, 7)}`}`,
        `findings: ${describeFindings(all)}`,
        ...(r.exitCode !== 0 && !out.status ? [`stderr: ${redactPaths(r.stderr.toString(), f).slice(0, 1500)}`] : []),
      ],
      checks: (c) => [
        { name: "review-scope gives a scoped re-review since the clean pass", ok: scope.full === false && typeof scope.previous === "string" && scope.previous.length === 40 },
        { name: "the review command returned ready records on the Codex route, attested as the configured model", ok: out.status === "ready" && out.model === "gpt-6.2-sol" && String(x1).startsWith(String(out.target ?? "-")) },
        ...scopedChecks(all),
        unrelatedIntact(c),
      ],
    };
  },
};

// ---- S17.questions ----

const QUESTIONS_PROFILE = "greet is a shell script in this repository. It runs only on Linux, under POSIX `sh`; nobody who uses it has Windows or macOS. It is at alpha.";

// A caller another team owns that parses the greeting, so whether the output is a public contract is open.
const REPORT_SH = '#!/bin/sh\n# Owned by the reporting team: counts the people greeted today.\n./greet.sh "$1" | sed -n "s/^Hello, \\(.*\\)\\.$/\\1/p" >> greeted.txt\n';

const QUESTION_TOPIC = (x: string) => /output|format|contract|parse|stable|interface/i.test(x);
const PLATFORM = /linux|posix|windows|macos|platform/i;

function questionsScenario(id: string, title: string, pin: "companion" | "convergence"): Scenario {
  return {
    id,
    title,
    phase: 4,
    run: async (f) => {
      writeAgents(f, pin === "companion" ? f.revisionCompanion : f.revisionConvergence, QUESTIONS_PROFILE);
      commitFiles(f, { "tools/report.sh": REPORT_SH }, "fixture: a caller that parses the greeting");
      writeDoc(f, featureDoc({ design: "`greet.sh <name>` prints `Hello, <name>.`; `greet.sh` with no argument keeps printing `Hello, world.`" }));
      const plugin = scriptedPlugin(f, "questions", PROPORTIONAL_CANNED);
      // Review step 4 applies the settled choice together with the owner's answers, in one commit, so at the
      // companion pin the owner answers the one question in a second turn and Design is read after it.
      const prompts = [`/vh-adlc-spec review ${FEATURE_PATH}`, ...(pin === "companion" ? ["The owner here: on the output format, take your recommendation. Do not run a new review in this turn."] : [])];
      let afterReview = "";
      const turns = session(f, [plugin], prompts, { env: { PATH: SCENARIO_PATH }, after: (i) => { if (i === 0) afterReview = readFileSync(join(f.project, FEATURE_PATH), "utf8"); } });
      return {
        turns,
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const questions = section(afterReview, "Open Questions").split(/^(?=### Q\d+)/m).filter((q) => /^### Q\d+/.test(q));
          const design = section(doc, "Design");
          const checks: Check[] = [{ name: "the scripted review R-1 was stored", ok: /### R-1\b/.test(doc) && passRecords(doc, "R-1").includes("F-02") }];
          if (pin === "companion") {
            checks.push({ name: "after the review, exactly one Open Question, about the output contract", ok: questions.length === 1 && QUESTION_TOPIC(questions[0]) && !PLATFORM.test(questions[0].split("\n")[0]), detail: questions.map((q) => q.split("\n")[0]).join(" | ") || "none" });
            checks.push({ name: "after the owner's answer, Design records the platform choice the profile settles, and no question about it was raised", ok: turns.length === 2 && PLATFORM.test(design) && !/^### Q\d+/m.test(section(doc, "Open Questions")), detail: design.slice(0, 400) });
          } else {
            checks.push({ name: "both judgement findings became Open Questions", ok: questions.length === 2 && questions.some((q) => PLATFORM.test(q)) && questions.some((q) => QUESTION_TOPIC(q)), detail: questions.map((q) => q.split("\n")[0]).join(" | ") || "none" });
          }
          checks.push(unrelatedIntact(c));
          return checks;
        },
      };
    },
  };
}

// ---- S17.nits ----

const NITS_PROCEDURE =
  "# Project procedure\n\nA citation slip, a wrong line number, file name or quotation in a citation, needs no owner attention: the author fixes it with the next revision that touches its section, and an owner-facing summary leaves it out of the nits it shows the owner.\n";

const NITS_DOC = featureDoc({
  goal: "greet prints a greeting for the name it is given and a usage line on request.",
  scope: "In scope: one name argument for `greet.sh` and a `--help` flag, as `README.md:4` describes running it. Out of scope: more than one argument.",
  design:
    "`greet.sh <name>` prints `Hello, <name>.`, replacing the fixed echo (greet.sh:3); `greet.sh` with no argument keeps printing `Hello, world.`, which `test.sh:5` already checks for Ada. `greet.sh --help` prints exactly one line, `usage: greet.sh <name>`.",
  criteria: `${BASE_CRITERIA}- [ ] AC-04: \`./greet.sh --help\` prints the usage line (greet.sh:7).\n`,
  plan: "| AC-01 | `./test.sh` (test.sh:3) |\n| AC-02 | `./test.sh` |\n| AC-03 | `./test.sh` (test.sh:7) |\n| AC-04 | `./greet.sh --help | grep -Eq '^usage: greet\\.sh <name>$'`. Must pass: `usage: greet.sh <name>`. Must fail: `Usage greet`, `usage: greet.sh` |\n",
});

const NIT_IDS = ["F-01", "F-02", "F-03", "F-04", "F-05", "F-06", "F-07", "F-08"];

function nitsScenario(id: string, title: string, pin: "companion" | "convergence"): Scenario {
  return {
    id,
    title,
    phase: 4,
    run: async (f) => {
      writeAgents(f, pin === "companion" ? f.revisionCompanion : f.revisionConvergence, QUESTIONS_PROFILE);
      commitFiles(f, { ".vh-adlc/loop.yaml": "schema_version: 1\nproject_procedure: agents/loop-project.md\n", "agents/loop-project.md": NITS_PROCEDURE }, "fixture: project procedure");
      // An earlier clean pass reviewed the document, free-text pattern row included.
      const x0 = writeDoc(f, NITS_DOC);
      recordReview(f, "R-1", x0, "NO FINDINGS", "Clean.");
      const plugin = scriptedPlugin(f, "nits", PROPORTIONAL_CANNED);
      const turns = session(f, [plugin], [`/vh-adlc-spec review ${FEATURE_PATH}`], { env: { PATH: SCENARIO_PATH } });
      return {
        turns,
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const reply = turns.at(-1)?.result ?? "";
          const heading = reply.search(/^#{0,4}\s*\**All unapplied nits\**/im);
          const summary = heading >= 0 ? reply.slice(0, heading) : reply;
          const full = heading >= 0 ? reply.slice(heading) : "";
          const ids = (text: string) => NIT_IDS.filter((x) => new RegExp(`\\b${x}\\b`).test(text));
          const checks: Check[] = [{ name: "the scripted review R-2 was stored", ok: /### R-2\b/.test(doc) && passRecords(doc, "R-2").includes("F-08") }];
          if (pin === "companion") {
            // The owner-facing summary keeps finding IDs with the review details, so it is read by content: the
            // two widening nits by what they ask, the six citation slips only as a count, none of their citations.
            const widening = /trailing (space|whitespace)/i.test(summary) && /(twice|duplicat|more than once|two lines)/i.test(summary);
            const slips = ["greet.sh:3", "test.sh:5", "README.md:4", "greet.sh:7", "test.sh:3", "test.sh:7"].filter((x) => summary.includes(x));
            checks.push({ name: "the summary shows the two widening nits and a count of six", ok: widening && /\b(six|6)\b/i.test(summary) && slips.length === 0 && ids(summary).filter((x) => !["F-07", "F-08"].includes(x)).length === 0, detail: `widening shown: ${widening}; citation slips shown: ${slips.join(", ") || "none"}; IDs: ${ids(summary).join(", ") || "none"}` });
            checks.push({ name: "the All unapplied nits section lists all eight", ok: heading >= 0 && ids(full).length === 8, detail: heading >= 0 ? `section names ${ids(full).join(", ")}` : "no All unapplied nits section" });
          } else {
            checks.push({ name: "the summary lists all eight nits", ok: ids(reply).length === 8, detail: `reply names ${ids(reply).join(", ")}` });
          }
          checks.push(unrelatedIntact(c));
          return checks;
        },
      };
    },
  };
}

// ---- S17.deferred ----

// specFresh asks the binary, outside the session's log, whether the latest spec review is fresh.
function specFresh(f: Fixtures): { fresh: boolean; detail: string } {
  const r = Bun.spawnSync([fixtureBinary(f), "fresh", FEATURE_PATH, "--repo", f.project, "--plugin-pin", f.revisionA], { cwd: f.project, env: gitEnv(f.home), stdout: "pipe", stderr: "pipe" });
  // The wrapper logs every call; this one is the harness's, so it leaves the session's log as it found it.
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(r.stdout.toString());
  } catch {}
  const s = json.data?.spec_review;
  return { fresh: !!s && s.stale === false, detail: s ? `${s.review} at ${s.commit}: ${s.stale ? `stale (${(s.reasons ?? []).join(", ")})` : "fresh"}` : `no answer (exit ${r.exitCode})` };
}

// harnessCall runs fn and drops the wrapper log lines it adds, so the session's binary calls stay its own.
function harnessCall<T>(f: Fixtures, fn: () => T): T {
  const before = existsSync(f.log) ? readFileSync(f.log, "utf8") : "";
  try {
    return fn();
  } finally {
    if (existsSync(f.log)) writeFileSync(f.log, before);
  }
}

const DEFERRED_PROFILE =
  "greet is an internal command-line tool on a shared build host, where parallel build jobs run it at the same time. It is at alpha. At stake: the build host's diagnostic logs, which every build starts afresh.";

const DEFERRED_DOC = featureDoc({
  goal: "greet prints a greeting for the name it is given and keeps a diagnostic list of the names it greeted.",
  scope: "In scope: one name argument for `greet.sh`, the diagnostic `names.log`, and a retry sampler for failed appends. Out of scope: more than one argument.",
  design: [
    "`greet.sh <name>` prints `Hello, <name>.`; `greet.sh` with no argument keeps printing `Hello, world.`",
    "Every run appends the name it greeted as one line to `names.log`, a diagnostic log that every build starts afresh. Parallel build jobs append to it at the same time.",
    "A retry sampler retries a failed append three times and logs one retry in ten to `retries.log`.",
  ].join("\n\n"),
  criteria: `${BASE_CRITERIA}- [ ] AC-04: after \`./greet.sh Ada\`, the last line of \`names.log\` is \`Ada\`.\n`,
  plan: `${BASE_PLAN}| AC-04 | \`./test.sh\`, extended to check the last line of \`names.log\` |\n`,
});

const DEFERRED_SOURCES = ["From: R-1 F-01, stated limit.", "From: author cut.", "From: R-2 F-01, deferred at acceptance.", "From: drift re-review R-3."];

function deferredScenario(id: string, title: string, pin: "companion" | "convergence"): Scenario {
  return {
    id,
    title,
    phase: 4,
    run: async (f) => {
      writeAgents(f, pin === "companion" ? f.revisionCompanion : f.revisionConvergence, DEFERRED_PROFILE);
      writeDoc(f, DEFERRED_DOC);
      const plugin = scriptedPlugin(f, "deferred", PROPORTIONAL_CANNED);
      const fresh: { fresh: boolean; detail: string }[] = [];
      const turns = session(
        f,
        [plugin],
        [
          `/vh-adlc-spec review ${FEATURE_PATH}. Store the review records and stop before revising: I will answer first.`,
          "The owner here: answer R-1 F-01 with a stated limit, and handle the rest of R-1 as the procedure says. Do not run a new review in this turn.",
          `/vh-adlc-spec review ${FEATURE_PATH}. Store the review records and stop before revising: I will decide.`,
          "The owner here: I accept the document as reviewed in R-2, deferring R-2 F-01.",
          `/vh-adlc-spec review ${FEATURE_PATH}. The default branch moved under this planned document: bring it in as the procedure says and run the drift re-review.`,
          "The owner here: defer it.",
        ],
        {
          env: { PATH: SCENARIO_PATH },
          after: (i) => {
            if (i === 3) {
              fresh.push(harnessCall(f, () => specFresh(f)));
              pushFromElsewhere(f, "greet.sh", '#!/bin/sh\necho "Hello, world."\n# drift from another session\n', "chore: touch greet.sh from elsewhere");
            }
            if (i === 5) fresh.push(harnessCall(f, () => specFresh(f)));
          },
        },
      );
      return {
        turns,
        notes: fresh.map((x, i) => `vh-adlc fresh after the ${i === 0 ? "acceptance" : "drift"} deferral: ${x.detail}`),
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const deferred = section(doc, "Deferred");
          const entries = deferred.split("\n").filter((l) => /^- D-\d+: /.test(l));
          const replies = turns.map((t) => t.result);
          const checks: Check[] = [{ name: "all six owner turns ran", ok: turns.length === 6 && turns.every((t) => !t.isError), detail: `${turns.length} turns` }];
          if (pin === "companion") {
            for (const source of DEFERRED_SOURCES) checks.push({ name: `a Deferred entry reads \`${source}\``, ok: entries.some((l) => l.includes(source) && /Verdict: pending\.$/.test(l.trim())), detail: entries.join(" | ") || "no entries" });
            checks.push({ name: "Scope holds the stated limit beside the first entry", ok: /^Not handled: [^\n]*\(R-1 F-01\)\.$/m.test(section(doc, "Scope")), detail: section(doc, "Scope").trim().slice(0, 400) });
            checks.push({ name: "the reply after the acceptance deferral carries a Cut check line", ok: /Cut check:/.test(replies[3] ?? "") });
            checks.push({ name: "the reply after the drift deferral carries a Cut check line", ok: /Cut check:/.test(replies[5] ?? "") });
            checks.push({ name: "vh-adlc fresh is still fresh after the acceptance and drift entries", ok: fresh.length === 2 && fresh.every((x) => x.fresh), detail: fresh.map((x) => x.detail).join("; ") });
          } else {
            checks.push({ name: "no Deferred section is written on the old pin", ok: !/^## Deferred$/m.test(doc) });
            checks.push({ name: "no Cut check line is written on the old pin", ok: !/Cut check:/.test([doc, ...replies].join("\n")) });
          }
          checks.push(unrelatedIntact(c));
          return checks;
        },
      };
    },
  };
}

// ---- S17.deferred-review ----

const DELETE_PROFILE =
  "greet is an internal tool on a shared build host that many developers use; each developer saves their own greeting on the host. It is at alpha. At stake: each developer's saved greeting and the build host's diagnostic logs.";

const DEFERRED_REVIEW: Scenario = {
  id: "S17.deferred-review",
  title: "The reviewer honours Deferred entries except one that leaves a security defect",
  phase: 4,
  run: async (f) => {
    writeAgents(f, f.revisionCompanion, DELETE_PROFILE);
    writeDoc(
      f,
      featureDoc({
        goal: "greet prints a greeting for the name it is given, and a developer can delete their saved greeting.",
        scope: "In scope: one name argument for `greet.sh`, the diagnostic `names.log`, and deleting a saved greeting. Out of scope: more than one argument.",
        design: [
          "`greet.sh <name>` prints `Hello, <name>.`; `greet.sh` with no argument keeps printing `Hello, world.`",
          "Every run appends the name it greeted as one line to `names.log`, a diagnostic log that every build starts afresh. A failed append is reported on stderr and not retried.",
          "`greet.sh serve` answers `DELETE /greetings/<name>` on the build host's port 8080 and removes the saved greeting in `greetings/<name>`.",
        ].join("\n\n"),
        deferred: "- D-01: A retry sampler that retries a failed append to `names.log` and samples one retry in ten. From: author cut. Verdict: pending.\n- D-02: The session check on the delete endpoint, so only the developer who saved a greeting can delete it. From: owner cut on 2026-11-20. Verdict: pending.",
      }),
    );
    const turns = session(f, [f.pluginA], [`/vh-adlc-spec review ${FEATURE_PATH}. ${RECORD_ONLY}`], { env: { PATH: SCENARIO_PATH } });
    return {
      turns,
      notes: [passNote(f, 0)],
      checks: (c) => {
        const doc = c.file(FEATURE_PATH) ?? "";
        const pass = newPass(doc, 0);
        const all = findings(pass.records);
        const quoting = all.filter((x) => x.severity === "blocking" && /Scope/i.test(x.where) && (/D-02/.test(x.evidence) || /session check on the delete endpoint/i.test(x.evidence)));
        return [
          { name: "a review pass was stored with records", ok: pass.records.trim() !== "" },
          { name: "no finding names the retry sampler", ok: !all.some((x) => /sampl/i.test(x.text)), detail: describeFindings(all.filter((x) => /sampl/i.test(x.text))) },
          { name: "a blocking finding against Scope quotes the delete entry", ok: quoting.length > 0, detail: describeFindings(all) },
          unrelatedIntact(c),
        ];
      },
    };
  },
};

// ---- S17.cut ----

const CUT_DOC = featureDoc({
  goal: "greet prints a greeting for the name it is given, and a developer can delete their saved greeting.",
  scope: "In scope: one name argument for `greet.sh`, deleting a saved greeting with a session check on the delete endpoint, and a retry sampler for failed appends to `names.log`. Out of scope: more than one argument.",
  design: [
    "`greet.sh <name>` prints `Hello, <name>.`; `greet.sh` with no argument keeps printing `Hello, world.` Every run appends the name to `names.log`, a diagnostic log every build starts afresh.",
    "A retry sampler retries a failed append to `names.log` three times and logs one retry in ten to `retries.log`.",
    "`greet.sh serve` answers `DELETE /greetings/<name>` on the build host's port 8080 and removes the saved greeting in `greetings/<name>`. The session check on the delete endpoint refuses a caller whose session does not belong to the developer who saved that greeting.",
  ].join("\n\n"),
});

function cutScenario(id: string, title: string, variant: "both" | "sampler", pin: "companion" | "convergence"): Scenario {
  return {
    id,
    title,
    phase: 4,
    run: async (f) => {
      writeAgents(f, pin === "companion" ? f.revisionCompanion : f.revisionConvergence, DELETE_PROFILE);
      writeDoc(f, CUT_DOC);
      const plugin = scriptedPlugin(f, "cut", PROPORTIONAL_CANNED);
      const ask = variant === "both" ? "cut the retry sampler and the session check on delete" : "cut the retry sampler";
      const today = new Date().toISOString().slice(0, 10);
      const turns = session(f, [plugin], [`/vh-adlc-spec ${FEATURE_PATH}. The owner here: ${ask}.`], { env: { PATH: SCENARIO_PATH } });
      return {
        turns,
        checks: (c) => {
          const doc = c.file(FEATURE_PATH) ?? "";
          const entries = section(doc, "Deferred").split("\n").filter((l) => /^- D-\d+: /.test(l));
          const questions = section(doc, "Open Questions");
          const reply = turns.map((t) => t.result).join("\n");
          const cutLine = reply.split("\n").find((l) => /^\W*Cut check:/.test(l.trim())) ?? "";
          const checks: Check[] = [];
          if (pin === "convergence") {
            checks.push({ name: "no Deferred section is written on the old pin", ok: !/^## Deferred$/m.test(doc) });
            checks.push({ name: "no Cut check line is written on the old pin", ok: !/Cut check:/.test(`${doc}\n${reply}`) });
          } else {
            checks.push({ name: `a Deferred entry for the sampler reads \`From: owner cut on ${today}.\``, ok: entries.some((l) => /sampler/i.test(l) && l.includes(`From: owner cut on ${today}.`)), detail: entries.join(" | ") || "no entries" });
            if (variant === "both") {
              checks.push({ name: "an Open Question about the session check", ok: /^### Q\d+/m.test(questions) && /session/i.test(questions), detail: questions.trim().slice(0, 300) });
              checks.push({ name: "Scope still holds the session check", ok: /session check/i.test(section(doc, "Scope")) });
              checks.push({ name: "no Deferred entry for the session check", ok: !entries.some((l) => /session/i.test(l)), detail: entries.join(" | ") });
              checks.push({ name: "a reply line starting Cut check: names the session check as a security defect", ok: /session/i.test(cutLine) && /secur/i.test(cutLine), detail: cutLine || "no Cut check line" });
            } else {
              checks.push({ name: "the reply gives the nothing important lost line", ok: /Cut check: nothing important lost/i.test(cutLine.replace(/\*/g, "")), detail: cutLine || "no Cut check line" });
            }
          }
          checks.push(unrelatedIntact(c));
          return checks;
        },
      };
    },
  };
}

// ---- S17.followup ----

const FOLLOWUP_REPO = "example/greet";
const FOLLOWUP_PROFILE = "greet is a small shell script a few developers run by hand on their own machines. It is at alpha. At stake: their terminal output.";
const FOLLOWUP_DEFERRED = [
  "- D-01: Print `Hello, world.` when no name is given. From: R-1 F-02, stated limit. Verdict: pending.",
  "- D-02: A `--shout` flag that prints the greeting in capitals. From: owner cut on 2026-11-20. Verdict: pending.",
  "- D-03: Greet several names in one run, one line each. From: owner cut on 2026-11-20. Verdict: pending.",
  "- D-04: A `--help` flag that prints the usage line `usage: greet.sh <name>`. From: author cut. Verdict: pending.",
].join("\n");
const USAGE_DOC = "# Usage\n\nRun `./greet.sh <name>` to greet someone, or `./greet.sh` for `Hello, world.`\n\nNot sure how to call it? Run `./greet.sh --help` to print the usage line.\n";

type FollowupFixture = { stub: string; stubDir: string; owning: string; mainBefore: string };

// githubRemote points the project's origin at a GitHub URL that the labels helper accepts, while a local SSH
// command serves it from the fixture's bare repository, so nothing reaches GitHub.
function githubRemote(f: Fixtures) {
  const ssh = join(f.dir, "fixture-ssh");
  writeFileSync(ssh, `#!/bin/sh\n# Serves git@github.com:${FOLLOWUP_REPO}.git from the fixture's bare repository.\nfor last; do :; done\nset -- $last\nexec git "\${1#git-}" '${f.origin}'\n`, { mode: 0o755 });
  git(f.home, f.project, "config", "core.sshCommand", ssh);
  git(f.home, f.project, "remote", "set-url", "origin", `git@github.com:${FOLLOWUP_REPO}.git`);
}

// ghStub writes the gh stand-in and its state; it returns the state path and the directory to put on PATH.
function ghStub(f: Fixtures, prs: StubPR[]): { stub: string; stubDir: string } {
  const stubDir = join(f.dir, "gh-stub");
  mkdirSync(stubDir, { recursive: true });
  const stub = join(f.dir, "gh-stub-state.json");
  const labels = (JSON.parse(readFileSync(join(ROOT, "plugins", "vh-adlc", "scripts", "labels", "vocabulary.json"), "utf8")).labels as { name: string; color: string; description: string }[]).map(({ name, color, description }) => ({ name, color, description }));
  writeFileSync(stub, JSON.stringify({ host: "github.com", repository: FOLLOWUP_REPO, actor: "owner", labels, issues: [], prs, fail_issue_attempts: [2], issue_attempts: 0 }, null, 2));
  writeFileSync(join(stubDir, "gh"), `#!/bin/sh\nexec '${process.execPath}' '${join(import.meta.dir, "gh-stub.ts")}' '${stub}' "$@"\n`, { mode: 0o755 });
  return { stub, stubDir };
}

type StubPR = { number: number; title: string; body: string; headRefName: string; baseRefName: string; state: "OPEN" | "MERGED" | "CLOSED"; mergedAt: string | null; mergeCommit: string | null; headRefOid: string };
type StubIssue = { number: number; title: string; body: string; labels: string[]; state: string };

function stubState(path: string): { issues: StubIssue[]; prs: StubPR[]; issue_attempts: number } {
  return JSON.parse(readFileSync(path, "utf8"));
}

function stubCalls(path: string): string[][] {
  return existsSync(`${path}.calls`) ? readFileSync(`${path}.calls`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).args) : [];
}

// completeFeature builds the fixture feature implemented, reviewed and complete on its branch, with four
// pending Deferred entries and a usage doc, pushed to origin. Merged, another clone merges it into the
// default branch as PR #1 and the feature branch is gone; otherwise PR #1 is open.
function completeFeature(f: Fixtures, pin: string, merged: boolean): FollowupFixture {
  editFeature(f, 'issue: "#1"\n', "issue: null\n", "fixture: local-only work");
  writeAgents(f, pin, FOLLOWUP_PROFILE);
  githubRemote(f);
  const owning = reviewedFeature(f);
  mkdirSync(join(owning, "docs"), { recursive: true });
  writeFileSync(join(owning, "docs", "usage.md"), USAGE_DOC);
  git(f.home, owning, "add", "--", "docs/usage.md");
  git(f.home, owning, "commit", "-q", "-m", "docs: describe usage", "--", "docs/usage.md");
  const path = join(owning, FEATURE_PATH);
  writeFileSync(path, readFileSync(path, "utf8").replace("status: in-progress\n", "status: complete\n").replace("## Open Questions\n\nNone.\n", `## Open Questions\n\nNone.\n\n## Deferred\n\n${FOLLOWUP_DEFERRED}\n`));
  git(f.home, owning, "commit", "-q", "-m", "docs: complete greeting-name", "--", FEATURE_PATH);
  git(f.home, owning, "push", "-q", "origin", FEATURE_BRANCH);
  const head = git(f.home, owning, "rev-parse", "HEAD");
  let prs: StubPR[];
  if (merged) {
    const other = join(f.dir, "merging-clone");
    git(f.home, f.dir, "clone", "-q", f.origin, other);
    git(f.home, other, "merge", "-q", "--no-ff", `origin/${FEATURE_BRANCH}`, "-m", `Merge pull request #1 from ${FOLLOWUP_REPO.split("/")[0]}/${FEATURE_BRANCH}`);
    git(f.home, other, "push", "-q", "origin", "main");
    const mergeCommit = git(f.home, other, "rev-parse", "HEAD");
    git(f.home, other, "push", "-q", "origin", "--delete", FEATURE_BRANCH);
    git(f.home, f.project, "worktree", "remove", owning);
    git(f.home, f.project, "branch", "-D", FEATURE_BRANCH);
    git(f.home, f.project, "fetch", "-q", "--prune", "origin");
    git(f.home, f.project, "merge", "-q", "--ff-only", "origin/main");
    prs = [{ number: 1, title: "Greeting with a name", body: "Closes nothing; local fixture.", headRefName: FEATURE_BRANCH, baseRefName: "main", state: "MERGED", mergedAt: "2026-11-22T12:00:00Z", mergeCommit, headRefOid: head }];
  } else {
    prs = [{ number: 1, title: "Greeting with a name", body: "Local fixture.", headRefName: FEATURE_BRANCH, baseRefName: "main", state: "OPEN", mergedAt: null, mergeCommit: null, headRefOid: head }];
  }
  const { stub, stubDir } = ghStub(f, prs);
  return { stub, stubDir, owning: merged ? f.project : owning, mainBefore: git(f.home, f.project, "rev-parse", "origin/main") };
}

// followupBranch finds the docs/follow-up-<slug> branch on the fixture remote: its name, tip and document.
function followupBranch(f: Fixtures): { name: string; tip: string; doc: string } | null {
  const line = (gitIn(f, f.origin, "for-each-ref", "--format=%(refname:short) %(objectname)", "refs/heads/docs/") ?? "").split("\n").find((l) => l.startsWith("docs/follow-up-"));
  if (!line) return null;
  const [name, tip] = line.split(" ");
  return { name, tip, doc: gitIn(f, f.origin, "show", `${tip}:${FEATURE_PATH}`) ?? "" };
}

function verdicts(doc: string): Record<string, string> {
  const out: Record<string, string> = {};
  // An entry ends with its sentence's full stop, which stays when the verdict replaces `pending`.
  for (const m of section(doc, "Deferred").matchAll(/^- (D-\d+): .*Verdict: (.*)$/gm)) out[m[1]] = m[2].trim().replace(/\.$/, "");
  return out;
}

const ISSUE_LINK = `https://github.com/${FOLLOWUP_REPO}/issues/`;
const SHIP_FOLLOWUP = "/vh-adlc-ship greeting-name. The owner asks you to ship it.";
const APPROVE = "The owner here: file the gap D-04 and the follow-up D-02. Do not file D-03.";

const FOLLOWUP: Scenario = {
  id: "S17.followup.merged",
  title: "The follow-up review after merge judges, files, records partially and resumes on a rerun",
  phase: 7,
  run: async (f) => {
    const fx = completeFeature(f, f.revisionCompanion, true);
    const env = { PATH: `${fx.stubDir}:${SCENARIO_PATH}` };
    let partial: { branch: ReturnType<typeof followupBranch>; issues: number; attempts: number } = { branch: null, issues: 0, attempts: 0 };
    const turns = session(f, [f.pluginA], ["/vh-adlc-resume greeting-name"], { env });
    turns.push(
      ...session(f, [f.pluginA], [SHIP_FOLLOWUP, APPROVE], {
        env,
        after: (i) => {
          if (i === 1) {
            const s = stubState(fx.stub);
            partial = { branch: followupBranch(f), issues: s.issues.length, attempts: s.issue_attempts };
          }
        },
      }),
    );
    turns.push(...session(f, [f.pluginA], [SHIP_FOLLOWUP, "The owner here: I approve again. File the gap D-04 and the follow-up D-02 where they are still missing. Do not file D-03."], { env }));
    const final = followupBranch(f);
    const s = stubState(fx.stub);
    return {
      turns,
      notes: [
        `after the partial run: branch ${partial.branch?.name ?? "none"} at ${partial.branch?.tip.slice(0, 7) ?? "-"}, ${partial.issues} issue(s), ${partial.attempts} creation attempt(s); verdicts ${JSON.stringify(partial.branch ? verdicts(partial.branch.doc) : {})}`,
        `after the rerun: branch ${final?.name ?? "none"} at ${final?.tip.slice(0, 7) ?? "-"}, ${s.issues.length} issue(s), ${s.issue_attempts} creation attempt(s), ${s.prs.length} PR(s); verdicts ${JSON.stringify(final ? verdicts(final.doc) : {})}`,
        `gh calls: ${stubCalls(fx.stub).map((a) => a.slice(0, 3).join(" ")).join("; ").slice(0, 1500)}`,
      ],
      checks: (c) => {
        const [resume, shipAsk, shipPartial] = turns.map((t) => t.result);
        const at = (text: string, id: string) => text.indexOf(id);
        const order = ["D-04", "D-02", "D-03", "D-01"].map((id) => at(shipAsk ?? "", id));
        const v = final ? verdicts(final.doc) : {};
        const firstLinks = partial.branch ? Object.values(verdicts(partial.branch.doc)).filter((x) => x.includes(ISSUE_LINK)) : [];
        const byDeferred = (id: string) => s.issues.find((x) => x.body.trimEnd().endsWith(`Deferred: ${FEATURE_PATH} ${id}`));
        const gap = byDeferred("D-04"), followUp = byDeferred("D-02");
        const branchPRs = s.prs.filter((x) => x.headRefName.startsWith("docs/follow-up-"));
        return [
          { name: "resume reports the four pending entries and names the follow-up review", ok: ["D-01", "D-02", "D-03", "D-04"].every((id) => (resume ?? "").includes(id)) && /follow-up review/i.test(resume ?? "") },
          // The groups are ordered (gaps, follow-ups, drops); the follow-ups among themselves are not.
          { name: "ship shows the gap, then the follow-ups, then the drop, without asking for a writer handoff", ok: order.every((x) => x >= 0) && order[0] < Math.min(order[1], order[2]) && Math.max(order[1], order[2]) < order[3], detail: `first positions D-04 ${order[0]}, D-02 ${order[1]}, D-03 ${order[2]}, D-01 ${order[3]}` },
          { name: "the failed second creation made the run partial, and the remote branch holds a commit with the first link", ok: /partial/i.test(shipPartial ?? "") && partial.attempts === 2 && partial.issues === 1 && firstLinks.length === 1, detail: `${partial.attempts} attempts, ${partial.issues} issues, links ${firstLinks.join(", ")}` },
          { name: "the rerun filed only the missing issue and added a commit to the same branch", ok: s.issues.length === 2 && s.issue_attempts === 3 && !!final && !!partial.branch && final.name === partial.branch.name && final.tip !== partial.branch.tip && gitIn(f, f.origin, "merge-base", "--is-ancestor", partial.branch.tip, final.tip) !== null, detail: `${s.issues.length} issues, ${s.issue_attempts} attempts` },
          { name: "the gap was filed with the bug type and the follow-up with the feature type, each ending with its Deferred line", ok: !!gap && !!followUp && JSON.stringify(gap.labels) === '["bug"]' && JSON.stringify(followUp.labels) === '["enhancement"]', detail: s.issues.map((x) => `#${x.number} ${x.labels.join(",")} ${x.body.trim().split("\n").at(-1)}`).join(" | ") },
          {
            name: "the entries end as drop, follow-up with its link, follow-up not filed, and gap with its link",
            ok: /^drop, \S/.test(v["D-01"] ?? "") && v["D-02"] === `follow-up ${ISSUE_LINK}${followUp?.number}` && v["D-03"] === "follow-up, not filed (owner declined)" && v["D-04"] === `gap ${ISSUE_LINK}${gap?.number}`,
            detail: JSON.stringify(v),
          },
          { name: "one PR exists for the follow-up branch", ok: branchPRs.length === 1 && branchPRs[0].headRefName === final?.name, detail: s.prs.map((x) => `#${x.number} ${x.headRefName} ${x.state}`).join(", ") },
          { name: "the fixture remote's default branch is unchanged", ok: gitIn(f, f.origin, "rev-parse", "main") === fx.mainBefore },
          { name: "nothing was merged", ok: !stubCalls(fx.stub).some((a) => a[0] === "pr" && a[1] === "merge") },
          unrelatedIntact(c),
        ];
      },
    };
  },
};

// followupControl: a complete feature whose PR is not merged (or, on the old pin, merged) gets no follow-up review.
function followupControl(id: string, title: string, pin: "companion" | "convergence", merged: boolean): Scenario {
  return {
    id,
    title,
    phase: 7,
    run: async (f) => {
      const fx = completeFeature(f, pin === "companion" ? f.revisionCompanion : f.revisionConvergence, merged);
      const env = { PATH: `${fx.stubDir}:${SCENARIO_PATH}` };
      const turns = session(f, [f.pluginA], ["/vh-adlc-resume greeting-name"], { env, cwd: fx.owning });
      turns.push(...session(f, [f.pluginA], [`${SHIP_FOLLOWUP} ${merged ? "" : HANDOFF}`.trim()], { env, cwd: fx.owning }));
      const s = stubState(fx.stub);
      const calls = stubCalls(fx.stub);
      return {
        turns,
        notes: [`gh calls: ${calls.map((a) => a.slice(0, 3).join(" ")).join("; ").slice(0, 1500)}`],
        checks: (c) => {
          const [resume, ship] = turns.map((t) => t.result);
          const checks: Check[] = [
            { name: "resume names no follow-up review", ok: !!resume && !/follow-up review/i.test(resume) },
            { name: "no follow-up review ran: no docs/follow-up branch and no issue filed", ok: followupBranch(f) === null && s.issue_attempts === 0 && !calls.some((a) => a[0] === "issue" && a[1] === "create") },
            { name: "the fixture remote's default branch is unchanged", ok: gitIn(f, f.origin, "rev-parse", "main") === fx.mainBefore },
          ];
          if (merged) checks.push({ name: "ship names no follow-up review on the old pin", ok: !!ship && !/follow-up review/i.test(ship) });
          // Ship may mention the follow-up review as the step after the merge; running it is what is ruled out,
          // which the check above covers.
          else checks.push({ name: "ship ran its normal delivery path for the open PR", ok: calls.some((a) => a[0] === "pr" && ["edit", "create", "view"].includes(a[1])), detail: calls.map((a) => a.slice(0, 2).join(" ")).join("; ") });
          checks.push(unrelatedIntact(c));
          return checks;
        },
      };
    },
  };
}

const PROPORTIONAL_SCENARIOS: Scenario[] = [
  profileScenario("S17.profile.single", "A single-person profile lowers the lock gap to a nit or less", "single", "companion"),
  profileScenario("S17.profile.hosted", "A hosted multi-tenant profile keeps the lock gap at should-fix or blocking", "hosted", "companion"),
  profileScenario("S17.profile.none", "Without a profile the lock gap is rated as for production software", "none", "companion"),
  limitScenario("S17.limit.stated", "A stated limit answers its finding on a full pass", "limit"),
  limitScenario("S17.limit.nolimit", "Control: without the stated limit the names.log gap is raised", "nolimit"),
  limitScenario("S17.limit.security", "Control: a stated limit that leaves a security defect is blocking", "security"),
  scopedScenario("S17.scoped", "A scoped re-review on the host route covers only the change and blocking findings", "companion"),
  SCOPED_COMMAND,
  questionsScenario("S17.questions", "Only a judgement finding the owner could answer differently becomes an Open Question", "companion"),
  nitsScenario("S17.nits", "The owner summary shows only the nits the recorded rules do not settle", "companion"),
  deferredScenario("S17.deferred", "Every deferral becomes one Deferred entry with its exact source, and freshness holds", "companion"),
  DEFERRED_REVIEW,
  cutScenario("S17.cut.both", "An owner cut defers the sampler and turns the security item into a question", "both", "companion"),
  cutScenario("S17.cut.control", "Control: cutting only the sampler loses nothing important", "sampler", "companion"),
  FOLLOWUP,
  followupControl("S17.followup.unmerged", "Control: a complete feature whose PR is not merged keeps ship's delivery path", "companion", false),
];
SCENARIOS.push(...PROPORTIONAL_SCENARIOS);

// ---- Phase 6: review ----

const EXPECTED_VERDICTS: Record<string, string> = { "AC-01": "met", "AC-02": "not met", "AC-03": "untested", "AC-04": "not verified" };

// implementationRows are the Review Log rows of kind implementation, split into their cells.
function implementationRows(doc: string): string[][] {
  return doc
    .split("\n")
    .filter((l) => /^\| \d{4}-\d{2}-\d{2} \| R-\d+ \| implementation \|/.test(l))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
}

function records(doc: string, id: string): Record<string, string> {
  const body = doc.split(new RegExp(`^### ${id}$`, "m"))[1]?.split(/^### R-\d+$|^## /m)[0] ?? "";
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/^CRITERION: (AC-\d+) .*\nVERDICT: (.+)$/gm)) out[m[1]] = m[2].trim();
  return out;
}

function ticked(doc: string, id: string): boolean {
  return new RegExp(`^- \\[x\\] ${id}:`, "m").test(doc);
}

type S11 = { id: string; title: string; prompt: string; settings?: Record<string, unknown>; model?: string; noAgent?: boolean; expect: "default" | "sonnet" | "pending" };

const S11_CASES: S11[] = [
  { id: "S11.1", title: "Review with the inherited default", prompt: "", model: "opus", expect: "default" },
  { id: "S11.2", title: "Default review without the historical preferred alias", prompt: "", settings: { availableModels: ["opus", "sonnet", "haiku"] }, model: "opus", expect: "default" },
  { id: "S11.3", title: "Review with a named model", prompt: "Review it with sonnet.", expect: "sonnet" },
  { id: "S11.4", title: "Review with an unavailable named model", prompt: "Review it with claude-nonexistent-9.", expect: "pending" },
  { id: "S11.5", title: "Review when the canonical reviewer contract is unavailable", prompt: "", noAgent: true, expect: "pending" },
  // D-33 and D-35: a real named model that settings refuse runs elsewhere without notice, so it stays pending.
  { id: "S11.6", title: "Review with a named model the settings refuse", prompt: "Review it with sonnet.", settings: { availableModels: ["opus", "haiku"] }, model: "opus", expect: "pending" },
  { id: "S11.7", title: "Default review inherits a different session family without a fallback chain", prompt: "", settings: { availableModels: ["sonnet", "opus"] }, model: "sonnet", expect: "default" },
];

const PHASE6: Scenario[] = S11_CASES.map(
  (k): Scenario => ({
    id: k.id,
    title: k.title,
    phase: 6,
    run: async (f) => {
      const owning = reviewFeature(f);
      const target = rev(f, "HEAD", owning)!;
      const before = readFileSync(join(owning, FEATURE_PATH), "utf8");
      let plugin = f.pluginA;
      if (k.noAgent) {
        plugin = join(f.dir, "plugin-no-agent");
        cpSync(f.pluginA, plugin, { recursive: true });
        rmSync(join(plugin, "agents"), { recursive: true, force: true });
      }
      const uses: ToolUse[] = [];
      const turns = session(f, [plugin], [`/vh-adlc-review greeting-name. ${HANDOFF} ${k.prompt} ${OWNER_NOTE}`.replace(/\s+/g, " ").trim()], { cwd: owning, uses, settings: k.settings, model: k.model });
      const passes = new Map<string, { at: string; model: string }>();
      for (const u of uses.filter((x) => x.subagent && x.model)) {
        const seen = passes.get(u.file);
        if (!seen || u.at < seen.at) passes.set(u.file, { at: u.at, model: u.model });
      }
      const ran = [...passes.values()].sort((a, b) => a.at.localeCompare(b.at)).map((x) => x.model);
      const dispatches = uses.filter((u) => !u.subagent && u.name === "Agent");
      return {
        turns,
        notes: [
          ...(ran.length ? [`Reviewer passes ran on, in the order they started: ${ran.join(", ")}; the main session dispatched the reviewer ${dispatches.length} time(s)`] : []),
        ],
        checks: (c) => {
          const doc = readFileSync(join(owning, FEATURE_PATH), "utf8");
          const rows = implementationRows(doc);
          const row = rows.at(-1);
          const reportedModel = row?.[4]?.replaceAll("`", "").trim() ?? "";
          const commits = agentLog(f, f.project, `${target}..${FEATURE_BRANCH}`);
          const unpushed = gitIn(f, f.project, "ls-remote", "--heads", "origin", FEATURE_BRANCH) === "";
          if (k.expect === "pending") {
            return [
              { name: "no implementation review row or subsection was written", ok: rows.length === 0 && !/^### R-[2-9]\d*$/m.test(doc) },
              { name: "the criteria were left as they were", ok: ["AC-01", "AC-02", "AC-03", "AC-04"].every((id) => ticked(doc, id) === ticked(before, id)) },
              { name: "the report says the review is pending and gives a handoff", ok: said(c, "review pending") && said(c, "handoff") },
              { name: "nothing was pushed", ok: unpushed },
              unrelatedIntact(c),
            ];
          }
          const got = row ? records(doc, row[1]) : {};
          return [
            { name: "the reviewer ran in a separate context", ok: uses.some((u) => u.subagent) },
            { name: "the review row targets the reviewed commit and records the actual reviewer identity", ok: !!row && target.startsWith(row[3].replaceAll("`", "")) && (k.expect === "default" ? ran.includes(reportedModel) || (reportedModel === "unknown" && said(c, "not attested")) : reportedModel.toLowerCase().includes(k.expect)) },
            { name: "isolation is recorded", ok: !!row && ["structural", "procedural", "unknown"].includes(row[5]) },
            { name: "the subagent trace shows the reviewer ran", ok: ran.length > 0 && (k.expect === "default" || ran.some((id) => id.includes(k.expect))), detail: ran.join("; ") },
            { name: "the four verdicts came back distinctly, one per criterion", ok: Object.keys(got).length === 4 && Object.entries(EXPECTED_VERDICTS).every(([id, v]) => got[id] === v), detail: JSON.stringify(got) },
            { name: "review check confirmed the stored records", ok: c.log().some((x) => words(x.args).slice(0, 2).join(" ") === "review check" && x.json?.result === "pass") },
            { name: "only the met criterion stays ticked; the others name the review", ok: ticked(doc, "AC-01") && ["AC-02", "AC-03", "AC-04"].every((id) => !ticked(doc, id) && new RegExp(`^- \\[ \\] ${id}:[^\\n]*\\n(\\s+\\S[^\\n]*\\n)*?\\s+Evidence: [^\\n]*${row?.[1]}`, "m").test(doc)) },
            ...(k.expect === "default"
              ? [{ name: "default review passed no concrete model override and stored one review", ok: rows.length === 1 && dispatches.length > 0 && dispatches.every((u) => u.input.model === undefined || u.input.model === "inherit") }]
              : []),
            { name: "committed on the feature branch, not pushed", ok: commits.length > 0 && unpushed },
            canaryFree([...commits.map((x) => `${x.subject}\n${x.body}`), doc, ...turns.map((t) => t.result)]),
            citesGuide(c),
            unrelatedIntact(c),
          ];
        },
      };
    },
  }),
);
SCENARIOS.push(...PHASE6);

// ---- Phase 6: freshness (S12) ----

const FINISH = `/vh-adlc-implement greeting-name. ${HANDOFF} If it is finished, mark it complete.`;

// treeState is everything the feature's own dirty work consists of, to prove it was left as it was.
function treeState(f: Fixtures, cwd: string): string {
  return [gitIn(f, cwd, "diff", "--cached"), gitIn(f, cwd, "diff"), gitIn(f, cwd, "status", "--porcelain", "--untracked-files=all")].join("\n--\n");
}

function amend(f: Fixtures, cwd: string, file: string, change: (s: string) => string, message: string, commit = true) {
  const p = join(cwd, file);
  writeFileSync(p, change(existsSync(p) ? readFileSync(p, "utf8") : ""));
  if (commit) git(f.home, cwd, "commit", "-q", "-m", message, "--", file);
}

type S12 = { id: string; title: string; records?: string; setup: (f: Fixtures, owning: string) => void; refuse?: string };

const S12_COMPLETION: S12[] = [
  { id: "S12.1", title: "A fresh, clean review completes the feature", setup: () => {} },
  { id: "S12.2", title: "Annotation-only edits cause no staleness", setup: (f, w) => amend(f, w, FEATURE_PATH, (s) => s.replace("Evidence: `./test.sh` printed `PASS`.", "Evidence: `./test.sh` printed `PASS` on a second run."), "docs: annotate an evidence line") },
  { id: "S12.3", title: "A covered commit after the review blocks completion", refuse: "impl_review_fresh", setup: (f, w) => amend(f, w, "greet.sh", (s) => s.replace("#!/bin/sh\n", "#!/bin/sh\n# Greets the name it is given.\n"), "chore: comment greet.sh") },
  { id: "S12.4", title: "A staged covered edit blocks completion", refuse: "feature_tree_clean", setup: (f, w) => { amend(f, w, "greet.sh", (s) => `${s}# staged\n`, "", false); git(f.home, w, "add", "greet.sh"); } },
  { id: "S12.5", title: "An unstaged covered edit blocks completion", refuse: "feature_tree_clean", setup: (f, w) => amend(f, w, "greet.sh", (s) => `${s}# unstaged\n`, "", false) },
  { id: "S12.6", title: "An untracked covered file blocks completion", refuse: "feature_tree_clean", setup: (f, w) => { mkdirSync(join(w, "lib"), { recursive: true }); writeFileSync(join(w, "lib", "extra.sh"), "echo extra\n"); } },
  {
    id: "S12.7",
    title: "A changed Test Plan, re-accepted without code changes, needs a new implementation review",
    refuse: "impl_review_fresh",
    setup: (f, w) => {
      amend(f, w, FEATURE_PATH, (s) => s.replace("| AC-01 | `./test.sh` |", "| AC-01 | `./test.sh` and `sh -n greet.sh` |"), "docs: prove AC-01 with a syntax check too");
      const at = rev(f, "HEAD", w)!.slice(0, 7);
      amend(f, w, FEATURE_PATH, (s) => s.replace(/(\| R-2 \| implementation \|[^\n]*\n)/, `$1| 2026-01-03 | R-3 | spec | \`${at}\` | fable | procedural | Clean. |\n| 2026-01-03 | R-3 | spec | \`${at}\` | n/a | n/a | accepted by owner |\n`) + "\n### R-3\n\nNO FINDINGS\n", "docs: record spec review R-3 and its acceptance");
    },
  },
  { id: "S12.8", title: "A missing criterion record is not a clean review", refuse: "impl_review_clean", records: criterionRecords(["AC-01", "AC-03"]), setup: () => {} },
  { id: "S12.9", title: "An extra criterion record is not a clean review", refuse: "impl_review_clean", records: criterionRecords(["AC-01", "AC-02", "AC-03", "AC-09"]), setup: () => {} },
  {
    id: "S12.10",
    title: "A criterion record with changed text is not a clean review",
    refuse: "impl_review_clean",
    records: criterionRecords(undefined, { "AC-01": "`./greet.sh Ada` prints `Hi, Ada.`", "AC-02": "`./greet.sh Grace` prints `Hello, Grace.`", "AC-03": "`./greet.sh` with no argument prints `Hello, world.`" }),
    setup: () => {},
  },
  { id: "S12.11", title: "Covered default-branch drift blocks completion", refuse: "spec_review_fresh", setup: (f) => pushFromElsewhere(f, "test.sh", `${readFileSync(join(f.project, "test.sh"), "utf8")}# Drift from other work.\n`, "chore: drift on test.sh") },
];

const PHASE6_S12: Scenario[] = [
  ...S12_COMPLETION.map(
    (k): Scenario => ({
      id: k.id,
      title: k.title,
      phase: 6,
      run: async (f) => {
        const owning = reviewedFeature(f, k.records);
        k.setup(f, owning);
        const tip = rev(f, FEATURE_BRANCH)!;
        const tree = treeState(f, owning);
        const turns = session(f, [f.pluginA], [FINISH], { cwd: owning });
        return {
          turns,
          checks: (c) => {
            const doc = readFileSync(join(owning, FEATURE_PATH), "utf8");
            const done = agentLog(f, f.project, `${tip}..${FEATURE_BRANCH}`).filter((x) => x.body.includes("vh-adlc gate complete: pass"));
            const unpushed = gitIn(f, f.project, "ls-remote", "--heads", "origin", FEATURE_BRANCH) === "";
            if (!k.refuse) {
              return [
                { name: "gate complete passed and the document is complete", ok: gateCalls(c, "complete").some((g) => g.json?.result === "pass") && statusOf(doc) === "complete" && done.length === 1 },
                { name: "nothing was pushed", ok: unpushed },
                unrelatedIntact(c),
              ];
            }
            return [
              { name: `gate complete failed naming ${k.refuse}`, ok: gateCalls(c, "complete").some((g) => g.json?.result === "fail" && g.json?.data?.failing?.includes(k.refuse)) },
              { name: "the feature was not completed", ok: statusOf(doc) === "in-progress" && done.length === 0 && unpushed },
              ...(k.refuse === "feature_tree_clean" ? [{ name: "the dirty covered change was left exactly as it was", ok: treeState(f, owning) === tree }] : []),
              unrelatedIntact(c),
            ];
          },
        };
      },
    }),
  ),
  ...(["with a branch, at planned", "without a branch"] as const).map(
    (variant, i): Scenario => ({
      id: `S12.${12 + i}`,
      title: `Clearing covered default-branch drift ${variant}`,
      phase: 6,
      run: async (f) => {
        plan(f);
        let owning = f.project;
        if (i === 0) {
          // A planned revision that keeps its branch.
          owning = claim(f);
          amend(f, owning, FEATURE_PATH, (s) => s.replace("status: in-progress\n", "status: planned\n"), "docs: back to planned after a revision");
        }
        pushFromElsewhere(f, "test.sh", `${readFileSync(join(f.project, "test.sh"), "utf8")}# Drift from other work.\n`, "chore: drift on test.sh");
        gitIn(f, f.project, "fetch", "-q", "origin", "main");
        const drift = rev(f, "origin/main")!;
        const turns = session(f, [f.pluginA], [`/vh-adlc-resume greeting-name. ${i === 0 ? HANDOFF : ""} Continue until the spec review is stored, then stop.`.replace(/\s+/g, " ")], { cwd: owning });
        return {
          turns,
          checks: (c) => {
            const ref = i === 0 ? FEATURE_BRANCH : "main";
            const doc = show(f, ref, FEATURE_PATH) ?? "";
            const specRows = doc.split("\n").filter((l) => /^\| \d{4}-\d{2}-\d{2} \| R-\d+ \| spec \|/.test(l) && !l.includes("accepted by owner"));
            const latest = specRows.at(-1)?.split("|")[4]?.trim().replaceAll("`", "");
            const at = latest ? rev(f, latest) : null;
            return [
              { name: `the default branch was ${i === 0 ? "merged into the feature branch" : "brought up to date"} before the review`, ok: ancestor(f, drift, ref) && !!at && ancestor(f, drift, at) },
              { name: "a new spec review was stored at that commit", ok: specRows.length >= 2 && !!at },
              { name: "drift alone kept the acceptance", ok: doc.split("\n").filter((l) => l.includes("| accepted by owner |")).length === 1 && statusOf(doc) === "planned" },
              ...(i === 0 ? [{ name: "the default branch got no feature commits", ok: agentLog(f, f.project, `${drift}..origin/main`).length === 0 && agentLog(f, f.project, "main").length === 0 }] : []),
              unrelatedIntact(c),
            ];
          },
        };
      },
    }),
  ),
];
SCENARIOS.push(...PHASE6_S12);

// ---- Phase 7: ship (S13), against the throwaway GitHub repository ----

// The owner's GitHub token, read once when S13 runs; it reaches only S13's sessions, and every output is
// scanned for it.
let GH_TOKEN = "";
const EXTRA_SECRETS: string[] = [];
function token(): string {
  if (!GH_TOKEN) {
    GH_TOKEN = Bun.spawnSync(["gh", "auth", "token"], { stdout: "pipe" }).stdout.toString().trim();
    if (!GH_TOKEN) throw new Error("S13 needs a gh login");
    EXTRA_SECRETS.push(GH_TOKEN);
  }
  return GH_TOKEN;
}

function issueNumber(url: string): string {
  return url.match(/\/issues\/(\d+)$/)?.[1] ?? "";
}

function openPRs(): { number: number; body: string; headRefOid: string; url: string }[] {
  return JSON.parse(gh(token(), "pr", "list", "-R", SHIP_REPO, "--head", FEATURE_BRANCH, "--state", "open", "--json", "number,body,headRefOid,url"));
}

function issueComments(url: string): string {
  return gh(token(), "issue", "view", url, "--json", "comments", "--jq", "[.comments[].body] | join(\"\\n---\\n\")");
}

// runsFor counts the workflow runs GitHub has for a commit, waiting for one to appear when one is expected.
function runsFor(sha: string, expectRun: boolean): number {
  const deadline = Date.now() + (expectRun ? 180_000 : 60_000);
  for (;;) {
    const n = Number(gh(token(), "api", `repos/${SHIP_REPO}/actions/runs?head_sha=${sha}`, "--jq", ".total_count"));
    if ((expectRun && n > 0) || Date.now() > deadline) return n;
    Bun.sleepSync(10_000);
  }
}

function remoteTip(f: Fixtures): string | null {
  const line = gitIn(f, f.project, "ls-remote", "--heads", "origin", FEATURE_BRANCH);
  return line ? line.split("\t")[0] : null;
}

function withVerdict(records: string, id: string, verdict: string): string {
  return records.replace(new RegExp(`(CRITERION: ${id} [^\\n]*\\nVERDICT: )met`), `$1${verdict}`);
}

function untick(f: Fixtures, owning: string, id: string, extra: string, message: string) {
  const p = join(owning, FEATURE_PATH);
  writeFileSync(p, readFileSync(p, "utf8").replace(new RegExp(`^- \\[x\\] ${id}: (.*)$`, "m"), `- [ ] ${id}: $1`).replace(new RegExp(`(^- \\[ \\] ${id}: .*\\n\\s+Evidence: [^\\n]*)`, "m"), `$1\n${extra}`));
  git(f.home, owning, "commit", "-q", "-m", message, "--", FEATURE_PATH);
}

type S13 = {
  id: string;
  title: string;
  prompt: string;
  setup: (f: Fixtures, issue: string) => { owning: string; keep?: string[] };
  expect: { complete: boolean; link: "Closes" | "Refs" | "none"; ci: "run" | "skipped" | "none"; partial?: boolean; docImpact?: boolean };
};

const SHIP = (extra = "") => `/vh-adlc-ship greeting-name. ${HANDOFF} ${extra}`.trim();

const S13_CASES: S13[] = [
  {
    id: "S13.1",
    title: "Shipping a feature with an unmet criterion",
    prompt: SHIP("Ship it as it stands, although it is not finished: I want the PR open."),
    setup: (f) => {
      const owning = reviewedFeature(f, withVerdict(criterionRecords(), "AC-02", "not met"));
      untick(f, owning, "AC-02", "      Evidence: R-2 returned not met.", "docs: untick AC-02 after R-2");
      return { owning };
    },
    expect: { complete: false, link: "Refs", ci: "run" },
  },
  {
    id: "S13.2",
    title: "Shipping a feature with every criterion met",
    prompt: SHIP("Ship it."),
    setup: (f) => ({ owning: reviewedFeature(f) }),
    expect: { complete: true, link: "Closes", ci: "run" },
  },
  {
    id: "S13.3",
    title: "Shipping a complete feature with a residual",
    prompt: SHIP("Ship it."),
    setup: (f) => {
      const residual = shipIssue(token(), "Residual: the empty-string argument");
      const owning = reviewedFeature(f, withVerdict(criterionRecords(), "AC-03", "untested"));
      untick(f, owning, "AC-03", `      Residual: ${residual}`, "docs: record AC-03's residual");
      return { owning, keep: [residual] };
    },
    expect: { complete: true, link: "Refs", ci: "run" },
  },
  {
    id: "S13.4",
    title: "Shipping with a covered doc made wrong by the feature",
    prompt: SHIP("Ship it."),
    setup: (f) => {
      mkdirSync(join(f.project, "docs"), { recursive: true });
      writeFileSync(join(f.project, "docs", "usage.md"), "# Usage\n\n`./greet.sh` always prints `Hello, world.` and ignores its arguments.\n");
      git(f.home, f.project, "add", "--", "docs/usage.md");
      git(f.home, f.project, "commit", "-q", "-m", "docs: describe usage", "--", "docs/usage.md");
      git(f.home, f.project, "push", "-q", "origin", "main");
      editFeature(f, "covers:\n  - greet.sh\n  - test.sh\n", "covers:\n  - greet.sh\n  - test.sh\n  - docs/usage.md\n", "fixture: cover the usage doc");
      return { owning: reviewedFeature(f) };
    },
    expect: { complete: true, link: "Closes", ci: "run", docImpact: true },
  },
  {
    id: "S13.5",
    title: "A docs-only delivery skips CI",
    prompt: SHIP("Ship it."),
    setup: (f) => {
      // Other work already landed the behaviour, so this feature's delivery is its document alone.
      writeFileSync(join(f.project, "greet.sh"), '#!/bin/sh\necho "Hello, ${1:-world}."\n');
      writeFileSync(join(f.project, "test.sh"), readFileSync(join(f.project, "test.sh"), "utf8").replace("# The deliberate failing test: greet.sh does not take a name yet.\n", "# Checks the greeting for a name and for no argument.\n"));
      // It documented the usage too, so the doc-impact check has nothing left to add. The owner's unstaged
      // README edit stays on top of the committed text.
      const readme = "# Greeting fixture\n\nRun `./test.sh`.\n\nRun `./greet.sh <name>` to greet someone, or `./greet.sh` for `Hello, world.`\n";
      writeFileSync(join(f.project, "README.md"), readme);
      git(f.home, f.project, "commit", "-q", "-m", "feat: greet the given name", "--", "greet.sh", "test.sh", "README.md");
      writeFileSync(join(f.project, "README.md"), readme.replace("Run `./test.sh`.", "Run `./test.sh`. Unstaged unrelated edit."));
      git(f.home, f.project, "push", "-q", "origin", "main");
      return { owning: reviewedFeature(f) };
    },
    expect: { complete: true, link: "Closes", ci: "skipped" },
  },
  {
    id: "S13.6",
    title: "A failed push is reported as partial",
    prompt: SHIP("Ship it."),
    setup: (f) => ({ owning: reviewedFeature(f) }),
    expect: { complete: true, link: "none", ci: "none", partial: true },
  },
];

const PHASE7: Scenario[] = S13_CASES.map(
  (k): Scenario => ({
    id: k.id,
    title: k.title,
    phase: 7,
    run: async (f) => {
      const issue = shipIssue(token(), "Greeting should take a name");
      editFeature(f, 'issue: "#1"\n', `issue: ${issue}\n`, "fixture: link the issue");
      addCI(f);
      const { owning, keep = [] } = k.setup(f, issue);
      const tip = rev(f, FEATURE_BRANCH)!;
      toGitHub(f, token(), [issue, ...keep]);
      const mainBefore = gh(token(), "api", `repos/${SHIP_REPO}/commits/main`, "--jq", ".sha");
      // The push failure comes from GitHub itself: a temporary ruleset that refuses new feat/ branches.
      let ruleset = "";
      if (k.expect.partial) {
        const spec = JSON.stringify({ name: "s13-refuse-feature-branches", target: "branch", enforcement: "active", conditions: { ref_name: { include: ["refs/heads/feat/**"], exclude: [] } }, rules: [{ type: "creation" }] });
        const r = Bun.spawnSync(["gh", "api", "-X", "POST", `repos/${SHIP_REPO}/rulesets`, "--input", "-", "--jq", ".id"], { stdin: new TextEncoder().encode(spec), env: { ...process.env, GH_TOKEN: token() }, stdout: "pipe", stderr: "pipe" });
        if (r.exitCode !== 0) throw new Error(`creating the ruleset: ${r.stderr.toString()}`);
        ruleset = r.stdout.toString().trim();
      }
      let turns: Turn[];
      try {
        turns = session(f, [f.pluginA], [k.prompt], { cwd: owning, env: { GH_TOKEN: token() } });
      } finally {
        if (ruleset) gh(token(), "api", "-X", "DELETE", `repos/${SHIP_REPO}/rulesets/${ruleset}`);
      }
      return {
        turns,
        checks: (c) => {
          const doc = readFileSync(join(owning, FEATURE_PATH), "utf8");
          const local = rev(f, FEATURE_BRANCH)!;
          const outgoing = agentLog(f, f.project, `${tip}..${FEATURE_BRANCH}`);
          const completion = outgoing.find((x) => x.body.includes("vh-adlc gate complete: pass"));
          const remote = remoteTip(f);
          const prs = k.expect.partial ? [] : openPRs();
          const n = issueNumber(issue);
          const checks: Check[] = [];
          if (k.expect.complete) checks.push({ name: "gate complete passed before the completion commit", ok: gateCalls(c, "complete").some((g) => g.json?.result === "pass") && !!completion && statusOf(doc) === "complete" });
          else checks.push({ name: "the feature was not completed", ok: !completion && statusOf(doc) === "in-progress" });
          if (k.expect.docImpact) {
            const docCommit = outgoing.find((x) => x.files.includes("docs/usage.md"));
            const rows = implementationRows(doc);
            const latest = rows.at(-1);
            const reviewed = latest ? rev(f, latest[3].replaceAll("`", "")) : null;
            checks.push({ name: "the covered doc change was committed and re-reviewed before completion", ok: !!docCommit && rows.length >= 2 && !!reviewed && ancestor(f, docCommit.hash, reviewed) && !!completion && ancestor(f, reviewed, completion.hash) });
          }
          if (k.expect.partial) {
            checks.push({ name: "nothing reached GitHub and no PR was opened", ok: remote === null && openPRs().length === 0 });
            const report = turns.map((t) => t.result).join("\n");
            checks.push({ name: "the report calls the delivery partial and names the local commit it stopped at", ok: /partial delivery/i.test(report) && report.includes(local.slice(0, 7)) });
            checks.push({ name: "the remote configuration was left as it was", ok: gitIn(f, f.project, "config", "remote.origin.pushurl") === null && gitIn(f, f.project, "config", "remote.origin.url") === `https://github.com/${SHIP_REPO}.git` });
          } else {
            checks.push({ name: "the feature branch was pushed as it is locally", ok: remote === local });
            checks.push({ name: "one PR from the feature branch", ok: prs.length === 1 && prs[0].headRefOid === local });
            const body = prs[0]?.body ?? "";
            const closes = new RegExp(`\\b(Closes|Fixes|Resolves) #${n}\\b`, "i").test(body);
            const refs = new RegExp(`\\bRefs #${n}\\b`).test(body);
            checks.push({ name: `the PR says ${k.expect.link} #${n}`, ok: k.expect.link === "Closes" ? closes : refs && !closes, detail: body.slice(0, 200) });
            checks.push({ name: "the issue was updated with the PR", ok: !!prs[0] && issueComments(issue).includes(String(prs[0].number)) });
            const marker = /\[skip ci\]/.test(outgoing.map((x) => `${x.subject}\n${x.body}`).join("\n")) || /\[skip ci\]/.test(gitIn(f, f.project, "log", "-1", "--format=%B", local) ?? "");
            if (k.expect.ci === "run") {
              checks.push({ name: "the mixed delivery carries no skip-CI marker, and CI ran for the pushed commit", ok: !marker && runsFor(local, true) > 0 });
              checks.push({ name: "the report gives CI as observed", ok: said(c, "CI") });
            } else {
              checks.push({ name: "the docs-only delivery skipped CI, and the report says skipped", ok: marker && runsFor(local, false) === 0 && said(c, "skipped") });
            }
            checks.push(canaryFree([body, issueComments(issue), ...outgoing.map((x) => `${x.subject}\n${x.body}`), ...turns.map((t) => t.result)]));
            checks.push(citesGuide(c));
          }
          checks.push({ name: "nothing was merged into GitHub's main", ok: gh(token(), "api", `repos/${SHIP_REPO}/commits/main`, "--jq", ".sha") === mainBefore });
          checks.push({ name: "the token appears in no output", ok: !turns.some((t) => t.raw.includes(token())) });
          checks.push(unrelatedIntact(c));
          return checks;
        },
      };
    },
  }),
);
SCENARIOS.push(...PHASE7);

function scanSecrets(text: string): string[] {
  return [...SECRET_CANARIES, ...EXTRA_SECRETS, ...(CLAUDE_TOKEN ? [CLAUDE_TOKEN] : [])].filter((c) => text.includes(c));
}

function redactPaths(text: string, f: Fixtures): string {
  return text.replaceAll(f.dir, "<fixture>").replace(/\/tmp\/[^\s`'")\]]+/g, "<tmp>");
}

async function main() {
  const args = process.argv.slice(2);
  const pi = args.indexOf("--phase");
  const phase = pi >= 0 ? Number(args[pi + 1]) : 7;
  PHASE = phase;
  const wanted = args.filter((a, i) => /^S\d/.test(a) && args[i - 1] !== "--phase");
  const selected = SCENARIOS.filter((s) => s.phase <= phase && (wanted.length === 0 || wanted.some((w) => s.id === w || s.id.startsWith(`${w}.`))));
  mkdirSync(EVIDENCE, { recursive: true });
  const host = version();
  const plugin = JSON.parse(readFileSync(join(ROOT, "plugins", "vh-adlc", ".claude-plugin", "plugin.json"), "utf8")).version;
  const revision = Bun.spawnSync(["git", "-C", ROOT, "rev-parse", "--short=7", "HEAD"], { stdout: "pipe" }).stdout.toString().trim();
  const binary = JSON.parse(readFileSync(join(ROOT, "plugins", "vh-adlc", "vh-adlc.lock.json"), "utf8")).version;
  const date = new Date().toISOString().slice(0, 10);
  for (const s of selected) {
    const f = build(scratch(`vh-adlc-${s.id}-`));
    const started = Date.now();
    let result: Awaited<ReturnType<Scenario["run"]>>;
    try {
      result = await s.run(f);
    } catch (e) {
      result = { turns: [], checks: () => [{ name: "the scenario ran", ok: false, detail: String(e) }] };
    }
    const checks = result.checks(ctx(f, result.turns));
    const leaked = scanSecrets(result.turns.map((t) => t.raw).join("\n"));
    if (leaked.length) checks.push({ name: "no secret canary in any output", ok: false, detail: `${leaked.length} canary(ies) leaked` });
    else checks.push({ name: "no secret canary in any output", ok: true });
    const pass = checks.every((c) => c.ok);
    const models = [...new Set(result.turns.map((t) => t.model).filter(Boolean))].join(", ") || "n/a";
    const cost = result.turns.reduce((n, t) => n + t.costUsd, 0);
    const lines = [
      `# ${s.id}: ${s.title}`,
      "",
      `Result: ${pass ? "pass" : "fail"}`,
      "",
      "| Field | Value |",
      "| --- | --- |",
      `| Host | ${host}, headless, isolated profile |`,
      `| Plugin | vh-adlc ${plugin} at ${revision}, fixture copy pinned to the fixture docs |`,
      `| Binary | vh-adlc ${binary} through the logging wrapper |`,
      `| OS | ${process.platform} ${process.arch} |`,
      `| Date | ${date} |`,
      `| Model | ${models} |`,
      `| Turns | ${result.turns.map((t) => t.turns).join(", ") || "n/a"} |`,
      `| Cost | ${cost.toFixed(2)} USD |`,
      `| Duration | ${Math.round((Date.now() - started) / 1000)} s |`,
      `| Phase selection | ${phase === 7 ? "full v1" : `phase ${phase}; later operations pending`} |`,
      "",
      "## Checks",
      "",
      ...checks.map((c) => `- [${c.ok ? "x" : " "}] ${c.name}${c.detail && !c.ok ? `: ${c.detail.replace(/\s+/g, " ").slice(0, 600)}` : ""}`),
      "",
      "## Binary calls",
      "",
      ...(calls(f).length ? calls(f).map((x) => `- \`${x.args.replace(/--(repo|plugin-pin|docs-source) \S+/g, "--$1 <...>").slice(0, 120)}\`: ${x.json?.result ?? `exit ${x.code}`}`) : ["None."]),
      ...(result.notes?.length ? ["", "## Notes", "", ...result.notes.map((n) => `- ${n}`)] : []),
      // A failing run keeps each turn's final report, so the failure can be read without a re-run.
      ...(pass
        ? []
        : ["", "## Reports", ...result.turns.flatMap((t, i) => ["", `Turn ${i + 1}:`, "", ...redactPaths(t.result, f).slice(0, 12000).split("\n").map((l) => `> ${l}`)])]),
      "",
    ];
    const text = lines.join("\n");
    if (scanSecrets(text).length) throw new Error(`${s.id}: a secret canary reached the evidence summary`);
    writeFileSync(join(EVIDENCE, `${s.id}.md`), text);
    console.log(`${s.id} ${pass ? "PASS" : "FAIL"} (${cost.toFixed(2)} USD) ${checks.filter((c) => !c.ok).map((c) => c.name).join("; ")}`);
    const kept = SCRATCH.splice(0);
    if (pass && !process.env.VH_ADLC_KEEP) for (const dir of kept) rmSync(dir, { recursive: true, force: true });
    else console.log(`${s.id} kept ${kept.join(" ")}`);
  }
}

await main();
