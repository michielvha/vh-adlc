// Runs the review convergence reviewer and author trials (docs/specs/spec-review-convergence.md, T4 and T5)
// as headless Claude Code sessions, each in its own isolated profile, and keeps every raw transcript.
//
// Usage: bun tests/vh-adlc/evidence/review-convergence/trials/run.ts <output dir> [trial ...]
//
// With no trial named, every trial runs. Each reviewer trial is one session told to follow the reviewer agent
// in this checkout; each author trial is a session told to follow the spec skill in this checkout, resumed
// with the trial owner's scripted answer when it raised an Open Question. Not part of `bun test`: every
// session costs model usage. The output directory gets, per trial, the session results, the raw transcript
// files, the repository history for author trials, and manifest.json with the checkout commit, the agent
// and skill blob hashes the sessions read, the model each turn reported and each transcript's sha256.

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { claude, profile, type Profile, type Turn } from "../../../scenarios/host.ts";

const ROOT = resolve(import.meta.dir, "../../../../..");
const HERE = import.meta.dir;
const PLUGIN = join(ROOT, "plugins", "vh-adlc");
const AGENT = join(PLUGIN, "agents", "vh-adlc-reviewer.agent.md");
const SKILL = join(PLUGIN, "skills", "vh-adlc-spec", "SKILL.md");
const PIN = "1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff";
const BINARY = process.env.VH_ADLC_BINARY ?? "/usr/local/bin/vh-adlc";
const MODEL = process.env.VH_ADLC_TRIAL_MODEL ?? "claude-opus-5-5";
const DOCS_CACHE = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "vh-adlc", "docs", PIN);

type Repo = { name: string; repo: string; commit: string };
type Trial = { name: string; kind: "reviewer" | "author"; repo: Repo; prompts: (r: Repo) => string[] };

function sh(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString();
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function build(script: string, out: string): Repo[] {
  return sh(HERE, "python3", "-I", join(HERE, script), out)
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Repo);
}

const DOCS = `the docs pages are cached under ~/.cache/vh-adlc/docs/${PIN}/`;
const AUTHOR_SETUP = `Follow the spec skill at ${SKILL} (read it first; the plugin directory for its \`references/\` paths is ${PLUGIN}). Use the binary ${BINARY} with \`--plugin-pin ${PIN}\`; ${DOCS}.`;

function reviewerPrompt(r: Repo, lens = ""): string {
  return `Follow the canonical reviewer instructions at ${AGENT} (read that file first and follow its body exactly).

Dispatch:
- Repository directory: ${r.repo}
- Document path: docs/specs/feature.md
- Commit: ${r.commit}
- Review kind: spec
- Resolved vhco-pro/docs revision: ${PIN} (cached pages under ~/.cache/vh-adlc/docs/${PIN}/)
- Verified vh-adlc binary: ${BINARY}
- Plugin pin: ${PIN}${lens}

Read only: change no file and make no commit. Return the MODEL line and then only records in the standard's formats.`;
}

const LENS = `
- Declared lenses (from the repository's loop settings): name \`spelling\`, check "Flag every misspelled English word in the document's prose", severity \`should-fix\`.`;

const RULES_STOP = `Trial rules, which override the skill where they conflict: work only inside that repository; never push or touch any other repository; do not dispatch a reviewer or start another pass. There is no question tool: when the step has you raise Open Questions for the owner, write them into the document, commit that if the skill says to, and then stop and report. The owner will answer in a follow-up message; only then continue.`;

function authorReviewPrompt(r: Repo): string {
  return `You are the author in a vh-adlc test trial. ${AUTHOR_SETUP}

Repository: ${r.repo} (branch main, local only). The feature document is docs/specs/feature.md. Spec review R-1 has already run and its records are stored at HEAD (${r.commit.slice(0, 7)}). Continue from review mode step 4: apply R-1's findings as that step says.

${RULES_STOP}

Report: each commit you made (hash and subject), what you changed, and the behaviors and checks you walked.`;
}

const AC07 = (r: Repo) => [
  `You are the author in a vh-adlc test trial. Follow the spec skill at ${SKILL}, author mode, exactly as written (read it first; the plugin directory for its \`references/\` paths is ${PLUGIN}). Use the binary ${BINARY} with \`--plugin-pin ${PIN}\`; ${DOCS}.

Repository: ${r.repo} (branch main, local only; it has no remote).

The owner's request: "deploy.sh posts a short message to the team's chat webhook, a remote HTTPS service, after each deploy. Write the feature document as a draft; do not ask for a review."

Trial rules, which override the skill where they conflict: work only inside that repository; never push or touch any other repository; do not dispatch a reviewer; there is no owner to ask, so write every judgement call into Open Questions in the standard's decision shape instead of using a question tool, and leave them unanswered; create no issue (use \`issue: null\`). Commit the document on main when done.

Report: the commit you made, and quote the Design paragraph(s) and Open Questions that cover what happens under concurrent requests, partial failure, retry or replay, and upgrade or rollback.`,
];

// The trial owner's answers, sent only when the first turn left an Open Question in the document.
const ANSWERS: Record<string, string> = {
  "author-ac03":
    "The trial's owner answers your Open Question: use 4 attempts as the limit; the owner accepts it on their own knowledge of the mirror, without the measurement. Fold this answer in now as review mode step 4 says, as one revision in one commit on main, removing the question. Same trial rules as before. Report the commit hash and quote every place in the document that now states the limit.",
  "author-ac09-judgement":
    "The trial's owner answers your Open Question: a timeout exits 2, as Design says now. Apply the factual findings and this answer now as one revision in one commit on main, removing the question. Same trial rules as before. Report the commit hash and whether `tests/check-timeout.sh` still passes.",
};

// openQuestions says whether any feature document under the repository's docs/ has an Open Question; an
// author drafting a new feature chooses its own path.
function openQuestions(repo: string): boolean {
  const docs: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name.endsWith(".md")) docs.push(join(dir, e.name));
    }
  };
  walk(join(repo, "docs"));
  return docs.some((path) => {
    const section = readFileSync(path, "utf8").split(/^## Open Questions$/m)[1]?.split(/^## /m)[0] ?? "";
    return /^### Q\d+/m.test(section);
  });
}

function transcripts(p: Profile, dest: string): { file: string; sha256: string }[] {
  const files: { file: string; sha256: string }[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (e.name.endsWith(".jsonl")) {
        const to = join(dest, e.name);
        cpSync(path, to);
        files.push({ file: to, sha256: sha256(to) });
      }
    }
  };
  walk(join(p.config, "projects"));
  return files;
}

async function main() {
  const [outArg, ...only] = process.argv.slice(2);
  if (!outArg) throw new Error("usage: run.ts <output dir> [trial ...]");
  if (!existsSync(DOCS_CACHE)) throw new Error(`no docs cache at ${DOCS_CACHE}; run \`vh-adlc knowledge\` first`);
  const out = resolve(outArg);
  mkdirSync(out, { recursive: true });

  const home = join(out, "home");
  mkdirSync(join(home, ".cache", "vh-adlc", "docs"), { recursive: true });
  cpSync(DOCS_CACHE, join(home, ".cache", "vh-adlc", "docs", PIN), { recursive: true });
  writeFileSync(join(home, ".gitconfig"), "[user]\n\tname = Trial Author\n\temail = trial@example.invalid\n[init]\n\tdefaultBranch = main\n");

  const reviewers = build("build.py", join(out, "repos"));
  const authors = build("build_authors.py", join(out, "authors"));
  const repo = (list: Repo[], name: string) => {
    const r = list.find((x) => x.name === name);
    if (!r) throw new Error(`no trial repository ${name}`);
    return r;
  };

  const trials: Trial[] = [
    ...reviewers.map((r) => ({
      name: r.name,
      kind: "reviewer" as const,
      repo: r,
      prompts: (x: Repo) => [reviewerPrompt(x, r.name === "ac02-lens" ? LENS : "")],
    })),
    { name: "author-ac07", kind: "author", repo: repo(authors, "author-ac07"), prompts: AC07 },
    ...["author-ac03", "author-ac09", "author-ac09-judgement"].map((name) => ({
      name,
      kind: "author" as const,
      repo: repo(authors, name),
      prompts: (x: Repo) => [authorReviewPrompt(x)],
    })),
  ].filter((t) => only.length === 0 || only.includes(t.name));

  const checkout = sh(ROOT, "git", "rev-parse", "HEAD").trim();
  const dirty = sh(ROOT, "git", "status", "--porcelain", "--", relative(ROOT, PLUGIN)).trim() !== "";
  const manifest: Record<string, unknown>[] = [];

  for (const t of trials) {
    const dir = join(out, "trials", t.name);
    mkdirSync(join(dir, "transcript"), { recursive: true });
    const p = profile(home);
    const turns: Turn[] = [];
    try {
      const [first] = t.prompts(t.repo);
      turns.push(claude(p, first, { cwd: t.repo.repo, model: MODEL }));
      const answer = ANSWERS[t.name];
      if (answer && !turns[0].isError && openQuestions(t.repo.repo)) {
        turns.push(claude(p, answer, { cwd: t.repo.repo, model: MODEL, resume: turns[0].sessionId }));
      }
      const files = transcripts(p, join(dir, "transcript"));
      writeFileSync(join(dir, "result.txt"), turns.map((x, i) => `=== turn ${i + 1}\n${x.result.trim()}\n`).join("\n"));
      const entry: Record<string, unknown> = {
        trial: t.name,
        kind: t.kind,
        fixture_commit: t.repo.commit,
        turns: turns.map((x) => ({ model: x.model, error: x.isError, num_turns: x.turns })),
        transcripts: files.map((x) => ({ file: relative(out, x.file), sha256: x.sha256 })),
      };
      if (t.kind === "author") {
        writeFileSync(join(dir, "history.txt"), sh(t.repo.repo, "git", "log", "-p", "--format=commit %H%nAuthor: %an%n%n    %s%n", "HEAD"));
        if (existsSync(join(t.repo.repo, "tests", "check-timeout.sh"))) {
          const r = Bun.spawnSync(["sh", "tests/check-timeout.sh"], { cwd: t.repo.repo, stdout: "pipe", stderr: "pipe" });
          entry.check_timeout = `${r.stdout.toString().trim()} (exit ${r.exitCode})`;
        }
        entry.open_questions_left = openQuestions(t.repo.repo);
      }
      manifest.push(entry);
      console.log(`${t.name}: ${turns.map((x) => (x.isError ? "error" : x.model)).join(", ")}`);
    } catch (e) {
      manifest.push({ trial: t.name, kind: t.kind, runner_error: String(e) });
      console.log(`${t.name}: runner error: ${e}`);
    } finally {
      p.dispose();
    }
  }

  writeFileSync(
    join(out, "manifest.json"),
    `${JSON.stringify(
      {
        checkout,
        plugin_dirty: dirty,
        reviewer_agent_blob: sh(ROOT, "git", "hash-object", AGENT).trim(),
        spec_skill_blob: sh(ROOT, "git", "hash-object", SKILL).trim(),
        docs_revision: PIN,
        binary: BINARY,
        requested_model: MODEL,
        date: new Date().toISOString(),
        trials: manifest,
      },
      null,
      2,
    )}\n`,
  );
}

await main();
