// Runs the vh-adlc scenarios headless on Claude Code and writes summaries to
// tests/vh-adlc/evidence/claude-code/. It is not part of `bun test`: every
// scenario is a real agent run.
//
// Usage: bun tests/vh-adlc/scenarios/run.ts --phase 4 [S2 S3 ...]
//
// --phase selects the operations a partial run may use; operations scheduled
// later are reported as pending. The default is the full v1 selection.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { accept, AGENT_NAME, agentHome, build, claim, reviewFeature, editDoc, editFeature, FEATURE_BRANCH, FEATURE_PATH, FIXTURE_TASKS, type Fixtures, git, gitEnv, plan, PROSE_CANARIES, SECRET_CANARIES } from "../fixtures/build";
import { claude, cli, profile, type ToolUse, toolUses, type Turn, version } from "./host";

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
};

function session(f: Fixtures, plugins: string[], prompts: string[], o: SessionOptions = {}): Turn[] {
  const p = profile(f.home, o.settings);
  const turns: Turn[] = [];
  try {
    for (const [i, prompt] of prompts.entries()) {
      const t = claude(p, prompt, { cwd: o.cwd ?? f.project, pluginDirs: plugins, resume: turns.at(-1)?.sessionId || undefined, maxTurns: 80, model: o.model });
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
      const home = mkdtempSync(join(tmpdir(), "vh-adlc-s1-home-"));
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
                  name: "the owner was left a decision: no acceptance row, still draft, any planned gate failed",
                  ok: accepted.length === 0 && status === "draft" && gateCalls(c, "planned").every((g) => g.json?.result === "fail"),
                  detail: blocking ? "blocking finding" : "open questions",
                },
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
      const empty = mkdtempSync(join(tmpdir(), "vh-adlc-s14-home-"));
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

// passesAt runs the fixture's test suite against a ref, in a scratch copy.
function passesAt(f: Fixtures, ref: string): boolean {
  const dir = mkdtempSync(join(tmpdir(), "vh-adlc-at-"));
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
  return { name: "no prose canary or dash in the commits, the document or the reports", ok: hits.length === 0 && !dash, detail: [...hits, dash ? "dash" : ""].filter(Boolean).join("; ") };
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
    title: "Resume in a new session: handoff, then continue",
    phase: 5,
    run: async (f) => {
      plan(f);
      const owning = claim(f);
      const claimed = rev(f, "main")!;
      const lists = worktrees(f);
      const other = { head: rev(f, "HEAD", f.worktree), status: gitIn(f, f.worktree, "status", "--porcelain") };
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
            if (i === 1) beforeHandoff = agentLog(f, f.project).length;
          },
        },
      );
      return {
        turns,
        checks: (c) => {
          const work = agentLog(f, f.project, `${claimed}..${FEATURE_BRANCH}`);
          return [
            { name: "next and fresh ran in the owning worktree", ok: c.log().some((x) => words(x.args)[0] === "next") && c.log().some((x) => words(x.args)[0] === "fresh") },
            { name: "the report names the branch and the owning worktree", ok: said({ ...c, turns: [turns[0]] }, FEATURE_BRANCH) && said({ ...c, turns: [turns[0]] }, "project-greeting-name") },
            { name: "nothing was written before the handoff", ok: beforeHandoff === 0 },
            { name: "after the handoff the next task progressed on the feature branch", ok: work.length > 0 && work.every((x) => ancestor(f, x.hash, FEATURE_BRANCH)) },
            { name: "no push, merge or release", ok: rev(f, "main") === claimed && rev(f, "origin/main") === claimed && gitIn(f, f.project, "ls-remote", "--heads", "origin", FEATURE_BRANCH) === "" && (gitIn(f, f.project, "tag") ?? "") === "" },
            { name: "worktrees and the other feature are untouched", ok: worktrees(f) === lists && rev(f, "HEAD", f.worktree) === other.head && gitIn(f, f.worktree, "status", "--porcelain") === other.status },
            canaryFree(turns.map((t) => t.result)),
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

type S11 = { id: string; title: string; prompt: string; settings?: Record<string, unknown>; model?: string; noAgent?: boolean; expect: "fable" | "opus" | "sonnet" | "pending" };

const S11_CASES: S11[] = [
  { id: "S11.1", title: "Review with no model named", prompt: "", expect: "fable" },
  { id: "S11.2", title: "Review when fable is refused", prompt: "", settings: { availableModels: ["opus", "sonnet", "haiku"] }, model: "opus", expect: "opus" },
  { id: "S11.3", title: "Review with a named model", prompt: "Review it with sonnet.", expect: "sonnet" },
  { id: "S11.4", title: "Review with an unavailable named model", prompt: "Review it with claude-nonexistent-9.", expect: "pending" },
  { id: "S11.5", title: "Review when the reviewer cannot be dispatched", prompt: "", noAgent: true, expect: "pending" },
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
      return {
        turns,
        checks: (c) => {
          const doc = readFileSync(join(owning, FEATURE_PATH), "utf8");
          const rows = implementationRows(doc);
          const row = rows.at(-1);
          const commits = agentLog(f, f.project, `${target}..${FEATURE_BRANCH}`);
          const unpushed = gitIn(f, f.project, "ls-remote", "--heads", "origin", FEATURE_BRANCH) === "";
          if (k.expect === "pending") {
            return [
              { name: "no implementation review was recorded as done", ok: rows.length === 0 },
              { name: "the criteria were left as they were", ok: ["AC-01", "AC-02", "AC-03", "AC-04"].every((id) => ticked(doc, id) === ticked(before, id)) },
              { name: "the report says the review is pending and gives a handoff", ok: said(c, "pending") && said(c, "handoff") },
              { name: "nothing was pushed", ok: unpushed },
              unrelatedIntact(c),
            ];
          }
          const got = row ? records(doc, row[1]) : {};
          return [
            { name: "the reviewer ran in a separate context", ok: uses.some((u) => u.subagent) },
            { name: `the review row targets the reviewed commit and records ${k.expect}`, ok: !!row && target.startsWith(row[3].replaceAll("`", "")) && row[4].toLowerCase().includes(k.expect) },
            { name: "isolation is recorded", ok: !!row && ["structural", "procedural", "unknown"].includes(row[5]) },
            { name: "the four verdicts came back distinctly, one per criterion", ok: Object.keys(got).length === 4 && Object.entries(EXPECTED_VERDICTS).every(([id, v]) => got[id] === v), detail: JSON.stringify(got) },
            { name: "review check confirmed the stored records", ok: c.log().some((x) => words(x.args).slice(0, 2).join(" ") === "review check" && x.json?.result === "pass") },
            { name: "only the met criterion stays ticked; the others name the review", ok: ticked(doc, "AC-01") && ["AC-02", "AC-03", "AC-04"].every((id) => !ticked(doc, id) && new RegExp(`^- \\[ \\] ${id}:[^\\n]*\\n(\\s+\\S[^\\n]*\\n)*?\\s+Evidence: [^\\n]*${row?.[1]}`, "m").test(doc)) },
            ...(k.expect === "opus" ? [{ name: "the opus fallback was announced", ok: said(c, "opus") && said(c, "fable") }] : []),
            { name: "committed on the feature branch, not pushed", ok: commits.length > 0 && unpushed },
            canaryFree([...commits.map((x) => `${x.subject}\n${x.body}`), doc, ...turns.map((t) => t.result)]),
            unrelatedIntact(c),
          ];
        },
      };
    },
  }),
);
SCENARIOS.push(...PHASE6);

function scanSecrets(text: string): string[] {
  return SECRET_CANARIES.filter((c) => text.includes(c));
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
    const f = build(mkdtempSync(join(tmpdir(), `vh-adlc-${s.id}-`)));
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
      ...checks.map((c) => `- [${c.ok ? "x" : " "}] ${c.name}${c.detail && !c.ok ? `: ${c.detail.replace(/\s+/g, " ").slice(0, 200)}` : ""}`),
      "",
      "## Binary calls",
      "",
      ...(calls(f).length ? calls(f).map((x) => `- \`${x.args.replace(/--(repo|plugin-pin|docs-source) \S+/g, "--$1 <...>").slice(0, 120)}\`: ${x.json?.result ?? `exit ${x.code}`}`) : ["None."]),
      ...(result.notes?.length ? ["", "## Notes", "", ...result.notes.map((n) => `- ${n}`)] : []),
      // A failing run keeps each turn's final report, so the failure can be read without a re-run.
      ...(pass
        ? []
        : ["", "## Reports", ...result.turns.flatMap((t, i) => ["", `Turn ${i + 1}:`, "", ...redactPaths(t.result, f).slice(0, 2000).split("\n").map((l) => `> ${l}`)])]),
      "",
    ];
    const text = lines.join("\n");
    if (scanSecrets(text).length) throw new Error(`${s.id}: a secret canary reached the evidence summary`);
    writeFileSync(join(EVIDENCE, `${s.id}.md`), text);
    console.log(`${s.id} ${pass ? "PASS" : "FAIL"} (${cost.toFixed(2)} USD) ${checks.filter((c) => !c.ok).map((c) => c.name).join("; ")}`);
  }
}

await main();
