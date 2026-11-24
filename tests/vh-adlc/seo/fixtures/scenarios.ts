// The forward scenarios of docs/specs/seo-assessment.md (Test Plan rows AC-04 to
// AC-11): each one's fixture adapter, Git refs, prompt, stub answers and expectations.
import { readFileSync } from "node:fs";
import type { Answer, Logged, StubConfig } from "./stub";

type Git = (cwd: string, ...args: string[]) => string;
type Write = (path: string, content: string) => void;
type CheckFn = (name: string, pass: boolean, detail?: string) => void;

export type Scenario = {
  browser: boolean;
  stub: StubConfig;
  earlierExport?: boolean;
  adapter: (o: { origin: string; keyFile: string; committed: boolean }) => string;
  refs?: (project: string, write: Write, git: Git) => void;
  uncommitted?: (adapter: string) => string;
  prompt: (origin: string) => string;
  expect: "none" | "limit" | "expired" | "permitted" | "counts-only";
  reportsMissingHead?: boolean;
  reportsHead?: boolean;
  route?: "mcp" | "v3";
  maxUnits?: number;
  targets?: (log: Logged[], origin: string, text: string, check: CheckFn) => void;
  startupHandoff?: boolean;
};

const TARGETS = "first-target.example, second-target.example";
const always = (answer: Answer): StubConfig => ({ answer: () => answer });

type AdapterOptions = {
  targets?: string | null;
  aliases?: string;
  route?: "mcp" | "v3";
  permission?: number | null;
};

function adapter(options: AdapterOptions) {
  return ({ origin, keyFile }: { origin: string; keyFile: string }) => {
    const lines = [
      "# SEO adapter",
      "",
      `- Official origin: ${origin}`,
      `- Owned aliases and previous hosts: ${options.aliases ?? "none"}`,
      "- Separate sites to exclude unless requested: separate.example",
      "- Target countries and languages: United States in English (Semrush database us), Germany in German (Semrush database de)",
      "- Primary journeys: home page to product page; home page to the getting-started article",
      "- Prior research to read: none",
      "- Durable findings location: reports/seo/",
      "- Raw export location: exports/seo/",
      "- Connected first-party sources: none; Search Console, Bing Webmaster Tools and Ahrefs are not connected",
    ];
    if (options.targets !== null) lines.push(`- Semrush targets: ${options.targets ?? TARGETS}`);
    if (options.route) lines.push(`- Semrush route: ${options.route}`);
    lines.push(`- Semrush credential source: the file ${keyFile}`);
    if (options.permission) lines.push(`- Semrush unit permission: allowed, with a per-run limit of ${options.permission} units`);
    lines.push(
      "- Authority limits: assessment only; never publish, commit or push",
      "",
      "## Output files",
      "",
      "Write these in the durable findings location, besides the report itself:",
      "",
      "- `report.md`: the assessment report, including owner handoff items.",
      '- `findings.json`: a JSON array, one object per finding, with `rank` (a number, 1 first), `urls` (an array of affected URLs), `impact`, `confidence`, `validation` (a concrete validation step) and `observation`.',
      '- `source-coverage.json`: a JSON array, one object per source, with `source` (for example "Public HTTP checks", "Browser checks", "Google Search Console", "Semrush"), `status` (`run`, `coverage gap` or `skipped`), `outcome` (why) and `metrics` (an object; unknown values are null).',
      '- `manifest.json`: `{ "files": [ { "path": <path relative to the repository root>, "sha256": <hex digest> } ] }` listing every file the run saved, the Semrush run directory\'s files included.',
      "",
    );
    return lines.join("\n");
  };
}

const ASSESS = (origin: string) =>
  `Use vh-adlc-seo to assess the website at ${origin} for technical search readiness, measured visibility and content opportunities. Follow agents/seo.md. Do not commit or push.`;

function addPermission(text: string, limit = 3000) {
  return text.replace("- Authority limits:", `- Semrush unit permission: allowed, with a per-run limit of ${limit} units\n- Authority limits:`);
}

function commitOnBranch(project: string, write: Write, git: Git, branch: string, change: (text: string) => string, read: () => string) {
  git(project, "switch", "-q", "-c", branch);
  write("agents/seo.md", change(read()));
  git(project, "commit", "-q", "-am", "grant Semrush units");
}

const readAdapter = (project: string) => () => readFileSync(`${project}/agents/seo.md`, "utf8");

const noPermission = (extra: Partial<Scenario>): Scenario => ({
  browser: true,
  stub: always("data"),
  adapter: adapter({ permission: null }),
  prompt: ASSESS,
  expect: "none",
  ...extra,
});

const permitted = (extra: Partial<Scenario> & { adapterOptions?: AdapterOptions }): Scenario => {
  const { adapterOptions, ...rest } = extra;
  return {
    browser: true,
    stub: always("data"),
    adapter: adapter({ permission: 600, ...adapterOptions }),
    prompt: ASSESS,
    expect: "permitted",
    route: "mcp",
    maxUnits: 600,
    ...rest,
  };
};

// The mixed no-data answers of the `permitted` scenario.
function mixedAnswers(report: string, target: string, database: string | undefined): Answer {
  if (target === "first-target.example") return "no_data";
  if (target !== "second-target.example") return "no_data";
  if (database === undefined) return "data";
  if (database === "us") return report === "domain_ranks" ? "data" : "no_data";
  return "no_data";
}

function targetRules(log: Logged[], _origin: string, text: string, check: CheckFn) {
  const reports = log.filter((r) => r.kind === "call" || r.kind === "report");
  const named = new Set(reports.map((r) => r.target));
  check("AC-05: every report names one of the two targets and both are requested", reports.every((r) => r.target === "first-target.example" || r.target === "second-target.example") && named.has("first-target.example") && named.has("second-target.example"), [...named].join(","));
  check("AC-05: no request names separate.example", !named.has("separate.example"));
  check("AC-05: the report names separate.example as refused for Semrush and says to list it as a target", /separate\.example/.test(text) && /refus/i.test(text) && /Semrush target/i.test(text));
  for (const target of ["first-target.example", "second-target.example"]) {
    const first = reports.find((r) => r.target === target);
    check(`AC-05: ${target} starts with a one-row overview naming no database`, !!first && first.report === "domain_ranks" && first.database === undefined && first.display_limit === 1, JSON.stringify(first));
  }
  check("AC-05: first-target.example gets no request after its overview", reports.filter((r) => r.target === "first-target.example").length === 1);
  check("AC-05: second-target.example gets a one-row report in each database", ["us", "de"].every((db) => reports.some((r) => r.target === "second-target.example" && r.database === db && r.display_limit === 1)));
  const seen = new Map<string, Answer | "refused" | undefined>();
  const stopped = new Map<string, Set<string>>();
  const withData = new Map<string, Set<string>>();
  const violations: string[] = [];
  for (const r of reports) {
    const combo = `${r.report}|${r.target}|${r.database ?? "*"}`;
    const dbKey = `${r.target}|${r.database ?? "*"}`;
    const allKey = `${r.target}|*`;
    const typeHadData = withData.get(dbKey)?.has(r.report ?? "") ?? false;
    if ((stopped.has(dbKey) || stopped.has(allKey)) && !typeHadData) violations.push(`after no_data: ${combo}`);
    if (!seen.has(combo) && r.display_limit !== 1) violations.push(`first request not one row: ${combo}`);
    if (seen.has(combo) && (r.display_limit ?? 0) > 1 && seen.get(combo) !== "data") violations.push(`larger pull without data: ${combo}`);
    if (!seen.has(combo) || r.answer === "data") seen.set(combo, r.answer);
    if (r.answer === "no_data") stopped.set(dbKey, new Set());
    if (r.answer === "data") withData.set(dbKey, new Set([...(withData.get(dbKey) ?? []), r.report ?? ""]));
  }
  check("AC-05: one row first, no request after no_data except a type with data there, larger pulls only after data", violations.length === 0, violations.join("; "));
}

export const scenarios: Record<string, Scenario> = {
  "no-permission": noPermission({
    uncommitted: (text) => addPermission(text),
  }),
  "no-permission-branch": noPermission({
    refs: (project, write, git) => commitOnBranch(project, write, git, "seo-units", (t) => addPermission(t), readAdapter(project)),
  }),
  "no-permission-no-head": noPermission({
    adapter: adapter({ permission: 3000 }),
    refs: (project, _write, git) => {
      git(project, "remote", "set-head", "origin", "-d");
    },
  }),
  "no-permission-in-run": noPermission({
    adapter: adapter({ permission: null }),
    refs: (project, _write, git) => {
      git(project, "remote", "set-head", "origin", "-d");
    },
    prompt: (origin) => `${ASSESS(origin)} You may spend Semrush API units in this run.`,
    reportsMissingHead: true,
  }),
  "no-permission-ahead": noPermission({
    refs: (project, write, git) => {
      write("agents/seo.md", addPermission(readAdapter(project)()));
      git(project, "commit", "-q", "-am", "grant Semrush units locally");
    },
    reportsHead: true,
  }),
  permitted: permitted({
    stub: { answer: mixedAnswers },
    prompt: (origin) =>
      `${ASSESS(origin)} Report visibility in both the us and de Semrush databases. Also get Semrush data, and no other checks, on separate.example.`,
    targets: targetRules,
    startupHandoff: true,
  }),
  "permitted-fallback": permitted({
    adapterOptions: { targets: null, aliases: "first-target.example" },
    uncommitted: (text) => text.replace("- Owned aliases and previous hosts: first-target.example", "- Owned aliases and previous hosts: first-target.example, second-target.example"),
    targets: (log, _origin, _text, check) => {
      const named = new Set(log.filter((r) => r.kind === "call" || r.kind === "report").map((r) => r.target));
      check("AC-05: fallback targets are the committed origin host and alias only", named.has("127.0.0.1") && named.has("first-target.example") && !named.has("second-target.example"), [...named].join(","));
    },
  }),
  "permitted-v3": permitted({
    adapterOptions: { route: "v3" },
    route: "v3",
  }),
  "in-run": permitted({
    adapterOptions: { permission: null },
    prompt: (origin) => `${ASSESS(origin)} You may spend Semrush API units in this run.`,
    maxUnits: 500,
    expect: "counts-only",
  }),
  "in-run-committed": permitted({
    adapterOptions: { permission: 200 },
    prompt: (origin) => `${ASSESS(origin)} You may spend Semrush API units in this run.`,
    maxUnits: 200,
    expect: "counts-only",
  }),
  "in-run-large": permitted({
    adapterOptions: { permission: 2000 },
    prompt: (origin) => `${ASSESS(origin)} You may spend Semrush API units in this run.`,
    maxUnits: 2000,
    expect: "counts-only",
  }),
  "in-run-numbered": permitted({
    adapterOptions: { permission: 200 },
    prompt: (origin) => `${ASSESS(origin)} You may spend up to 100 Semrush API units in this run.`,
    maxUnits: 100,
    expect: "counts-only",
  }),
  limited: permitted({
    adapterOptions: { permission: 5 },
    maxUnits: 5,
    expect: "limit",
  }),
  expired: permitted({
    stub: { answer: () => "data", expired: true },
    earlierExport: true,
    expect: "expired",
  }),
};
