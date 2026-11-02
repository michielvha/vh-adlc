import { afterEach, expect, test } from "bun:test";
import { captureSnapshot, checkSnapshot } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { fixture, git } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
function project() { const f = fixture(); projects.push(f); return f; }
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });

test("a snapshot binds mode, selected IDs, Git source and each actual input without a repository write", () => {
  const f = project(), config = loadSettings(f.root), before = git(f.root, "status", "--porcelain");
  const snap = captureSnapshot(config, { mode: "reverify", ids: ["AUD-001"], artifact_root: f.artifacts });
  expect(snap.source.commit).toBe(git(f.root, "rev-parse", "HEAD"));
  expect(snap.source.clean).toBe(true);
  expect(snap.selected_ids).toEqual(["AUD-001"]);
  expect(snap.bindings.ledger).toHaveLength(64);
  expect(checkSnapshot(config, snap).current).toBe(true);
  expect(git(f.root, "status", "--porcelain")).toBe(before);
});

test.each(["source", "untracked", "ledger", "policy", "settings", "commit"])("material %s changes stale the old snapshot", kind => {
  const f = project(), config = loadSettings(f.root);
  const snap = captureSnapshot(config, { mode: "reverify", ids: ["AUD-001"], artifact_root: f.artifacts });
  if (kind === "source" || kind === "commit") f.write("src/app.ts", "export const answer = 43;\n");
  if (kind === "untracked") f.write("new.ts", "new untracked source\n");
  if (kind === "ledger") f.write("docs/audit.md", "# Changed ledger\n");
  if (kind === "policy") f.write("audit-project.md", "# Changed policy\n");
  if (kind === "settings") f.settings({ schema_version: 99 });
  if (kind === "commit") f.commit("test: different source");
  expect(checkSnapshot(config, snap).current).toBe(false);
});

test("unknown IDs or mode and an artifact root inside the checkout are refused", () => {
  const f = project(), config = loadSettings(f.root);
  expect(() => captureSnapshot(config, { mode: "reverify", ids: ["AUD-999"], artifact_root: f.artifacts })).toThrow();
  expect(() => captureSnapshot(config, { mode: "invalid" as never, artifact_root: f.artifacts })).toThrow();
  expect(() => captureSnapshot(config, { mode: "reverify", artifact_root: f.root })).toThrow();
});

test("missing and non-ancestor legacy history is unscoped rather than an empty delta or implicit full audit", () => {
  const f = project(), config = loadSettings(f.root), base = git(f.root, "rev-parse", "HEAD");
  git(f.root, "switch", "-qc", "other"); f.write("other.ts", "other history\n"); const other = f.commit();
  git(f.root, "switch", "-q", "main");
  const capture = (baseline: string) => captureSnapshot(config, { mode: "reverify", baseline, artifact_root: f.artifacts });
  expect(capture(base).history.status).toBe("scoped");
  expect(capture(other).history.status).toBe("unscoped");
  expect(capture("0".repeat(40)).history.status).toBe("unscoped");
  expect(capture(other).mode).toBe("reverify");
});

test("an exact detached review target can be assessed without creating a branch", () => {
  const f = project(); git(f.root, "switch", "--detach", "-q");
  const snap = captureSnapshot(loadSettings(f.root), { mode: "status", artifact_root: f.artifacts });
  expect(snap.source.branch).toBe(null);
  expect(checkSnapshot(loadSettings(f.root), snap).current).toBe(true);
});
