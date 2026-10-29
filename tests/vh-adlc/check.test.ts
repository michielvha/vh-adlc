// The vh-adlc package checker. It reads the plugin package, the marketplace and
// the pinned vhco-pro/docs pages and fails on anything the loop spec forbids.
//
// VH_ADLC_PHASE (test-only) selects a partial run: 4, 5, 6 or 7. Operations not
// scheduled by that phase are reported as pending, never as passed. Without it
// the checker runs the full v1 selection.

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const PKG = join(ROOT, "plugins", "vh-adlc");

const SCHEDULE: Record<number, string[]> = {
  4: ["investigate", "spec", "resume"],
  5: ["tasks", "implement"],
  6: ["review"],
  7: ["ship", "triage", "maintenance"],
};
const ALL_OPERATIONS = Object.values(SCHEDULE).flat();

function selectedPhase(): number {
  const raw = process.env.VH_ADLC_PHASE;
  if (raw === undefined || raw === "") return 7;
  const n = Number(raw);
  if (![4, 5, 6, 7].includes(n)) throw new Error(`VH_ADLC_PHASE must be 4, 5, 6 or 7, not ${raw}`);
  return n;
}
const PHASE = selectedPhase();
const SCHEDULED = Object.entries(SCHEDULE)
  .filter(([phase]) => Number(phase) <= PHASE)
  .flatMap(([, ops]) => ops);
const PENDING = ALL_OPERATIONS.filter((op) => !SCHEDULED.includes(op));

// The gate each status-changing skill must name (parent spec, "Who changes status").
const GATES: Record<string, string[]> = {
  spec: ["vh-adlc gate planned", "vh-adlc gate draft"],
  implement: ["vh-adlc gate in-progress", "vh-adlc gate complete"],
  ship: ["vh-adlc gate complete"],
};

// The reviewer's allow-list is the union of Claude Code and Copilot names.
const REVIEWER_TOOLS = ["Read", "Grep", "Glob", "Bash", "read", "search", "execute"];
const EDITING_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit", "edit", "write"];

const PLATFORMS = ["darwin_amd64", "darwin_arm64", "linux_amd64", "linux_arm64"];

// Docs pages whose sentences must never appear in the package (AC-03).
const CANARY_PAGES = [
  "AGENTS.md",
  "README.md",
  "conventions/coding.md",
  "conventions/delivery.md",
  "conventions/documentation.md",
  "conventions/feature-documents.md",
  "conventions/go.md",
  "guides/feature-document-template.md",
  "guides/humanize-prose.md",
  "guides/onboard-a-repository.md",
];

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function git(...args: string[]): { ok: boolean; out: string } {
  const r = Bun.spawnSync(["git", "-C", ROOT, ...args], { stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, out: r.stdout.toString() };
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out.sort();
}

function frontmatter(text: string): Record<string, unknown> | null {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  return Bun.YAML.parse(m[1]) as Record<string, unknown>;
}

function skillPath(op: string): string {
  return join(PKG, "skills", `vh-adlc-${op}`, "SKILL.md");
}

function pin(): string {
  const text = read(join(PKG, "knowledge.md"));
  const shas = [...new Set(text.match(/\b[0-9a-f]{40}\b/g) ?? [])];
  if (shas.length !== 1) throw new Error(`knowledge.md must hold exactly one full SHA, found ${shas.length}`);
  return shas[0];
}

function cacheRoot(): string {
  if (process.platform === "darwin") return join(homedir(), "Library", "Caches");
  return process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
}

// docsPage reads a vhco-pro/docs page at the SHA from the vh-adlc cache, the
// same layout the binary uses, fetching it once when it is missing.
async function docsPage(sha: string, page: string): Promise<string> {
  const cached = join(cacheRoot(), "vh-adlc", "docs", sha, page);
  if (existsSync(cached)) return read(cached);
  const res = await fetch(`https://raw.githubusercontent.com/vhco-pro/docs/${sha}/${page}`);
  if (!res.ok) throw new Error(`vhco-pro/docs ${page} at ${sha}: HTTP ${res.status}`);
  const body = await res.text();
  mkdirSync(dirname(cached), { recursive: true });
  const tmp = `${cached}.tmp-${process.pid}`;
  writeFileSync(tmp, body);
  renameSync(tmp, cached);
  return body;
}

// normalise strips Markdown decoration so a sentence matches however it is set.
function normalise(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function canarySentences(page: string): string[] {
  const prose = page
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n\s*\n/)
    .filter((block) => !block.trimStart().startsWith("|"))
    .join("\n\n");
  return normalise(prose)
    .split(/(?<=[.!?:;])\s+/)
    .map((s) => s.replace(/[.!?:;]+$/, "").trim())
    .filter((s) => s.split(" ").length >= 8);
}

function packageFiles(): string[] {
  return walk(PKG);
}

function packageText(): string {
  return packageFiles()
    .filter((f) => !f.endsWith(".json"))
    .map(read)
    .join("\n");
}

describe(`phase selection (${PHASE === 7 ? "full v1" : `phase ${PHASE}`})`, () => {
  for (const op of PENDING) {
    test.todo(`vh-adlc-${op}: pending, scheduled after phase ${PHASE}`);
  }
});

describe("manifest and marketplace", () => {
  test("portable and Claude metadata describe one shared package", () => {
    const manifest = join(PKG, ".claude-plugin", "plugin.json");
    expect(existsSync(manifest)).toBe(true);
    const m = JSON.parse(read(manifest));
    expect(m.name).toBe("vh-adlc");
    expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof m.description).toBe("string");
    const portable = JSON.parse(read(join(PKG, "plugin.json")));
    expect(portable).toEqual({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      ...m,
    });
    const manifests = walk(ROOT)
      .filter((f) => !f.includes(`${join(ROOT, ".git")}/`) && !f.includes("/node_modules/"))
      .filter((f) => f.endsWith("/plugin.json"))
      .map((f) => relative(ROOT, f));
    expect(manifests.filter((f) => f.startsWith("plugins/vh-adlc/"))).toEqual([
      "plugins/vh-adlc/.claude-plugin/plugin.json",
      "plugins/vh-adlc/plugin.json",
    ]);
    expect(manifests.filter((f) => !f.startsWith("plugins/"))).toEqual([]);
  });

  test("native Codex marketplace points to the existing package", () => {
    const marketplace = JSON.parse(read(join(ROOT, ".agents", "plugins", "marketplace.json")));
    expect(marketplace.name).toBe("vhco-tools");
    expect(marketplace.plugins.filter((entry: { name: string }) => entry.name === "vh-adlc")).toEqual([{
      name: "vh-adlc",
      source: { source: "local", path: "./plugins/vh-adlc" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Productivity",
    }]);
    expect(existsSync(join(ROOT, ".agents", "skills"))).toBe(false);
    expect(existsSync(join(PKG, ".codex-plugin"))).toBe(false);
  });

  test("the marketplace lists vh-adlc and leaves github-app-registration unchanged", () => {
    const now = JSON.parse(read(join(ROOT, ".claude-plugin", "marketplace.json")));
    expect(now.name).toBe("vhco-tools");
    const entry = now.plugins.find((p: { name: string }) => p.name === "vh-adlc");
    expect(entry?.source).toBe("./plugins/vh-adlc");
    const base = git("show", "origin/main:.claude-plugin/marketplace.json");
    expect(base.ok).toBe(true);
    const before = JSON.parse(base.out).plugins.find((p: { name: string }) => p.name === "github-app-registration");
    const after = now.plugins.find((p: { name: string }) => p.name === "github-app-registration");
    expect(after).toEqual(before);
    const app = git("diff", "--quiet", "origin/main", "--", "plugins/github-app-registration");
    expect(app.ok).toBe(true);
  });

  test("a package change comes with a version change", () => {
    const changed = !git("diff", "--quiet", "origin/main", "--", "plugins/vh-adlc").ok;
    const untracked = git("ls-files", "--others", "--exclude-standard", "--", "plugins/vh-adlc").out.trim() !== "";
    if (!changed && !untracked) return;
    const base = git("show", "origin/main:plugins/vh-adlc/.claude-plugin/plugin.json");
    if (!base.ok) return; // the package is new on this branch
    const now = JSON.parse(read(join(PKG, ".claude-plugin", "plugin.json")));
    expect(now.version).not.toBe(JSON.parse(base.out).version);
  });
});

describe("skills", () => {
  test("every skill directory is the generic entry or one of the nine operations", () => {
    const dirs = existsSync(join(PKG, "skills")) ? readdirSync(join(PKG, "skills")).sort() : [];
    expect(dirs).toContain("vh-adlc");
    for (const d of dirs) expect(["vh-adlc",...ALL_OPERATIONS.map((op) => `vh-adlc-${op}`)]).toContain(d);
  });

  for (const op of SCHEDULED) {
    describe(`vh-adlc-${op}`, () => {
      test("exists, and its name equals its directory", () => {
        expect(existsSync(skillPath(op))).toBe(true);
        const fm = frontmatter(read(skillPath(op)));
        expect(fm?.name).toBe(`vh-adlc-${op}`);
        expect(String(fm?.name)).toStartWith("vh-adlc-");
        expect(typeof fm?.description).toBe("string");
        expect(fm).not.toHaveProperty("model");
      });

      test("names the humanize prose guide", () => {
        expect(read(skillPath(op))).toContain("guides/humanize-prose.md");
      });

      test("resolves knowledge first", () => {
        expect(read(skillPath(op))).toContain("vh-adlc knowledge");
      });

      if (GATES[op]) {
        test("names the gate for every status it changes", () => {
          const text = read(skillPath(op));
          for (const g of GATES[op]) expect(text).toContain(g);
        });
      }
    });
  }
});

describe("reviewer agent", () => {
  const path = join(PKG, "agents", "vh-adlc-reviewer.agent.md");

  test("sets its name and carries no model", () => {
    expect(existsSync(path)).toBe(true);
    const fm = frontmatter(read(path));
    expect(fm?.name).toBe("vh-adlc-reviewer");
    expect(fm).not.toHaveProperty("model");
  });

  test("allows exactly the agreed tool union and no editing tool", () => {
    const fm = frontmatter(read(path)) ?? {};
    const tools = String(fm.tools).split(",").map((t) => t.trim());
    expect([...tools].sort()).toEqual([...REVIEWER_TOOLS].sort());
    for (const t of EDITING_TOOLS) expect(tools).not.toContain(t);
  });
});

describe("review model eligibility", () => {
  const protocol = () => read(join(PKG, "references", "review-protocol.md"));

  test("uses the inherited default on every host without inventing model identity", () => {
    const text = protocol();
    expect(text).toContain("### Default review on every host");
    expect(text).toContain("do not pass a model override");
    expect(text).toContain("record `unknown`");
    expect(text).toContain("model identity was not attested");
    expect(text).not.toMatch(/`(?:fable|opus)`/);
  });

  test("keeps explicitly named models subject to identity matching", () => {
    const text = protocol();
    expect(text).toContain("### Requested model");
    expect(text).toContain("`MODEL: unknown` never matches");
    expect(text).toContain("A named model that does not match");
    expect(text).toContain("Write no Review Log row");
  });

  test("does not turn a missing header into a successful unknown-model review", () => {
    expect(protocol()).toContain("A missing or malformed `MODEL:` line leaves the review pending");
  });

  test("both review operations apply eligibility before storing records", () => {
    for (const op of ["spec", "review"]) {
      const text = read(skillPath(op));
      expect(text).toContain("model eligibility");
      expect(text).toContain("unrequested default");
      expect(text).not.toMatch(/`(?:fable|opus)`/);
    }
  });

  test("generic independent dispatch loads the same canonical reviewer contract", () => {
    const text = protocol();
    expect(text).toContain("agents/vh-adlc-reviewer.agent.md");
    expect(text).toContain("generic independent subagent");
    expect(text).toContain("Do not copy or translate");
    expect(text).toContain("leave the review visibly pending");
  });

  test("installer invocation does not depend on extracted executable bits", () => {
    const text = read(join(PKG, "references", "loop.md"));
    expect(text).toContain('VH_ADLC=$(bash "<plugin directory>/scripts/ensure-vh-adlc.sh")');
    expect(text).toContain("checksum");
  });
});

describe("package text", () => {
  test("every referenced package path exists", () => {
    const missing: string[] = [];
    for (const file of packageFiles().filter((f) => f.endsWith(".md"))) {
      const text = read(file);
      const refs = new Set<string>();
      for (const m of text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
        if (!/^[a-z]+:/i.test(m[1])) refs.add(resolve(dirname(file), m[1]));
      }
      for (const m of text.matchAll(/`((?:references|scripts|agents|skills)\/[^`\s]+|knowledge\.md|vh-adlc\.lock\.json)`/g)) {
        refs.add(join(PKG, m[1]));
      }
      for (const r of refs) if (!existsSync(r)) missing.push(`${relative(ROOT, file)} -> ${relative(ROOT, r)}`);
    }
    expect(missing).toEqual([]);
  });

  test("nothing mentions --docs-source", () => {
    const hits = packageFiles().filter((f) => read(f).includes("--docs-source"));
    expect(hits.map((f) => relative(ROOT, f))).toEqual([]);
  });

  test("no em dash or en dash", () => {
    const hits = packageFiles().filter((f) => /[–—]/.test(read(f)));
    expect(hits.map((f) => relative(ROOT, f))).toEqual([]);
  });

  test("knowledge.md holds one full-SHA docs pin", () => {
    expect(pin()).toMatch(/^[0-9a-f]{40}$/);
  });

  test("no sentence from the pinned docs pages appears in the package", async () => {
    const sha = pin();
    const text = normalise(packageText());
    const found: string[] = [];
    for (const page of CANARY_PAGES) {
      for (const s of canarySentences(await docsPage(sha, page))) {
        if (text.includes(s)) found.push(`${page}: ${s}`);
      }
    }
    expect(found).toEqual([]);
  }, 60_000);
});

describe("binary lock and installer", () => {
  const lockPath = join(PKG, "vh-adlc.lock.json");

  test("the lock has the fixed shape the installer reads", () => {
    const raw = read(lockPath);
    const lock = JSON.parse(raw);
    expect(`${JSON.stringify(lock, null, 2)}\n`).toBe(raw);
    expect(Object.keys(lock)).toEqual(["version", "assets"]);
    expect(lock.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Object.keys(lock.assets).sort()).toEqual(PLATFORMS);
    for (const p of PLATFORMS) {
      const a = lock.assets[p];
      expect(Object.keys(a)).toEqual(["name", "url", "asset_sha256", "binary_sha256"]);
      expect(a.name).toBe(`vh-adlc_${lock.version}_${p}.tar.gz`);
      expect(a.url).toBe(`https://github.com/michielvha/vh-adlc/releases/download/v${lock.version}/${a.name}`);
      expect(a.asset_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(a.binary_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("the installer is Bash with strict mode", () => {
    const script = read(join(PKG, "scripts", "ensure-vh-adlc.sh"));
    expect(script.split("\n")[0]).toBe("#!/usr/bin/env bash");
    expect(script).toContain("set -euo pipefail");
    expect(statSync(join(PKG, "scripts", "ensure-vh-adlc.sh")).mode & 0o111).not.toBe(0);
  });
});

describe("Bun runs the checker", () => {
  test("CI runs bun test tests/vh-adlc", () => {
    const ci = read(join(ROOT, ".github", "workflows", "ci.yml"));
    expect(ci).toContain("bun test tests/vh-adlc");
    expect(ci).toMatch(/oven-sh\/setup-bun@[0-9a-f]{40}/);
  });

  test("the pinned coding convention names Bun for new tooling and tests", async () => {
    const coding = await docsPage(pin(), "conventions/coding.md");
    expect(coding).toContain("New JavaScript tooling\nand tests use Bun");
    expect(coding).not.toContain("Node 24");
  });
});

describe("README", () => {
  if (PHASE < 7) {
    test.todo("install, update, uninstall and support matrix: pending until phase 7");
    return;
  }
  test("links to installation, plugin management and a support matrix", () => {
    const readme = read(join(ROOT, "README.md"));
    const guides = [
      { path: "docs/get-started/installation.md", headings: ["Install"] },
      { path: "docs/user-guides/managing-plugins.md", headings: ["Update", "Uninstall"] },
      { path: "docs/reference/compatibility.md", headings: ["Support matrix"] },
    ];
    for (const { path, headings } of guides) {
      expect(readme).toContain(`](${path})`);
      const guide = read(join(ROOT, path));
      for (const heading of headings) {
        expect(guide).toMatch(new RegExp(`^#+ .*${heading}`, "mi"));
      }
    }
  });
});
