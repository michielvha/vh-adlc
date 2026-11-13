// Investigation defaults: write or extend a findings document, never duplicate one, keep issues as pointers.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadLoopSettings } from "../../../plugins/vh-adlc/scripts/loop/settings";
import { findingsPlan, VERDICTS, verdict } from "../../../plugins/vh-adlc/scripts/loop/investigate";

const made: string[] = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
function repo(files: Record<string, string>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-investigate-")));
  made.push(root);
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); }
  return root;
}
const settings = "schema_version: 1\nfindings_document: always\nanalysis_dir: docs/internal/analysis\n";
const covering = "---\ndescription: Why the launcher heartbeat times out under load.\n---\n\n# Launcher heartbeat timeout\n";
const issue = { number: 42, title: "Launcher heartbeat times out", body: "The heartbeat stops answering." };

describe("settings", () => {
  test("findings_document and analysis_dir are read; the default writes only on request", () => {
    expect(loadLoopSettings(repo({ ".vh-adlc/loop.yaml": settings, "docs/internal/analysis/.keep": "" }), { overridePath: null }))
      .toMatchObject({ findings_document: "always", analysis_dir: "docs/internal/analysis" });
    expect(loadLoopSettings(repo({}), { overridePath: null })).toMatchObject({ findings_document: "on_request" });
  });
});

describe("the findings plan", () => {
  const terms = ["launcher", "heartbeat", "timeout"];
  test("without a covering document or issue, it writes a new analysis document", () => {
    const root = repo({ ".vh-adlc/loop.yaml": settings, "docs/internal/analysis/other.md": "---\ndescription: Unrelated.\n---\n" });
    const plan = findingsPlan(loadLoopSettings(root, { overridePath: null }), { slug: "launcher-heartbeat-timeout", terms, issues: [] });
    expect(plan).toEqual({ document: { action: "write", path: "docs/internal/analysis/launcher-heartbeat-timeout.md" }, duplicates: [], issue: { action: "none" } });
  });

  test("with a covering document, it extends that document and creates no second one", () => {
    const root = repo({ ".vh-adlc/loop.yaml": settings, "docs/internal/analysis/heartbeat.md": covering });
    const plan = findingsPlan(loadLoopSettings(root, { overridePath: null }), { slug: "launcher-heartbeat-timeout", terms, issues: [] });
    expect(plan.document).toEqual({ action: "extend", path: "docs/internal/analysis/heartbeat.md" });
    expect(plan.duplicates).toEqual(["docs/internal/analysis/heartbeat.md"]);
    expect(readdirSync(join(root, "docs/internal/analysis"))).toEqual(["heartbeat.md"]);
  });

  test("with an existing issue and no covering document, findings go in a new document and the issue gets only a summary and a link", () => {
    const root = repo({ ".vh-adlc/loop.yaml": settings, "docs/internal/analysis/.keep": "" });
    const plan = findingsPlan(loadLoopSettings(root, { overridePath: null }), { slug: "launcher-heartbeat-timeout", terms, issues: [issue] });
    expect(plan.document).toEqual({ action: "write", path: "docs/internal/analysis/launcher-heartbeat-timeout.md" });
    expect(plan.duplicates).toEqual(["#42"]);
    expect(plan.issue).toEqual({ action: "summary-and-link", number: 42, create: false });
  });

  test("on request only, nothing is written unless the owner asked", () => {
    const root = repo({ "docs/internal/analysis/heartbeat.md": covering });
    const plan = findingsPlan(loadLoopSettings(root, { overridePath: null }), { slug: "x", terms, issues: [], requested: false });
    expect(plan.document).toEqual({ action: "none", reason: "findings_document is on_request and the owner did not ask" });
  });
});

describe("verdicts", () => {
  test("an investigation ends with one of three verdicts", () => {
    expect(VERDICTS).toEqual(["act now", "track", "reject"]);
    expect(verdict("track")).toBe("track");
    expect(() => verdict("maybe later")).toThrow("one of act now, track or reject");
  });
});
