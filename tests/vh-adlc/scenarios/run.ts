// Runs the vh-adlc scenarios headless on Claude Code and writes summaries to
// tests/vh-adlc/evidence/claude-code/. It is not part of `bun test`: every
// scenario is a real agent run.
//
// Usage: bun tests/vh-adlc/scenarios/run.ts --phase 4 [S2 S3 ...]
//
// --phase selects the operations a partial run may use; operations scheduled
// later are reported as pending. The default is the full v1 selection.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { accept, AGENT_NAME, agentHome, build, editFeature, FEATURE_PATH, type Fixtures, git, PROSE_CANARIES, SECRET_CANARIES } from "../fixtures/build";
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

function session(f: Fixtures, plugins: string[], prompts: string[]): Turn[] {
  const p = profile(f.home);
  const turns: Turn[] = [];
  try {
    for (const prompt of prompts) {
      const t = claude(p, prompt, { cwd: f.project, pluginDirs: plugins, resume: turns.at(-1)?.sessionId || undefined, maxTurns: 80 });
      turns.push(t);
      if (t.isError) break;
    }
  } finally {
    p.dispose();
  }
  return turns;
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

const SCENARIOS: Scenario[] = [
  {
    id: "S1",
    title: "Install, list, invoke the phase-4 operations, uninstall; host facts",
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
        for (const prompt of [
          "/vh-adlc-investigate Why does ./test.sh fail? Report only; change nothing.",
          "/vh-adlc-resume greeting-name",
          `/vh-adlc-spec review ${FEATURE_PATH}. If you dispatch the reviewer, say which agent name you dispatched and whether the dispatch succeeded. Do not accept anything.`,
        ]) {
          turns.push(claude(p, prompt, { cwd: f.project, maxTurns: 80 }));
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
          { name: "the three phase-4 skills and the reviewer are listed", ok: ["vh-adlc-investigate", "vh-adlc-spec", "vh-adlc-resume", "vh-adlc-reviewer"].every((s) => details.includes(s)) && listed.includes("vh-adlc@vhco-tools") },
          { name: "each operation ran without an error", ok: turns.length === 3 && turns.every((t) => !t.isError) },
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
  ...(
    [
      ["open question", (f: Fixtures) => { editFeature(f, "## Open Questions\n\nNone.\n", "## Open Questions\n\n### Q1: Should the greeting end with a full stop?\n"); accept(f); }, "no_open_questions"],
      ["missing Test Plan row", (f: Fixtures) => { editFeature(f, "| AC-01 | `./test.sh` |\n", ""); accept(f); }, "test_plan_complete"],
      ["stale review", (f: Fixtures) => { accept(f); editFeature(f, "prints `Hello, Ada.`", "prints `Hello, Ada!`"); }, "spec_review_fresh"],
      ["fresh blocking review", (f: Fixtures) => accept(f, "FINDING: F-01\nKIND: factual\nSEVERITY: blocking\nWHERE: Design\nEVIDENCE: greet.sh:2\nPROPOSAL: Say how the name is quoted."), "spec_review_clean"],
      ["malformed records", (f: Fixtures) => accept(f, "Looks good to me."), "spec_review_clean"],
      ["no acceptance", (f: Fixtures) => accept(f, "NO FINDINGS", false), "accepted", `/vh-adlc-spec I have not accepted ${FEATURE_PATH}. Move it to planned if, and only if, the gate allows it.`],
    ] as const
  ).map(([name, setup, condition, prompt], i): Scenario => ({
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
  ...(["investigate", "spec", "resume"] as const).map((op): Scenario => ({
    id: `S14.${op}`,
    title: `Binary unavailable: vh-adlc-${op}`,
    phase: 4,
    run: async (f) => {
      // A plugin copy whose lock points at a missing asset, with an empty cache.
      const broken = join(f.dir, "plugin-unavailable");
      const { cpSync } = await import("node:fs");
      cpSync(f.pluginA, broken, { recursive: true });
      const lockPath = join(broken, "vh-adlc.lock.json");
      writeFileSync(lockPath, readFileSync(lockPath, "utf8").replaceAll(/file:\/\/[^"]+/g, `file://${join(f.dir, "missing.tar.gz")}`));
      const empty = mkdtempSync(join(tmpdir(), "vh-adlc-s14-home-"));
      agentHome(empty);
      const g = { ...f, home: empty };
      accept(f);
      const prompt = {
        investigate: "/vh-adlc-investigate Why does ./test.sh fail? Report only.",
        spec: `/vh-adlc-spec The owner accepts ${FEATURE_PATH} against R-1; move it to planned.`,
        resume: "/vh-adlc-resume greeting-name",
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

function scanSecrets(text: string): string[] {
  return SECRET_CANARIES.filter((c) => text.includes(c));
}

async function main() {
  const args = process.argv.slice(2);
  const pi = args.indexOf("--phase");
  const phase = pi >= 0 ? Number(args[pi + 1]) : 7;
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
      "",
    ];
    const text = lines.join("\n");
    if (scanSecrets(text).length) throw new Error(`${s.id}: a secret canary reached the evidence summary`);
    writeFileSync(join(EVIDENCE, `${s.id}.md`), text);
    console.log(`${s.id} ${pass ? "PASS" : "FAIL"} (${cost.toFixed(2)} USD) ${checks.filter((c) => !c.ok).map((c) => c.name).join("; ")}`);
  }
}

await main();
