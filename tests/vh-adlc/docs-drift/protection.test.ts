import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureRepositoryState, captureSnapshot } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { evaluateProtection, observeFeatureFreshness } from "../../../plugins/vh-adlc/scripts/docs-drift/protection";
import { commitAll, git, populateRepository, put } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const featureTemplate = readFileSync(join(import.meta.dir, "../../../internal/testrepo/testdata/docs/conforming.md"), "utf8");

function fixture(local = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-protection-")));
  roots.push(root);
  populateRepository(root);
  git(root, "config", "init.defaultBranch", "main");
  put(root, "AGENTS.md", "Feature documents: plans/\n" + (local ? "Feature document format: local\n" : ""));
  const settings = JSON.parse(readFileSync(join(root, ".vh-adlc/docs-drift.yaml"), "utf8"));
  settings.roots = ["docs", "plans"];
  put(root, ".vh-adlc/docs-drift.yaml", JSON.stringify(settings));
  return root;
}

function feature(root: string, status = "planned", branch?: string) {
  const text = featureTemplate.replace("status: draft", "status: " + status)
    .replace("  - src/\n  - config.yml", "  - docs/guide.md")
    .replace("status_description:", (branch ? "branch: " + branch + "\n" : "") + "status_description:");
  put(root, "plans/feature.md", text);
  return text;
}

function replacement(path: string, bytes: Buffer, old: string, next: string) {
  const start = bytes.indexOf(Buffer.from(old));
  if (start < 0) throw new Error("missing fixture replacement");
  return { path, start, end: start + Buffer.byteLength(old), replacement: Buffer.from(next), before_sha256: sha256(bytes) };
}

const localCoverage = { dialect: "documentation", terminal_statuses: ["shipped"], statuses: ["planned", "active", "shipped"],
  status_aliases: { done: "shipped", working: "active" }, required_fields: ["status", "status_description", "covers", "goal"],
  acceptance_headings: ["Acceptance", "Acceptance Criteria"] };
const localRules = [
  { patterns: ["plans/README.md"], exclude_patterns: [], kind: "ordinary", editable_parts: [] },
  { patterns: ["plans/**"], exclude_patterns: ["plans/README.md"], kind: "plan", editable_parts: ["frontmatter", "acceptance-checkboxes"] },
];
const legacyPlan = "---\nstatus: done # original spelling\ngoal: 'Keep this contract'\ncovers: [docs/**]\n---\n# Older plan\n\n## Acceptance\n- [ ] Verified behavior\n### Details\n1. [ ] Nested criterion\n### Evidence\n- [ ] Historical evidence\n### More criteria\n* [X] Existing result\n```md\n- [ ] Example\n```\n## Tasks\n- [x] Delivered work\n";

function mixed(root: string, text = legacyPlan, rules: unknown = localRules, coverage: unknown = localCoverage, extra = {}) {
  put(root, "plans/README.md", "# Plans index\nOld link\n");
  put(root, "plans/older.md", text);
  put(root, "docs/docs-procedure.md", "---\ndocs_drift_protection: " + canonicalJSON({ local_documents: rules, ...extra }).toString()
    + "\ndocs_drift_local_coverage: " + canonicalJSON(coverage).toString() + "\n---\n# Project procedure\n");
  return captureSnapshot(root, commitAll(root));
}

function localReplacement(path: string, bytes: Buffer, prior: string, next: string) {
  const edit = replacement(path, bytes, prior, next);
  let prefix = 0, suffix = 0;
  while (prefix < prior.length && prefix < next.length && prior[prefix] === next[prefix]) prefix++;
  while (suffix < prior.length - prefix && suffix < next.length - prefix && prior[prior.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  return { ...edit, start: edit.start + Buffer.byteLength(prior.slice(0, prefix)),
    end: edit.end - Buffer.byteLength(prior.slice(prior.length - suffix)), replacement: Buffer.from(next.slice(prefix, next.length - suffix)) };
}

test("mixed roots classify indexes and older plans before standard metadata validation", () => {
  const root = fixture(), snapshot = mixed(root), before = captureRepositoryState(root);
  const result = evaluateProtection(root, snapshot, [replacement("plans/README.md", readFileSync(join(root, "plans/README.md")), "Old link", "Current link"),
    replacement("plans/older.md", Buffer.from(legacyPlan), "done", "shipped")]);
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.edits.every(row => row.allowed)).toBe(true);
  expect(result.edits[1].bytes?.toString()).toBe(legacyPlan.replace("done", "shipped"));
  expect(captureRepositoryState(root)).toEqual(before);
});

test.each([
  ["alias", "done", "shipped", true],
  ["unsupported status", "done", "active", false],
  ["description", "status: done # original spelling", "status: done # original spelling\nstatus_description: Verified current source", true],
  ["missing required field", "covers: [docs/**]", "covers: [docs/**]\nstatus_description: Current state", true],
  ["existing contract", "Keep this contract", "Change the contract", false],
  ["coverage repair", "docs/**", "docs/new/**", true],
  ["invalid coverage", "docs/**", "../escape/**", false],
  ["checkbox", "- [ ] Verified behavior", "- [x] Verified behavior", true],
  ["ordered nested checkbox", "1. [ ] Nested criterion", "1. [X] Nested criterion", true],
  ["criterion text", "Verified behavior", "Different criterion", false],
  ["nested evidence", "- [ ] Historical evidence", "- [x] Historical evidence", false],
  ["fenced checkbox", "- [ ] Example", "- [x] Example", false],
  ["completed task", "- [x] Delivered work", "- [ ] Delivered work", false],
  ["format churn", "goal: 'Keep this contract'", 'goal: "Keep this contract"', false],
  ["comment churn", "# original spelling", "# replacement comment", false],
] as const)("mixed legacy-plan edit boundary: %s", (_scenario, prior, next, allowed) => {
  const root = fixture(), snapshot = mixed(root);
  const result = evaluateProtection(root, snapshot, [localReplacement("plans/older.md", Buffer.from(legacyPlan), prior, next)]);
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.edits[0].allowed).toBe(allowed);
});

test.each(["planned", "shipped"])("a missing local status accepts only a canonical nonterminal addition: %s", status => {
  const root = fixture(), text = legacyPlan.replace("status: done # original spelling\n", ""), snapshot = mixed(root, text);
  const result = evaluateProtection(root, snapshot, [localReplacement("plans/older.md", Buffer.from(text), "---\n", "---\nstatus: " + status + "\n")]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(status === "planned");
});

test.each(["status", "covers", "status_description"])("adding a mechanical field still requires its explicit declaration: %s", key => {
  const root = fixture(), text = legacyPlan.replace(/^status:.*\n/mu, "").replace(/^covers:.*\n/mu, "");
  const values = { status: "planned", covers: "[docs/**]", status_description: "Source-verified state" };
  const coverage = { ...localCoverage, required_fields: localCoverage.required_fields.filter(field => field !== key) };
  const snapshot = mixed(root, text, localRules, coverage);
  const edit = localReplacement("plans/older.md", Buffer.from(text), "---\n", "---\n" + key + ": " + values[key as keyof typeof values] + "\n");
  expect(evaluateProtection(root, snapshot, [edit]).edits[0].allowed).toBe(false);
});

test.each([
  ["undeclared addition", "goal: 'Keep this contract'", "goal: 'Keep this contract'\nundeclared: value"],
  ["contract removal", "goal: 'Keep this contract'\n", ""],
  ["invalid checkbox byte", "[ ] Verified behavior", "[y] Verified behavior"],
  ["multiple checkbox bytes", "[ ] Verified behavior", "[xx] Verified behavior"],
] as const)("local plan boundary refuses %s", (_name, prior, next) => {
  const root = fixture(), snapshot = mixed(root);
  expect(evaluateProtection(root, snapshot, [localReplacement("plans/older.md", Buffer.from(legacyPlan), prior, next)]).edits[0].allowed).toBe(false);
});

test.each(["covers", "status"])("missing fields reject invalid newly inserted %s values", key => {
  const root = fixture(), text = legacyPlan.replace(/^status:.*\n/mu, "").replace(/^covers:.*\n/mu, "");
  const next = key === "covers" ? "covers: [../escape/**]\n" : "status: unknown-status\n";
  const snapshot = mixed(root, text), edit = localReplacement("plans/older.md", Buffer.from(text), "---\n", "---\n" + next);
  expect(evaluateProtection(root, snapshot, [edit]).edits[0].allowed).toBe(false);
});

test.each(["active", "done", "unrecognized"])("local branch ownership uses declared aliases and keeps unknown status active: %s", status => {
  const root = fixture(), text = legacyPlan.replace("status: done", "branch: feat/old\nstatus: " + status), snapshot = mixed(root, text);
  const edit = localReplacement("plans/older.md", Buffer.from(text), "[ ] Verified behavior", "[x] Verified behavior");
  const coordination = { coordinated: [{ feature: "plans/older.md", document: "plans/older.md", source_commit: snapshot.source_commit, selection_sha256: "a".repeat(64) },
    { feature: "plans/older.md", document: "docs/guide.md", source_commit: snapshot.source_commit, selection_sha256: "a".repeat(64) }] };
  const result = evaluateProtection(root, snapshot, [edit], coordination);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(status === "done");
  const guide = replacement("docs/guide.md", readFileSync(join(root, "docs/guide.md")), "Guide", "Current guide");
  expect(evaluateProtection(root, snapshot, [guide], coordination).edits[0].allowed).toBe(true);
  expect(evaluateProtection(root, snapshot, [guide]).edits[0].allowed).toBe(status === "done");
});

test.each(["unfenced", "fenced", "headings-only"])("shared enrollment wins over local declarations only for its unfenced canonical review header: %s", scenario => {
  const root = fixture();
  const header = "| Date | Review | Kind | Commit | Model | Isolation | Outcome |\n";
  const text = featureTemplate.replace("status: draft", "status: planned").replace("  - src/\n  - config.yml", "  - docs/guide.md").replace(header, "");
  const plan = text + (scenario === "fenced" ? "\n```md\n" + header + "```\n" : scenario === "unfenced" ? "\n" + header : "");
  const snapshot = mixed(root, plan);
  const edit = localReplacement("plans/older.md", Buffer.from(plan), "- [ ] AC-01", "- [x] AC-01");
  const result = evaluateProtection(root, snapshot, [edit]);
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.edits[0].allowed).toBe(scenario !== "unfenced");
});

test.each(["frontmatter", "checkbox"])("an ordinary row cannot unlock an unclaimed enrolled shared spec's %s", part => {
  const root = fixture(), text = featureTemplate;
  const snapshot = mixed(root, text, [{ patterns: ["plans/**"], exclude_patterns: [], kind: "ordinary", editable_parts: [] }]);
  const edit = part === "frontmatter" ? localReplacement("plans/older.md", Buffer.from(text), "status: draft", "status: planned")
    : localReplacement("plans/older.md", Buffer.from(text), "- [ ] AC-01", "- [x] AC-01");
  const result = evaluateProtection(root, snapshot, [edit]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(false);
});

test.each(["duplicate heading", "missing heading"])("ambiguous acceptance sections preserve classification and refuse their checkbox: %s", scenario => {
  const root = fixture(), text = legacyPlan + (scenario === "duplicate heading" ? "\n## Acceptance\n" : "");
  const actual = scenario === "missing heading" ? text.replace("## Acceptance", "## Other") : text;
  const snapshot = mixed(root, actual), result = evaluateProtection(root, snapshot,
    [replacement("plans/older.md", Buffer.from(actual), "[ ] Verified behavior", "[x] Verified behavior")]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(false);
});

test("one unclassified in-root document blocks every otherwise eligible edit", () => {
  const root = fixture(); mixed(root);
  put(root, "plans/unknown.md", "# Unknown file\n");
  put(root, "docs/docs-procedure.md", readFileSync(join(root, "docs/docs-procedure.md"), "utf8").replace('"exclude_patterns":["plans/README.md"]', '"exclude_patterns":["plans/README.md","plans/unknown.md"]'));
  const result = evaluateProtection(root, captureSnapshot(root, commitAll(root)), []);
  expect(result.complete).toBe(false);
  expect(result.diagnostics.some(row => row.path === "plans/unknown.md")).toBe(true);
});

test.each(["local_ranges", "document_kinds"])("active mixed-root rules refuse overlap with old digest-bound %s declarations", field => {
  const root = fixture(), document = "plans/older.md", document_sha256 = sha256(Buffer.from(legacyPlan));
  const row = field === "local_ranges" ? { document, document_sha256, ranges: [] } : { document, document_sha256, kind: "plan" };
  const result = evaluateProtection(root, mixed(root, legacyPlan, localRules, localCoverage, { [field]: [row] }), []);
  expect(result.complete).toBe(false);
  expect(result.diagnostics[0].code).toBe("project-protection");
});

test.each(["local_ranges", "document_kinds"])("excluding an in-root document preserves its old %s meaning", field => {
  const root = fixture(), document = "plans/older.md", text = legacyPlan.replace("status: done", "status: planned");
  const document_sha256 = sha256(Buffer.from(text)), start = Buffer.from(text).indexOf("Verified behavior");
  const row = field === "local_ranges" ? { document, document_sha256, ranges: [{ start, end: start + 17 }] }
    : { document, document_sha256, kind: "plan" };
  const edits = [localReplacement(document, Buffer.from(text), "Verified behavior", "Different behavior")];
  const original = evaluateProtection(root, mixed(root, text, [localRules[0]], localCoverage, { [field]: [row] }), edits);
  const excluded = [{ ...localRules[1], exclude_patterns: [...localRules[1].exclude_patterns, document] }, localRules[0]];
  const current = evaluateProtection(root, mixed(root, text, excluded, localCoverage, { [field]: [row] }), edits);
  expect(original.complete).toBe(true);
  expect(original.edits[0].reason).toBe("protected-feature-range");
  expect(current).toEqual(original);
});

test("dormant and out-of-root rules do not require new coverage or conflict with old declarations", () => {
  const root = fixture(), document = "docs/guide.md", document_sha256 = sha256(readFileSync(join(root, document)));
  const rules = [{ patterns: ["elsewhere/**", "docs/**"], exclude_patterns: [], kind: "plan", editable_parts: ["frontmatter"] }, localRules[0]];
  const snapshot = mixed(root, featureTemplate, rules, { dialect: "documentation", terminal_statuses: ["shipped"] },
    { document_kinds: [{ document, document_sha256, kind: "ordinary" }] });
  expect(evaluateProtection(root, snapshot, []).complete).toBe(true);
  put(root, "plans/elsewhere/new.md", legacyPlan);
  put(root, "docs/docs-procedure.md", readFileSync(join(root, "docs/docs-procedure.md"), "utf8").replace('"elsewhere/**"', '"plans/elsewhere/**"'));
  expect(evaluateProtection(root, captureSnapshot(root, commitAll(root)), []).complete).toBe(false);
});

test.each(["local_ranges", "local_coverage", "document_kinds", "other_writers", "local_documents"])("caller policy is refused even when empty: %s", key => {
  const root = fixture(), snapshot = captureSnapshot(root, commitAll(root));
  const result = evaluateProtection(root, snapshot, [], { [key]: [] });
  expect(result.complete).toBe(false);
  expect(result.diagnostics[0].code).toBe("project-protection");
});

test.each(["missing-field", "extra-field", "ordinary-parts", "invalid-pattern", "invalid-part", "overlap"])("new rule validation rejects malformed or conflicting declarations: %s", scenario => {
  const root = fixture(), valid = localRules[1];
  const rules: Record<string, unknown> = {
    "missing-field": [{ patterns: ["elsewhere/**"], kind: "ordinary", editable_parts: [] }],
    "extra-field": [{ ...valid, unsupported: true }], "ordinary-parts": [{ ...valid, kind: "ordinary" }],
    "invalid-pattern": [{ ...valid, patterns: ["../escape"] }], "invalid-part": [{ ...valid, editable_parts: ["all"] }],
    overlap: [...localRules, { ...valid, kind: "ordinary", editable_parts: [] }],
  };
  const result = evaluateProtection(root, mixed(root, legacyPlan, rules[scenario]), []);
  expect(result.complete).toBe(false);
  expect(result.diagnostics[0].code).toBe("project-protection");
});

test("old digest-bound kinds do not opt an older plan into mixed-root metadata classification", () => {
  const root = fixture(), document = "plans/older.md", document_sha256 = sha256(Buffer.from(legacyPlan));
  const snapshot = mixed(root, legacyPlan, [localRules[0]], localCoverage, { document_kinds: [{ document, document_sha256, kind: "plan" }] });
  expect(evaluateProtection(root, snapshot, []).complete).toBe(false);
});

test("a declared older plan without frontmatter permits only insertion of its missing mechanical fields", () => {
  const root = fixture(), text = "# Older plan\n## Acceptance\n- [ ] Verified behavior\n", snapshot = mixed(root, text);
  const inserted = "---\nstatus: planned\ngoal: Recorded intended behavior\ncovers: [docs/**]\n---\n";
  const edit = { path: "plans/older.md", start: 0, end: 0, before_sha256: sha256(Buffer.from(text)), replacement: Buffer.from(inserted) };
  const result = evaluateProtection(root, snapshot, [edit]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(true);
  expect(result.edits[0].bytes?.toString()).toBe(inserted + text);
});

test("a frontmatter-less local plan permits an independently verified acceptance checkbox", () => {
  const root = fixture(), text = "# Older plan\n## Acceptance\n- [ ] Verified behavior\n";
  const result = evaluateProtection(root, mixed(root, text), [localReplacement("plans/older.md", Buffer.from(text), "[ ]", "[x]")]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(true);
  expect(result.edits[0].bytes?.toString()).toBe(text.replace("[ ]", "[x]"));
});

test.each([false, true])("frontmatter additions cannot inject body prose: existing header %s", existing => {
  const root = fixture(), text = existing ? legacyPlan : "# Older plan\n## Acceptance\n- [ ] Verified behavior\n";
  const snapshot = mixed(root, text), bytes = Buffer.from(text);
  const start = existing ? bytes.indexOf("---\n", 4) : 0;
  const insertion = existing ? "status_description: Verified\n---\nInjected prose\n\n"
    : "---\nstatus: planned\n---\nInjected prose\n\n";
  const result = evaluateProtection(root, snapshot, [{ path: "plans/older.md", start, end: start,
    before_sha256: sha256(bytes), replacement: Buffer.from(insertion) }]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(false);
});

test.each(["Tasks\n-----", "##"])("a following Markdown section boundary protects later completed tasks: %s", boundary => {
  const root = fixture(), text = legacyPlan.replace("## Tasks", boundary);
  const result = evaluateProtection(root, mixed(root, text), [localReplacement("plans/older.md", Buffer.from(text), "[x] Delivered work", "[ ] Delivered work")]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(false);
});

test.each([false, true])("ignored rules preserve old range and coverage behavior in a local-format root %s", local => {
  const root = fixture(local), path = local ? "plans/older.md" : "docs/older.md";
  const text = "---\nstatus: shipped\nbranch: feat/older\ncovers: [docs/guide.md]\n---\n# Older plan\nOld current claim\n";
  put(root, path, text);
  const bytes = Buffer.from(text), start = bytes.indexOf("Old current claim");
  const guide = "docs/guide.md", guideBytes = readFileSync(join(root, guide));
  const policy = { document_kinds: [{ document: path, document_sha256: sha256(bytes), kind: "plan" },
    { document: guide, document_sha256: sha256(guideBytes), kind: "ordinary" }],
    local_ranges: [{ document: path, document_sha256: sha256(bytes), ranges: [{ start, end: start + 17 }] }] };
  const coverage = { dialect: "documentation", terminal_statuses: ["shipped"] };
  const edit = localReplacement(path, bytes, "Old current claim", "Current verified claim");
  const edits = [edit, localReplacement(guide, guideBytes, "Guide", "Verified guide")];
  const write = (protection: unknown, localCoverage: unknown) => put(root, "docs/docs-procedure.md", "---\ndocs_drift_protection: "
    + canonicalJSON(protection).toString() + "\ndocs_drift_local_coverage: " + canonicalJSON(localCoverage).toString() + "\n---\n# Procedure\n");
  write(policy, coverage);
  const original = evaluateProtection(root, captureSnapshot(root, commitAll(root)), edits);
  write({ ...policy, local_documents: [{ patterns: [path], exclude_patterns: [], kind: "plan", editable_parts: ["frontmatter", "acceptance-checkboxes"] }] },
    { ...coverage, statuses: ["shipped", "active"], status_aliases: { shipped: "active" }, required_fields: ["status"], acceptance_headings: ["Acceptance"] });
  const current = evaluateProtection(root, captureSnapshot(root, commitAll(root)), edits);
  expect(original.complete).toBe(true);
  expect(original.edits[0].allowed).toBe(!local);
  expect(original.edits[1].allowed).toBe(true);
  expect(original.edits[1].affected_features).toEqual(local ? [{ path, claimed: true, historical: true }] : []);
  expect(current).toEqual(original);
});

test("acceptance-looking text inside a frontmatter block scalar grants no checkbox edit", () => {
  const root = fixture(), text = legacyPlan.replace("goal: 'Keep this contract'", "goal: |\n  ## Acceptance\n  - [ ] Contract example");
  const snapshot = mixed(root, text), result = evaluateProtection(root, snapshot,
    [localReplacement("plans/older.md", Buffer.from(text), "[ ] Contract example", "[x] Contract example")]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(false);
});

test.each([
  ["plain apostrophe", "Don't publish old behavior # retain this comment", "Don't publish verified behavior # retain this comment", true],
  ["plain comment removal", "Don't publish old behavior # retain this comment", "Don't publish verified behavior", false],
  ["quoted hash", '"Old behavior #1" # retain this comment', '"Verified behavior #2" # retain this comment', true],
  ["block scalar", "|\n  # Old behavior\n  More detail", "|\n  # Verified behavior\n  More detail", true],
] as const)("selected description edits distinguish values and preserved YAML comments: %s", (_name, prior, next, allowed) => {
  const root = fixture(), text = legacyPlan.replace("goal:", "status_description: " + prior + "\ngoal:");
  const result = evaluateProtection(root, mixed(root, text), [localReplacement("plans/older.md", Buffer.from(text), prior, next)]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(allowed);
});

test("local-format roots ignore new rule matches and added aliases while retaining old declarations", () => {
  const root = fixture(true), document = "plans/older.md", text = legacyPlan.replace("goal:", "branch: feat/older\ngoal:");
  const guide = "docs/guide.md", guideBytes = readFileSync(join(root, guide));
  mixed(root, text, localRules, { ...localCoverage, terminal_statuses: ["done"], status_aliases: { done: "active" } },
    { document_kinds: [{ document, document_sha256: sha256(Buffer.from(text)), kind: "plan" },
      { document: guide, document_sha256: sha256(guideBytes), kind: "ordinary" }] });
  put(root, "plans/README.md", "---\ntype: guide\n---\n# Existing local index\n");
  const snapshot = captureSnapshot(root, commitAll(root));
  const result = evaluateProtection(root, snapshot, [localReplacement(document, Buffer.from(text), "done", "active"),
    localReplacement(guide, guideBytes, "Guide", "Verified guide")]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(false);
  expect(result.edits[1].allowed).toBe(true);
  expect(result.edits[1].affected_features).toEqual([{ path: document, claimed: true, historical: true }]);
});

test("standard normative content, metadata and historical proof remain byte-preserved", () => {
  const root = fixture();
  const text = feature(root) + "\n### R-1\n\nFINDING: old-path/example.ts:9\n";
  put(root, "plans/feature.md", text);
  const commit = commitAll(root);
  const snapshot = captureSnapshot(root, commit);
  const bytes = Buffer.from(text);
  const edits = [
    replacement("plans/feature.md", bytes, "The design.", "A different design."),
    replacement("plans/feature.md", bytes, "docs/guide.md", "docs/new.md"),
    replacement("plans/feature.md", bytes, "old-path/example.ts", "new-path/example.ts"),
    replacement("plans/feature.md", bytes, "Why the fixture exists.", "Different provenance."),
    replacement("plans/feature.md", bytes, "the failing test", "rewritten historical task"),
  ];
  const before = captureRepositoryState(root);
  const result = evaluateProtection(root, snapshot, edits);
  expect(result.complete).toBe(true);
  expect(result.edits.every(edit => !edit.allowed)).toBe(true);
  expect(captureRepositoryState(root)).toEqual(before);
});

test("a claimed feature is wholly report-only, including its ordinary introduction", () => {
  const root = fixture();
  const text = feature(root, "in-progress", "feat/claimed");
  const snapshot = captureSnapshot(root, commitAll(root));
  const edit = replacement("plans/feature.md", Buffer.from(text), "A fixture feature document.", "An updated introduction.");
  const result = evaluateProtection(root, snapshot, [edit]);
  expect(result.edits[0].allowed).toBe(false);
  expect(result.edits[0].reason).toBe("claimed-feature");
});

test("active coverage needs exact coordinated selection while historical coverage is reported", () => {
  for (const status of ["in-progress", "complete"]) {
    const root = fixture();
    feature(root, status, "feat/feature");
    const snapshot = captureSnapshot(root, commitAll(root));
    const bytes = readFileSync(join(root, "docs/guide.md"));
    const edit = replacement("docs/guide.md", bytes, "Guide", "Updated guide");
    const result = evaluateProtection(root, snapshot, [edit]);
    expect(result.edits[0].allowed).toBe(status === "complete");
    expect(result.edits[0].affected_features[0].historical).toBe(status === "complete");
    const selected = evaluateProtection(root, snapshot, [edit], { coordinated: [{ feature: "plans/feature.md", document: "docs/guide.md", source_commit: snapshot.source_commit, selection_sha256: "a".repeat(64) }] });
    expect(selected.edits[0].allowed).toBe(true);
  }
});

test.each(["in-progress", "complete"])("nested double-star coverage classifies ownership for a %s feature", status => {
  const root = fixture();
  const text = feature(root, status, "feat/nested-guide").replace("  - docs/guide.md", "  - docs/**");
  put(root, "plans/feature.md", text);
  const path = "docs/nested/guide.md";
  put(root, path, "# Nested guide\n");
  const snapshot = captureSnapshot(root, commitAll(root));
  const before = captureRepositoryState(root);
  const edit = replacement(path, readFileSync(join(root, path)), "Nested guide", "Updated nested guide");

  const result = evaluateProtection(root, snapshot, [edit]);
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.edits[0].allowed).toBe(status === "complete");
  expect(result.edits[0].affected_features).toEqual([
    { path: "plans/feature.md", historical: status === "complete", claimed: true },
  ]);
  const coordinated = evaluateProtection(root, snapshot, [edit], {
    coordinated: [{ feature: "plans/feature.md", document: path, source_commit: snapshot.source_commit, selection_sha256: "a".repeat(64) }],
  });
  expect(coordinated.complete).toBe(true);
  expect(coordinated.edits[0].allowed).toBe(true);
  expect(captureRepositoryState(root)).toEqual(before);
});

test("local plans allow only explicitly classified ranges from the retained procedure", () => {
  const root = fixture(true);
  const text = "---\nstatus: planned\n---\n# Local plan\n\n## Current behavior\nOld path.\n\n## Recorded proof\nold/proof.ts:7\n";
  const procedure = "# Project procedure\nOnly Current behavior is editable. Recorded proof is historical.\n";
  put(root, "plans/feature.md", text);
  put(root, "docs/docs-procedure.md", procedure);
  const snapshot = captureSnapshot(root, commitAll(root));
  const bytes = Buffer.from(text);
  const edit = replacement("plans/feature.md", bytes, "Old path.", "Current path.");
  expect(evaluateProtection(root, snapshot, [edit]).edits[0].allowed).toBe(false);
  const start = bytes.indexOf(Buffer.from("Old path."));
  const context = { local_ranges: [{
    document: "plans/feature.md", document_sha256: sha256(bytes), procedure_sha256: sha256(Buffer.from(procedure)),
    procedure_quote: { start: 0, end: Buffer.byteLength(procedure), sha256: sha256(Buffer.from(procedure)) },
    ranges: [{ start, end: start + Buffer.byteLength("Old path.") }],
  }] };
  put(root, "docs/docs-procedure.md", "---\ndocs_drift_protection: " + canonicalJSON({ local_ranges: context.local_ranges.map(({ document, document_sha256, ranges }) => ({ document, document_sha256, ranges })) }).toString() + "\n---\n" + procedure);
  const committed = captureSnapshot(root, commitAll(root));
  expect(evaluateProtection(root, committed, [edit]).edits[0].allowed).toBe(true);
  const structural = { ...edit, replacement: Buffer.from("Current path.\n\n## Recorded proof\nShadow proof.") };
  expect(evaluateProtection(root, committed, [structural]).edits[0].allowed).toBe(false);
  const historical = replacement("plans/feature.md", bytes, "old/proof.ts", "new/proof.ts");
  expect(evaluateProtection(root, committed, [historical]).edits[0].allowed).toBe(false);
});

test("unclaimed introductions remain eligible while malformed byte ranges block the selected batch", () => {
  const root = fixture();
  const text = feature(root, "draft");
  put(root, "docs/unicode.md", "é is a character.\n");
  const snapshot = captureSnapshot(root, commitAll(root));
  const intro = replacement("plans/feature.md", Buffer.from(text), "A fixture feature document.", "An updated feature introduction.");
  const allowed = evaluateProtection(root, snapshot, [intro]);
  expect(allowed.edits[0].allowed).toBe(true);
  expect(allowed.edits[0].bytes?.toString()).toContain("An updated feature introduction.");
  const unicode = readFileSync(join(root, "docs/unicode.md"));
  const malformed = { path: "docs/unicode.md", start: 1, end: 2, replacement: Buffer.from("x"), before_sha256: sha256(unicode) };
  const blocked = evaluateProtection(root, snapshot, [intro, malformed]);
  expect(blocked.complete).toBe(false);
  expect(blocked.edits.every(edit => !edit.allowed && edit.bytes === null)).toBe(true);
});

test("documented local coverage preserves its own dialect and terminal status", () => {
  const root = fixture(true);
  const procedure = "Coverage uses documentation patterns. shipped is a terminal local status.\n";
  put(root, "docs/docs-procedure.md", procedure);
  put(root, "plans/feature.md", "---\nstatus: shipped\nbranch: feature/old\ncovers: [docs/**]\n---\n# Local feature\n");
  const snapshot = captureSnapshot(root, commitAll(root));
  const bytes = readFileSync(join(root, "docs/guide.md"));
  const edit = replacement("docs/guide.md", bytes, "Guide", "Updated guide");
  expect(evaluateProtection(root, snapshot, [edit]).complete).toBe(false);
  const context = {
    document_kinds: [{ document: "docs/guide.md", document_sha256: sha256(bytes), kind: "ordinary" as const }],
    local_coverage: {
      dialect: "documentation" as const, terminal_statuses: ["shipped"], procedure_sha256: sha256(Buffer.from(procedure)),
      procedure_quote: { start: 0, end: Buffer.byteLength(procedure), sha256: sha256(Buffer.from(procedure)) },
    },
  };
  put(root, "docs/docs-procedure.md", "---\ndocs_drift_protection: " + canonicalJSON({ document_kinds: context.document_kinds }).toString()
    + "\ndocs_drift_local_coverage: " + canonicalJSON({ dialect: "documentation", terminal_statuses: ["shipped"], statuses: null, status_aliases: { shipped: "active" }, required_fields: false, acceptance_headings: 9 }).toString() + "\n---\n" + procedure);
  const result = evaluateProtection(root, captureSnapshot(root, commitAll(root)), [edit]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(true);
  expect(result.edits[0].affected_features[0].historical).toBe(true);
});

test("another current writer retains the proposal until exact coordinated selection", () => {
  const root = fixture();
  const bytes = readFileSync(join(root, "docs/guide.md"));
  const edit = replacement("docs/guide.md", bytes, "Guide", "Updated guide");
  const other_writers = [{ writer: "docs-agent", document: "docs/guide.md", document_sha256: sha256(bytes) }];
  put(root, "docs/docs-procedure.md", "---\ndocs_drift_protection: " + canonicalJSON({ other_writers }).toString() + "\n---\n# Procedure\n");
  const snapshot = captureSnapshot(root, commitAll(root));
  expect(evaluateProtection(root, snapshot, [edit]).edits[0].allowed).toBe(false);
  const result = evaluateProtection(root, snapshot, [edit], { coordinated: [{
    writer: "docs-agent", document: "docs/guide.md", source_commit: snapshot.source_commit, selection_sha256: "b".repeat(64),
  }] });
  expect(result.edits[0].allowed).toBe(true);
});

test("any committed roots gap blocks every edit and dirty policy cannot substitute", () => {
  const root = fixture();
  put(root, "AGENTS.md", "Feature documents: private-plans/\nDocumentation impact roots: [missing]\n");
  const snapshot = captureSnapshot(root, commitAll(root));
  put(root, "AGENTS.md", "Feature documents: plans/\n");
  const bytes = readFileSync(join(root, "docs/guide.md"));
  const result = evaluateProtection(root, snapshot, [replacement("docs/guide.md", bytes, "Guide", "Updated guide")]);
  expect(result.complete).toBe(false);
  expect(result.edits[0].allowed).toBe(false);
  expect(result.diagnostics.length).toBeGreaterThan(0);
});

test("actual binary freshness observes the resulting guide change without altering feature status", () => {
  const root = fixture();
  const text = feature(root, "draft");
  const reviewed = commitAll(root);
  put(root, "plans/feature.md", text + `| 2026-11-06 | R-1 | implementation | \`${reviewed}\` | fixture | procedural | Synthetic review. |\n\n### R-1\n\nCRITERION: AC-01 The first end state, wrapped onto a second line.\nVERDICT: met\nEVIDENCE: synthetic fixture\n\nCRITERION: AC-02 The second end state.\nVERDICT: met\nEVIDENCE: synthetic fixture\n`);
  commitAll(root);
  const before = observeFeatureFreshness(root, "plans/feature.md");
  expect(before.implementation_review.stale, JSON.stringify(before)).toBe(false);
  put(root, "docs/guide.md", "# Updated guide\n");
  const dirty = observeFeatureFreshness(root, "plans/feature.md");
  expect(dirty.feature_tree.clean).toBe(false);
  expect(dirty.feature_tree.paths).toContain("docs/guide.md");
  commitAll(root);
  expect(observeFeatureFreshness(root, "plans/feature.md").implementation_review.stale).toBe(true);
  expect(readFileSync(join(root, "plans/feature.md"), "utf8")).toContain("status: draft");
});

test("freshness refuses excluded dirty root policy before invoking its working-tree resolver", () => {
  const root = fixture();
  feature(root, "draft");
  commitAll(root);
  put(root, "AGENTS.md", "Feature documents: plans/\n# Another writer's uncommitted policy\n");
  expect(() => observeFeatureFreshness(root, "plans/feature.md")).toThrow();
});


test("explicit ordinary file creation deletion and mode changes retain their exact eligibility", () => {
  const root = fixture(), snapshot = captureSnapshot(root, commitAll(root));
  const blob = snapshot.blobs.find(blob => blob.path === "docs/guide.md");
  if (!blob) throw Error("missing guide fixture");
  const edits = [
    { action: "create" as const, path: "docs/new-guide.md", start: 0, end: 0,
      before_sha256: null, replacement: Buffer.from("# New guide\n"), after_mode: "100644" as const },
    { action: "delete" as const, path: blob.path, start: 0, end: blob.bytes.length,
      before_sha256: sha256(blob.bytes), replacement: Buffer.alloc(0), after_mode: null },
  ];
  const result = evaluateProtection(root, snapshot, edits);
  expect(result.complete).toBe(true);
  expect(result.edits.every(edit => edit.allowed)).toBe(true);
  expect(result.edits[0].bytes).toEqual(Buffer.from("# New guide\n"));
  expect(result.edits[1].bytes).toBeNull();
  const mode = evaluateProtection(root, snapshot, [{ action: "chmod", path: blob.path, start: 0, end: 0,
    before_sha256: sha256(blob.bytes), replacement: Buffer.alloc(0), after_mode: "100755" }]);
  expect(mode.edits[0].allowed).toBe(true);
});


test("whole binary asset corrections can be assessed without decoding them as prose", () => {
  const root = fixture();
  writeFileSync(join(root, "docs/asset.bin"), Buffer.from([0, 255, 1]));
  const snapshot = captureSnapshot(root, commitAll(root));
  const asset = snapshot.blobs.find(blob => blob.path === "docs/asset.bin");
  if (!asset) throw Error("missing asset fixture");
  const result = evaluateProtection(root, snapshot, [{ path: asset.path, start: 0, end: asset.bytes.length,
    before_sha256: sha256(asset.bytes), replacement: Buffer.from([0, 255, 2]), after_mode: "100644" }]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(true);
  expect(result.edits[0].bytes).toEqual(Buffer.from([0, 255, 2]));
});


test("combined edits cannot introduce a governed heading that no individual edit contains", () => {
  const root = fixture(), text = feature(root).replace("A fixture feature document.", "xx Heading\n");
  put(root, "plans/feature.md", text);
  const snapshot = captureSnapshot(root, commitAll(root)), bytes = Buffer.from(text), start = bytes.indexOf("xx Heading");
  const edits = [
    { path: "plans/feature.md", start, end: start + 1, before_sha256: sha256(bytes), replacement: Buffer.from("#") },
    { path: "plans/feature.md", start: start + 1, end: start + 2, before_sha256: sha256(bytes), replacement: Buffer.from("#") },
  ];
  const result = evaluateProtection(root, snapshot, edits);
  expect(result.edits.every(edit => !edit.allowed)).toBe(true);
});


test("new binary assets need full-file scope and creation cannot bypass feature coverage", () => {
  const root = fixture();
  feature(root, "in-progress", "feat/claimed");
  const snapshot = captureSnapshot(root, commitAll(root));
  const create = { action: "create" as const, path: "docs/new-asset.bin", start: 0, end: 0,
    before_sha256: null, replacement: Buffer.from([0, 255, 1]), after_mode: "100644" as const };
  const result = evaluateProtection(root, snapshot, [create]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(true);
  const blocked = evaluateProtection(root, snapshot, [{ ...create, path: "plans/new-feature.md", replacement: Buffer.from("# Fake feature\n") }]);
  expect(blocked.edits[0].allowed).toBe(false);
  expect(blocked.edits[0].reason).toBe("feature-creation-requires-lifecycle");
  const source = snapshot.blobs.find(blob => blob.path === "plans/feature.md");
  if (!source) throw Error("missing feature fixture");
  const deleted = evaluateProtection(root, snapshot, [{ action: "delete", path: source.path, start: 0, end: source.bytes.length,
    before_sha256: sha256(source.bytes), replacement: Buffer.alloc(0), after_mode: null }]);
  expect(deleted.edits[0].allowed).toBe(false);
  expect(deleted.edits[0].reason).toBe("claimed-feature");
});


test("new files still respect active feature coverage and binary partial ranges stay denied", () => {
  const root = fixture();
  put(root, "plans/feature.md", feature(root, "in-progress", "feat/claimed").replace("docs/guide.md", "docs/new-asset.bin"));
  writeFileSync(join(root, "docs/old-asset.bin"), Buffer.from([0, 255, 1]));
  const snapshot = captureSnapshot(root, commitAll(root));
  const edit = { action: "create" as const, path: "docs/new-asset.bin", start: 0, end: 0,
    before_sha256: null, replacement: Buffer.from([0, 255]), after_mode: "100644" as const };
  const blocked = evaluateProtection(root, snapshot, [edit]);
  expect(blocked.edits[0].allowed).toBe(false);
  expect(blocked.edits[0].reason).toBe("active-feature-overlap");
  const coordinated = evaluateProtection(root, snapshot, [edit], { coordinated: [{ feature: "plans/feature.md", document: edit.path,
    source_commit: snapshot.source_commit, selection_sha256: "a".repeat(64) }] });
  expect(coordinated.edits[0].allowed).toBe(true);
  const blob = snapshot.blobs.find(blob => blob.path === "docs/old-asset.bin");
  if (!blob) throw Error("missing asset fixture");
  const partial = evaluateProtection(root, snapshot, [{ path: blob.path, start: 1, end: 2,
    before_sha256: sha256(blob.bytes), replacement: Buffer.from([1]) }]);
  expect(partial.complete).toBe(false);
  expect(partial.edits[0].allowed).toBe(false);
});
