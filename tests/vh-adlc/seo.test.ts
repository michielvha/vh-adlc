import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const pkg = join(root, "plugins/vh-adlc");
const raw = (path: string) => readFileSync(join(root, path), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const read = (path: string) => flat(raw(path));

// The audit-routing paragraph of plugins/vh-adlc/references/lifecycle.md at
// bda1a8771a837cb028df3cb4d125f9c7da2735ff, before the SEO sentence was added.
const AUDIT_PARAGRAPH_AT_BDA1A87 = `Audit routing requires persistent source-audit intent: a named audit mode, maintaining/reverifying
the findings ledger, an explicit full persistent source audit or selected audit-finding repair.
Explicit audit without settings gets its onboarding handoff; configuration alone never changes
another route. Dependency/bot/advisory security sweeps stay maintenance, one-off failure diagnosis
stays investigation and backlog ranking stays triage, even with audit settings. Ambiguous "audit security"
or "audit the code for security issues" needs one focused persistent/full/dependency/diagnosis scope
question before dependent work. Never silently invoke full mode. Continue independent reads while waiting.`;

const SEO_AUDIT_SENTENCE =
  "A request to audit a website's SEO or search visibility routes to `vh-adlc-seo` and is not persistent source-audit intent.";

const TERMS = [
  "SEO adapter",
  "Browser driver",
  "Coverage gap",
  "Unit permission",
  "Per-run limit",
  "Semrush target",
  "Provider-reported usage",
  "Estimated usage",
  "Historical export",
  "Helper outcome",
];

const OUTCOMES = [
  "authentication",
  "access_denied",
  "quota",
  "rate_limited",
  "report_disabled",
  "no_data",
  "transport_error",
  "provider_error",
  "busy",
  "limit",
  "price_mismatch",
  "balance_unavailable",
];

const ADAPTER_KEYS = [
  "official origin",
  "owned aliases and previous hosts",
  "separate sites",
  "target countries and languages",
  "primary journeys",
  "prior research",
  "durable findings location",
  "raw export location",
  "connected first-party sources",
  "Semrush targets",
  "Semrush route",
  "Semrush credential source",
  "Semrush unit permission",
  "authority limits",
];

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty", "twenty-one", "twenty-two", "twenty-three", "twenty-four", "twenty-five",
];

function paragraphStarting(text: string, start: string): string {
  const paragraph = text.split(/\n\s*\n/).find((part) => part.trimStart().startsWith(start));
  if (!paragraph) throw new Error(`no paragraph starting with ${start}`);
  return paragraph;
}

function section(text: string, heading: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => line.trim() === heading);
  if (at < 0) throw new Error(`no section ${heading}`);
  const level = heading.match(/^#+/)![0].length;
  const end = lines.findIndex(
    (line, index) => index > at && /^#+ /.test(line) && line.match(/^#+/)![0].length <= level,
  );
  return lines.slice(at, end < 0 ? undefined : end).join("\n");
}

function frontMatter(text: string): Record<string, string> {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("no front matter");
  return Object.fromEntries(
    match[1].split("\n").map((line) => {
      const at = line.indexOf(":");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
  );
}

describe("SEO assessment routing (AC-01)", () => {
  test("the lifecycle routes website SEO requests to vh-adlc-seo", () => {
    expect(existsSync(join(pkg, "skills/vh-adlc-seo/SKILL.md"))).toBe(true);
    const row = raw("plugins/vh-adlc/references/lifecycle.md")
      .split("\n")
      .find((line) => line.startsWith("| Website SEO"));
    expect(row).toBeDefined();
    expect(row).toContain("skills/vh-adlc-seo/SKILL.md");
  });

  test("the audit paragraph routes a website SEO audit and is otherwise unchanged", () => {
    const paragraph = flat(
      paragraphStarting(raw("plugins/vh-adlc/references/lifecycle.md"), "Audit routing requires"),
    );
    expect(paragraph).toContain(SEO_AUDIT_SENTENCE);
    expect(flat(paragraph.replace(SEO_AUDIT_SENTENCE, ""))).toBe(flat(AUDIT_PARAGRAPH_AT_BDA1A87));
  });
});

describe("SEO agent and skill entry (AC-02)", () => {
  test("the agent cannot edit files and names its skill", () => {
    const meta = frontMatter(raw("plugins/vh-adlc/agents/vh-adlc-seo.agent.md"));
    const tools = meta.tools.split(",").map((tool) => tool.trim());
    expect(tools).not.toContain("Edit");
    expect(tools).toContain("Write");
    expect(meta.description).toMatch(/Used by vh-adlc-seo\.?$/);
  });

  test("the agent forbids Semrush through anything but the helper", () => {
    const agent = read("plugins/vh-adlc/agents/vh-adlc-seo.agent.md");
    expect(agent).toContain("scripts/seo/semrush.ts");
    expect(agent).toMatch(/Semrush[^.]*only through[^.]*scripts\/seo\/semrush\.ts/);
    for (const tool of ["curl", "WebFetch", "browser", "Semrush MCP server"]) {
      expect(agent).toContain(tool);
    }
  });

  test("the skill entry cites the authority rules and the knowledge failure handling", () => {
    const entry = read("plugins/vh-adlc/skills/vh-adlc-seo/SKILL.md");
    expect(entry).toContain("references/authority.md");
    expect(entry).toContain("references/loop.md");
    expect(entry).toMatch(/knowledge failure handling/);
  });
});

describe("paid API authority and the SEO procedure (AC-07)", () => {
  test("the authority table has the paid-API-unit row", () => {
    const row = raw("plugins/vh-adlc/references/authority.md")
      .split("\n")
      .find((line) => line.startsWith("| Spend a paid SEO provider's API units"));
    expect(row).toBeDefined();
    const text = flat(row!);
    expect(text).toContain("the owner's current request");
    expect(text).toContain("refs/remotes/origin/HEAD");
    expect(text).toContain("last fetched");
    expect(text).toMatch(/number the request states, else the committed limit, else 500 units/);
    expect(text).toContain("A permission without a limit grants nothing");
    expect(text).toMatch(/Buying units, plans or accounts needs separate approval/);
  });

  test("seo.md states every named rule", () => {
    const seo = read("plugins/vh-adlc/references/seo.md");
    for (const key of ADAPTER_KEYS) expect(seo).toContain(key);
    expect(seo).toContain("refs/remotes/origin/HEAD");
    expect(seo).toContain("last fetched");
    expect(seo).toMatch(/never inferred/);
    expect(seo).toContain(
      "Never paste credentials into prompts, reports or exports. A paid provider with a packaged helper is called only through that helper, which reads the key itself, keeps it out of the agent's context and saves requests redacted.",
    );
    expect(seo).toContain(
      "Never read, print or copy the Semrush credential file or variable; pass only its path or name to the helper.",
    );
    expect(seo).toMatch(/provider-reported/);
    expect(seo).toMatch(/estimate[^.]*dated prices/);
    expect(seo).toMatch(/one row first|one-row report first|first request[^.]*one row/i);
    expect(seo).toMatch(/Semrush[^.]*only through[^.]*scripts\/seo\/semrush\.ts/);
    expect(seo).not.toContain("local credential/client or a connected tool");
  });

  test("seo.md defines every Terminology term and helper outcome", () => {
    const seo = raw("plugins/vh-adlc/references/seo.md");
    const entries = seo.split("\n").filter((line) => line.startsWith("| "));
    for (const term of TERMS) {
      expect(entries.some((line) => line.toLowerCase().startsWith(`| ${term.toLowerCase()} |`))).toBe(true);
    }
    for (const outcome of OUTCOMES) {
      expect(entries.some((line) => line.startsWith(`| \`${outcome}\` |`))).toBe(true);
    }
  });

  test("the workflows SEO section and the compatibility section use the defined terms", () => {
    const workflows = flat(section(raw("docs/user-guides/workflows.md"), "## Website SEO assessment"));
    const compatibility = flat(section(raw("docs/reference/compatibility.md"), "## SEO assessment"));
    for (const term of ["coverage gap", "unit permission", "per-run limit"]) {
      expect(workflows).toContain(term);
      expect(compatibility).toContain(term);
    }
  });
});

describe("onboarding (AC-09)", () => {
  test("loop.md lists vh-adlc-seo among the operations that add no onboarding files", () => {
    const loop = read("plugins/vh-adlc/references/loop.md");
    const sentence = loop.match(/When `source` is `plugin`[^.]*\./)?.[0] ?? "";
    expect(sentence).toContain("`vh-adlc-seo`");
  });
});

describe("documentation and packaging (AC-10)", () => {
  const skillCount = readdirSync(join(pkg, "skills")).length;
  const countWord = NUMBER_WORDS[skillCount];

  test("the user guide and installation count the package's skills", () => {
    expect(read("docs/user-guides/workflows.md")).toContain(`${countWord} skills`);
    expect(read("docs/get-started/installation.md")).toMatch(new RegExp(`${countWord} skills`, "i"));
  });

  test("the compatibility record has an SEO assessment section linked from the user guide", () => {
    const compatibility = flat(section(raw("docs/reference/compatibility.md"), "## SEO assessment"));
    expect(compatibility).toMatch(/Bun on Linux or macOS/);
    const workflows = flat(section(raw("docs/user-guides/workflows.md"), "## Website SEO assessment"));
    expect(workflows).toContain("../reference/compatibility.md#seo-assessment");
  });

  test("installation states the Bun requirement and names the SEO assessor", () => {
    const installation = read("docs/get-started/installation.md");
    expect(installation).toMatch(/Semrush[^.]*vh-adlc-seo[^.]*Bun on Linux or macOS|Bun on Linux or macOS[^.]*Semrush[^.]*vh-adlc-seo/);
    expect(installation).toMatch(/feature-reviewer, prose-editor and SEO assessor definitions/);
  });

  test("both workflows tables list SEO", () => {
    const workflows = raw("docs/user-guides/workflows.md");
    const choosing = section(workflows, "## Choosing the work").split("\n").filter((l) => l.startsWith("| "));
    expect(choosing.some((line) => /website SEO/i.test(line) && line.includes("vh-adlc-seo"))).toBe(true);
    const operations = section(workflows, "## Operations").split("\n").filter((l) => l.startsWith("| "));
    expect(operations.some((line) => line.includes("`vh-adlc-seo`"))).toBe(true);
  });

  test("both manifests and the marketplace entry mention SEO assessment", () => {
    for (const path of ["plugins/vh-adlc/plugin.json", "plugins/vh-adlc/.claude-plugin/plugin.json"]) {
      expect(JSON.parse(raw(path)).description).toMatch(/SEO assessment/);
    }
    const marketplace = JSON.parse(raw(".claude-plugin/marketplace.json"));
    const entry = marketplace.plugins.find((plugin: { name: string }) => plugin.name === "vh-adlc");
    expect(entry.description).toMatch(/SEO assessment/);
  });

  test("the validation note opens with a dated historical note", () => {
    const opening = flat(raw("docs/research/seo-agent-validation-2026-10-30.md").split("\n").slice(0, 12).join("\n"));
    expect(opening).toMatch(/Historical note/);
    expect(opening).toContain("89e133d");
    expect(opening).toMatch(/Search Console, crawler and startup sections were not part of/);
  });

  test("the macOS checker job runs the Semrush helper tests", () => {
    const ci = raw(".github/workflows/ci.yml");
    const job = ci.slice(ci.indexOf("\n  checker-macos:"), ci.indexOf("\n  remote-gui:"));
    expect(job).toContain("tests/vh-adlc/seo/semrush.test.ts");
  });
});
