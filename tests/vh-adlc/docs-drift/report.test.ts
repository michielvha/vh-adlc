import { expect, test } from "bun:test";
import { attentionProjection, buildReport, correctionProjection, joinReportSentences, renderReport } from "../../../plugins/vh-adlc/scripts/docs-drift/report";
import type { AttentionInput, CorrectionInput, HistorySnapshot, ReportInput } from "../../../plugins/vh-adlc/scripts/docs-drift/report";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const digest = (text: string) => sha256(Buffer.from(text));
const repo = "example/project";
const scope = digest("scope");
function attention(): AttentionInput {
  return { repository: repo, scope_sha256: scope, identity: "claims:docs/guide.md:one", disposition: "unknown", reason: "source verification pending", owner_action: "choose the documented behavior", rule: { detector: "claims", selector: ["docs"], options: { threshold: 2 } }, inputs: { "blob:docs/guide.md": digest("guide"), "absent:docs/new.md": null, "feedback:skip": digest("feedback"), "history:guide": digest("history"), "unrelated:file": digest("other") }, required_inputs: ["blob:docs/guide.md", "absent:docs/new.md", "feedback:skip", "history:guide"], title: "Check the behavior", links: [] };
}
function correction(): CorrectionInput {
  return { repository: repo, scope_sha256: scope, identity: "fix:guide", path: "docs/guide.md", patch_sha256: digest("patch"), postimage_sha256: digest("postimage"), verification_sha256: digest("verification"), inputs_sha256: digest("inputs") };
}
function input(): ReportInput {
  return { repository: repo, scope_sha256: scope, run_id: "run-2", started_at: "2026-11-06T10:00:00Z", completed_at: "2026-11-06T10:01:00Z", source_commit: "b".repeat(40), collection_complete: true, failures: [], attention: [], corrections: [], proposals: [], history: { captured_at: "2026-11-06T10:00:00Z", records: [], diagnostics: [] }, published: [] };
}
function history(items: AttentionInput[], overrides: Record<string, unknown> = {}): HistorySnapshot {
  const record = { schema: "docs-drift-report/v1", repository: repo, scope_sha256: scope, run_id: "run-1", started_at: "2026-11-05T10:00:00Z", completed_at: "2026-11-05T10:01:00Z", collection_complete: true, failures: [], outcome: "new-attention", attention: items.map(item => ({ projection: attentionProjection(item), title: item.title, links: item.links })), ...overrides };
  const bytes = canonicalJSON(record);
  return { captured_at: "2026-11-06T10:00:00Z", records: [{ kind: "report", locator: "actions:101", bytes, sha256: sha256(bytes), expires_at: "2026-12-01T00:00:00Z" }], diagnostics: [] };
}

test("attention projection binds relevant inputs, required absence, rules, reasons and owner action", () => {
  const first = attention();
  const projection = attentionProjection(first);
  expect(projection.version).toBe(1);
  const unrelated = structuredClone(first);
  unrelated.title = "Different wording";
  unrelated.inputs["unrelated:file"] = digest("different unrelated file");
  expect(attentionProjection(unrelated)).toEqual(projection);
  for (const field of ["blob:docs/guide.md", "absent:docs/new.md", "feedback:skip", "history:guide"]) {
    const changed = structuredClone(first);
    changed.inputs[field] = digest("changed");
    expect(attentionProjection(changed).sha256).not.toBe(projection.sha256);
  }
  for (const field of ["reason", "owner_action", "identity"] as const) {
    const changed = structuredClone(first);
    changed[field] += " changed";
    expect(attentionProjection(changed).sha256).not.toBe(projection.sha256);
  }
  const rule = structuredClone(first);
  rule.rule = { detector: "different" };
  expect(attentionProjection(rule).sha256).not.toBe(projection.sha256);
  const missing = structuredClone(first);
  delete missing.inputs["absent:docs/new.md"];
  expect(() => attentionProjection(missing)).toThrow("missing required input");
});

test("unbounded dependencies conservatively bind all inputs and distinguish the binding mode", () => {
  const first = attention();
  first.required_inputs = null;
  const changed = structuredClone(first);
  changed.inputs["unrelated:file"] = digest("changed");
  expect(attentionProjection(changed).sha256).not.toBe(attentionProjection(first).sha256);
  const bounded = structuredClone(first);
  bounded.required_inputs = Object.keys(first.inputs);
  expect(attentionProjection(bounded).sha256).not.toBe(attentionProjection(first).sha256);
});

test("no-change, new and unchanged attention retain every unresolved item and evidence link", () => {
  expect(buildReport(input()).outcome).toBe("no-change");
  const current = input();
  current.attention = [attention()];
  expect(buildReport(current).outcome).toBe("new-attention");
  current.history = history(current.attention);
  const report = buildReport(current);
  expect(report.outcome).toBe("carried-attention");
  expect(report.success).toBe(true);
  expect(report.attention[0].carried_from).toEqual(["actions:101"]);
  current.attention[0].owner_action = "make another decision";
  expect(buildReport(current).outcome).toBe("new-attention");
});

test("first-red technical success carries but incomplete or failed previous runs never suppress attention", () => {
  const current = input();
  current.attention = [attention()];
  for (const overrides of [{ collection_complete: false }, { failures: [{ code: "review", message: "failed" }] }, { outcome: "failed" }, { schema: "wrong" }, { repository: "foreign/project" }, { scope_sha256: digest("foreign") }, { run_id: current.run_id }, { completed_at: current.started_at }, { started_at: "not a date" }]) {
    current.history = history(current.attention, overrides);
    const result = buildReport(current);
    expect(result.outcome).toBe("new-attention");
    expect(result.history_diagnostics.length).toBeGreaterThan(0);
  }
  current.history = history(current.attention);
  expect(buildReport(current).success).toBe(true);
});

test("expired, missing, malformed, changed and same-run history is disclosed as new attention", () => {
  const current = input();
  current.attention = [attention()];
  const valid = history(current.attention);
  const old = valid.records[0];
  for (const record of [{ ...old, sha256: digest("wrong") }, { ...old, bytes: Buffer.from("{") }, { ...old, expires_at: "2026-11-06T09:59:59Z" }]) {
    current.history = { ...valid, records: [record] };
    expect(buildReport(current).outcome).toBe("new-attention");
  }
  current.history = { ...valid, captured_at: "2026-11-06T10:00:01Z" };
  expect(() => buildReport(current)).toThrow("history snapshot");
});

test("every current technical failure wins over carried attention and completed publication stays recorded", () => {
  const current = input();
  current.attention = [attention()];
  current.history = history(current.attention);
  for (const code of ["scan", "review-should-fix", "model", "gate", "authority", "input", "lease", "publication", "recovery-pending", "artifact-upload", "cancelled", "timeout"]) {
    current.failures = [{ code, message: "Observed failure" }];
    const result = buildReport(current);
    expect(result.outcome).toBe("failed");
    expect(result.success).toBe(false);
    expect(result.failures[0].code).toBe(code);
  }
  current.failures = [];
  current.collection_complete = false;
  expect(buildReport(current).outcome).toBe("failed");
});

test("published corrections succeed and unrelated new attention still ends red", () => {
  const current = input();
  const fix = correction();
  current.corrections = [fix];
  current.published = [{ correction_sha256: correctionProjection(fix), locator: "pr:4", head: "c".repeat(40) }];
  expect(buildReport(current).outcome).toBe("published");
  current.attention = [attention()];
  const report = buildReport(current);
  expect(report.outcome).toBe("new-attention");
  expect(report.delivery).toBe("published");
  expect(report.published).toHaveLength(1);
  current.history = history(current.attention);
  expect(buildReport(current).outcome).toBe("published");
  current.published = [];
  expect(buildReport(current).outcome).toBe("failed");
});

test("carried deliveries require exact fresh bindings and current open reviewed proposal payloads", () => {
  const current = input();
  const fix = correction();
  current.corrections = [fix];
  current.proposals = [{ locator: "pr:4", state: "open", assessment: "supported", actor: "bot", head: "c".repeat(40), body_sha256: digest("body"), reviewed: { actor: "bot", head: "c".repeat(40), body_sha256: digest("body"), corrections: [correctionProjection(fix)], attention: [] }, paths: [fix.path], evidence: { receipt_sha256: digest("receipt"), inputs_sha256: digest("current evidence") } }];
  expect(buildReport(current).outcome).toBe("carried-delivery");
  expect(buildReport(current).carried_delivery[0].locator).toBe("pr:4");
  current.proposals[0].head = "d".repeat(40);
  expect(buildReport(current).outcome).toBe("new-attention");
  current.proposals[0].head = "c".repeat(40);
  current.proposals[0].state = "closed";
  expect(buildReport(current).outcome).toBe("failed");
});

test("stale or unreceipted legacy proposals need resolution even without current same-path corrections", () => {
  const current = input();
  current.proposals = [{ locator: "pr:7", state: "open", assessment: "fixed-differently", actor: "legacy-bot", head: "c".repeat(40), body_sha256: digest("body"), reviewed: null, paths: ["docs/old.md"], evidence: { receipt_sha256: null, inputs_sha256: digest("current evidence") } }];
  const first = buildReport(current);
  expect(first.outcome).toBe("new-attention");
  expect(first.attention[0].item.links).toEqual(["pr:7"]);
  const old = { ...first, run_id: "run-1", started_at: "2026-11-05T10:00:00Z", completed_at: "2026-11-05T10:01:00Z" };
  const bytes = canonicalJSON(old);
  current.history.records = [{ kind: "report", locator: "actions:102", bytes, sha256: sha256(bytes), expires_at: "2026-12-01T00:00:00Z" }];
  expect(buildReport(current).outcome).toBe("carried-attention");
});

test("mixed new and carried edits on a path never create a competing publication", () => {
  const current = input();
  const fix = correction();
  current.corrections = [fix];
  current.proposals = [{ locator: "pr:4", state: "open", assessment: "supported", actor: "bot", head: "c".repeat(40), body_sha256: digest("body"), reviewed: { actor: "bot", head: "c".repeat(40), body_sha256: digest("body"), corrections: [digest("older correction")], attention: [] }, paths: [fix.path], evidence: { receipt_sha256: digest("receipt"), inputs_sha256: digest("current evidence") } }];
  const report = buildReport(current);
  expect(report.outcome).toBe("new-attention");
  expect(report.blocked_corrections).toEqual([correctionProjection(fix)]);
  expect(report.pending_corrections).toEqual([]);
  const distinct = { ...fix, identity: "fix:other", path: "docs/other.md" };
  current.corrections.push(distinct);
  current.published = [{ correction_sha256: correctionProjection(distinct), locator: "pr:8", head: "e".repeat(40) }];
  expect(buildReport(current).delivery).toBe("published");
  expect(buildReport(current).outcome).toBe("new-attention");
});

test("concise summary lists fixes, decisions, recommendations and honest verification totals", () => {
  const current = input();
  current.attention = [attention()];
  current.history = history(current.attention);
  const rendered = renderReport(buildReport(current));
  expect(rendered).toContain("1 unresolved item");
  expect(rendered).toContain("## Fixes");
  expect(rendered).toContain("## Decisions");
  expect(rendered).toContain("## Recommendations");
  expect(rendered).toContain("choose the documented behavior");
  expect(rendered).toContain("actions:101");
  expect(rendered).not.toContain("All findings verified");
});

test("current open proposal attention matches its reviewed receipt and is never carried after body changes", () => {
  const current = input();
  current.attention = [attention()];
  current.proposals = [{ locator: "pr:4", state: "open", assessment: "supported", actor: "bot", head: "c".repeat(40), body_sha256: digest("body"), reviewed: { actor: "bot", head: "c".repeat(40), body_sha256: digest("body"), corrections: [], attention: [attentionProjection(attention())] }, paths: ["docs/guide.md"], evidence: { receipt_sha256: digest("receipt"), inputs_sha256: digest("current evidence") } }];
  expect(buildReport(current).outcome).toBe("carried-attention");
  current.proposals[0].body_sha256 = digest("edited body");
  expect(buildReport(current).outcome).toBe("new-attention");
  current.proposals[0].body_sha256 = digest("body");
  current.proposals[0].actor = "different-bot";
  expect(buildReport(current).outcome).toBe("new-attention");
});

test("reports disclose why an item has no prior match and preserve completed effects on failure", () => {
  const current = input();
  current.attention = [attention()];
  expect(buildReport(current).attention[0].match_reason).toContain("No eligible prior evidence");
  current.history = history([{ ...attention(), owner_action: "a different action" }]);
  expect(buildReport(current).attention[0].match_reason).toContain("No unchanged entry");
  const fix = correction();
  current.corrections = [fix];
  current.published = [{ correction_sha256: correctionProjection(fix), locator: "pr:4", head: "c".repeat(40) }];
  current.failures = [{ code: "artifact-upload", message: "Upload failed after publication" }];
  const report = buildReport(current);
  expect(report.outcome).toBe("failed");
  expect(report.delivery).toBe("published");
  expect(report.published).toHaveLength(1);
});

test("invalid calendar dates and duplicate identities cannot establish carried evidence", () => {
  const current = input();
  current.started_at = "2026-02-30T10:00:00Z";
  current.completed_at = "2026-03-03T10:01:00Z";
  current.history.captured_at = current.started_at;
  expect(() => buildReport(current)).toThrow("timestamp");
  const duplicate = input();
  duplicate.attention = [attention(), attention()];
  expect(() => buildReport(duplicate)).toThrow("duplicate attention");
});

test("a failed assessment does not present an empty recorded decision list as a clean result", () => {
  const value = input(); value.failures = [{ code: "audit-review-incomplete", message: "Finding judgments unavailable" }];
  const report = buildReport(value), markdown = renderReport(report);
  expect(report.outcome).toBe("failed"); expect(markdown).not.toContain("No unresolved content decisions.\n");
  expect(markdown).toContain("No unresolved content decisions are recorded in this failed report.");
});

test("controller proposal attention retains its assessment without bypassing overlap protection", () => {
  const current = input(), fix = correction(), detail = { ...attention(), identity: "proposal:4", reason: "Current assessment remains unknown" };
  current.corrections = [fix];
  current.proposals = [{ locator: "pr:4", state: "open", assessment: "unverifiable", actor: "bot", head: "c".repeat(40),
    body_sha256: digest("body"), reviewed: null, paths: [fix.path], resolution_attention: detail,
    evidence: { receipt_sha256: digest("receipt"), inputs_sha256: digest("current evidence") } }];
  const result = buildReport(current);
  expect(result.attention).toHaveLength(1);
  expect(result.attention[0].item).toMatchObject({ ...detail, reason: expect.stringContaining("unverifiable") });
  expect(result.attention[0].item.inputs).toEqual(detail.inputs);
  expect(result.blocked_corrections).toEqual([correctionProjection(fix)]);
  expect(result.carried_delivery).toEqual([]);
  expect(result.success).toBe(false);
});


test("proposal overlap explanations identify the related original", () => {
  const current = input(), fix = correction(), detail = { ...attention(), identity: "proposal:4" };
  current.corrections = [fix];
  const proposal = { locator: "pr:4", state: "open" as const, assessment: "unverifiable" as const, actor: "bot",
    head: "c".repeat(40), body_sha256: digest("body"), reviewed: null, paths: [fix.path],
    evidence: { receipt_sha256: null, inputs_sha256: digest("current evidence") } };
  current.proposals = [{ ...proposal, resolution_attention: detail }, { ...proposal, locator: "pr:7" }];
  const report = buildReport(current), item = report.attention.find(row => row.item.identity === "proposal:4")?.item;
  expect(item?.reason).toContain("pr:7");
  expect(item?.links).toContain("pr:7");
  const decisions = renderReport(report).split("## Decisions\n\n")[1]?.split("## Recommendations")[0];
  expect(decisions).not.toMatch(/\.\s*\./u);
  expect(report.attention.find(row => row.item.identity === "proposal:pr:7")?.item.links).toContain("pr:4");
  expect(item?.inputs).toEqual(detail.inputs);
  expect(report.blocked_corrections).toEqual([correctionProjection(fix)]);
  expect(report.carried_delivery).toEqual([]);
});


test("a controller reason ending in a sentence keeps one separator", () => {
  const current = input();
  current.proposals = [{ locator: "pr:4", state: "open", assessment: "unverifiable", actor: "bot", head: "c".repeat(40),
    body_sha256: digest("body"), reviewed: null, paths: ["docs/guide.md"],
    evidence: { receipt_sha256: null, inputs_sha256: digest("inputs") },
    resolution_attention: { ...attention(), reason: "Current support needs source review." } }];
  const report = buildReport(current), reason = report.attention[0].item.reason;
  expect(reason).not.toMatch(/\.\s*\./u);
  expect(reason).toContain("Current support needs source review.");
  expect(renderReport(report).split("## Decisions\n\n")[1]?.split("## Recommendations")[0]).not.toMatch(/\.\s*\./u);
});


test("report sentence joining handles empty diagnostics and existing punctuation", () => {
  expect(joinReportSentences(["Verification failed", ""])).toBe("Verification failed.");
  expect(joinReportSentences(["Verification failed. ", "Inspect source."])).toBe("Verification failed. Inspect source.");
  expect(joinReportSentences(["Does source support it?", "Inspect it!"])).toBe("Does source support it? Inspect it!");
  expect(joinReportSentences(["", "  "])).toBe("");
});


test("rendered decision, match, failure and history sentences retain one terminal mark", () => {
  const current = input();
  current.attention = [{ ...attention(), title: "Verify this claim.", reason: "Source support remains unknown.", owner_action: "Inspect the source." }];
  current.failures = [{ code: "collection", message: "Collection stopped." }];
  current.history.diagnostics = ["An earlier report is unavailable."];
  const report = buildReport(current);
  report.attention[0].match_reason = "No current match.";
  const rendered = renderReport(report);
  expect(rendered).not.toMatch(/\.\s*\./u);
  expect(rendered).toContain("Verify this claim. Source support remains unknown. Inspect the source.");
  expect(rendered).toContain("No current match.");
  expect(rendered).toContain("Resolve collection. Collection stopped.");
  expect(rendered).toContain("An earlier report is unavailable.");
});
