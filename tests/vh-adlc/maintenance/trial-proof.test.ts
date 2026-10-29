import { expect, test } from "bun:test";
import { gradeNativeReport, gradeConsumerPlan } from "./report-trial";
import { passingAssessment } from "./trial-proof";
const row = { id: "pr:example/project#1", classification: "routine-batch-candidate", proposal: "propose-batch", evidence: [{ path: "source/app.ts", line: 1 }], source_owner: "primary", batch_eligible: true, measured_count: null, coverage: "not-applicable", claimed_resolved: [], related_ids: [] };
const assessment = passingAssessment([row]);
const evidence = { "source/app.ts": "affected caller\n" };
test("native report proof rejects wrong models, missing reads, failed calls and altered inputs", () => {
  const proof = { host: "copilot-cli", requested_model: "claude-opus-5.5", models: ["claude-opus-5.5"], exit_code: 0, timed_out: false, reaped: true, input_preserved: true, source_preserved: true, native_tools_pass: true, required_reads: ["manifest.json"], successful_reads: ["manifest.json"] };
  expect(gradeNativeReport(assessment, [row], evidence, proof).pass).toBe(true);
  for (const change of [{ models: ["other"] }, { successful_reads: [] }, { exit_code: 1 }, { timed_out: true }, { input_preserved: false }, { source_preserved: false }, { native_tools_pass: false }]) expect(gradeNativeReport(assessment, [row], evidence, { ...proof, ...change }).pass).toBe(false);
  expect(gradeNativeReport({ ...assessment, items: [] }, [row], evidence, proof).pass).toBe(false);
});

test("equivalent evidence inside its actual JSON node passes, adjacent unrelated evidence fails", () => {
  const ranged = { ...row, evidence: [{ path: "inventory.json", line: 2, end_line: 4 }] };
  const good = passingAssessment([ranged]); good.items[0].evidence = [{ path: "inventory.json", line: 3, detail: "the scoped coverage count" }];
  const proof = { host: "copilot-cli", requested_model: "claude-opus-5.5", models: ["claude-opus-5.5"], exit_code: 0, timed_out: false, reaped: true, input_preserved: true, source_preserved: true, native_tools_pass: true, required_reads: [], successful_reads: [] };
  expect(gradeNativeReport(good, [ranged], { "inventory.json": "outside\nobject\ncount\nend\noutside\n" }, proof).pass).toBe(true);
  good.items[0].evidence[0].line = 5;
  expect(gradeNativeReport(good, [ranged], { "inventory.json": "outside\nobject\ncount\nend\noutside\n" }, proof).pass).toBe(false);
});

import { jsonEvidence } from "./json-evidence";
import { stackweaverPolicyCorpus } from "./policy-corpus";
import { fixture, git } from "./fixtures";
import { sourceSnapshot } from "./install-trial";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("JSON evidence ranges identify the actual scoped object instead of an arbitrary preferred line", () => {
  const value = { repositories: [{ repository: "a/b", alerts: { count: 1, items: [] } }, { repository: "c/d", alerts: null }] };
  const encoded = jsonEvidence(value); expect(encoded.text).toBe(JSON.stringify(value, null, 2) + "\n");
  const range = encoded.at("repositories", 0, "alerts"), other = encoded.at("repositories", 1, "repository");
  expect(range.line).toBeLessThan(range.end_line); expect(other.line).toBeGreaterThan(range.end_line);
  expect(() => encoded.at("repositories", 10)).toThrow();
});

test("policy packets copy only explicit frozen policy paths and keep synthetic collector data separate", () => {
  const consumer = fixture();
  try {
    const files: Record<string, string> = {
      "AGENTS.md": "Read CLAUDE.md for project rules.\n", "CLAUDE.md": "Synthetic local policy, not a live project trial.\n", "agents/maintenance.md": "Forward to installed shared maintenance.\n", ".claude/commands/maintenance.md": "---\nmodel: opus\n---\nUse shared maintenance with $ARGUMENTS.\n", "maintenance-project.md": "Only approved green satellite helper work. Dockerfile stays satellite-owned.\nMixed ownership requires a decision.\nOnly the declared 403 is expected unavailable.\nAPI and orchestrator own their builder Dockerfile.\n", ".github/workflows/sync-api.yml": "run: |\n  # Clean slate\n  rsync -av --mkpath monorepo/backend/ satellite/backend/\n  cp monorepo/backend/go.mod satellite/backend/\n", ".github/workflows/sync-frontend.yml": "run: rsync monorepo/frontend/ satellite/\n", ".github/renovate.json5": "{}\n", "security.md": "Documented no GHAS.\n", "private-report-history.md": "Do not copy this unselected private report.\n",
    };
    for (const [path, text] of Object.entries(files)) consumer.write(path, text);
    consumer.settings({ schema_version: 1, repository: "michielvha/stackweaver", bot_inventory_terms: ["release-bot"], repositories: [
      { repository: "vhco-pro/stackweaver-api", role: "synced", sync_workflow: ".github/workflows/sync-api.yml" },
      { repository: "vhco-pro/stackweaver-frontend", role: "synced", sync_workflow: ".github/workflows/sync-frontend.yml" },
      { repository: "vhco-pro/terraform-provider-stackweaver", role: "independent" }, { repository: "vhco-pro/stackweaver-registry", role: "independent" }], source_references: ["CLAUDE.md", ".github/renovate.json5"], backlog_references: ["security.md"], project_procedure: "maintenance-project.md", discovery_organizations: ["vhco-pro"], dashboards: [{ repository: "michielvha/stackweaver", title: "Dependency Dashboard" }], surface_expectations: [{ repository: "michielvha/stackweaver", surface: "code_scanning", status: 403, message_contains: "Advanced Security must be enabled", reason: "Documented no GHAS", evidence: "security.md" }] });
    git(consumer.root, "add", "."); git(consumer.root, "commit", "-qm", "test: bounded policy source");
    const before = sourceSnapshot(consumer.root), commit = git(consumer.root, "rev-parse", "HEAD");
    const corpus = stackweaverPolicyCorpus({ root: consumer.root, commit }, () => ({ "AGENTS.md": "fixture pin\n", "operator/runtime.json": '{"test_only":true}\n' }));
    try {
      expect(sourceSnapshot(consumer.root)).toBe(before);
      expect(corpus.config.repository).toBe("michielvha/stackweaver");
      expect(corpus.packet.source_paths).not.toContain("private-report-history.md");
      expect(JSON.parse(readFileSync(join(corpus.project.root, "operator/consumer-policy.json"), "utf8")).commit).toBe(commit);
      const cli = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/maintenance/cli.ts");
      const result = Bun.spawnSync([process.execPath, cli, "collect", "--repo", corpus.project.root], { env: corpus.env, stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode).toBe(0); const inventory = JSON.parse(result.stdout.toString()); corpus.bindInventory(inventory);
      expect(inventory.repositories[0].code_scanning.coverage.status).toBe("complete-unavailable");
      expect(inventory.discovery[0].coverage.status).toBe("complete");
      expect(corpus.cases.find(row => row.id.endsWith("frontend#22"))?.proposal).toBe("route-to-monorepo");
      expect(corpus.cases.find(row => row.id.endsWith("api#23"))?.source_owner).toBe("satellite");
      expect(sourceSnapshot(consumer.root)).toBe(before);
    } finally { corpus.project.dispose(); }
  } finally { consumer.dispose(); }
});

import { gradeCodexPacketReads } from "./report-trial";

test("Codex read proof requires returned file content, not a filename in wc or a partial read", () => {
  const root = fixture();
  try {
    root.write("page.md", "first\nsecond\nthird\n");
    const event = (command: string, aggregated_output: string, exit_code = 0) => ({ type: "item.completed", item: { type: "command_execution", command, aggregated_output, exit_code } });
    expect(gradeCodexPacketReads([event("wc -l page.md", "3 page.md")], root.root, ["page.md"]).successful_reads).toEqual([]);
    expect(gradeCodexPacketReads([event("nl -ba page.md | head -1", "     1\tfirst\n")], root.root, ["page.md"]).successful_reads).toEqual([]);
    expect(gradeCodexPacketReads([event("nl -ba page.md", "     1\tfirst\n     2\tsecond\n     3\tthird\n")], root.root, ["page.md"]).successful_reads).toEqual([join(root.root, "page.md")]);
  } finally { root.dispose(); }
});

test("a declared security expectation is valid evidence alongside its local procedure explanation", () => {
  const bound = { ...row, evidence: [{ path: "source/policy.md", line: 2, alternatives: [{ path: "settings.json", line: 1 }] }] };
  const assessment = passingAssessment([bound]); assessment.items[0].evidence = [{ path: "settings.json", line: 1, detail: "The exact observed surface/status/literal message is declared here." }];
  const proof = { host: "copilot-cli", requested_model: "claude-opus-5.5", models: ["claude-opus-5.5"], exit_code: 0, timed_out: false, reaped: true, input_preserved: true, source_preserved: true, native_tools_pass: true, required_reads: [], successful_reads: [] };
  const sources = { "source/policy.md": "policy\nexpected unavailable\n", "settings.json": "actual declared expectation\n", "unrelated.json": "not policy\n" };
  expect(gradeNativeReport(assessment, [bound], sources, proof).pass).toBe(true);
  assessment.items[0].evidence[0].path = "unrelated.json"; expect(gradeNativeReport(assessment, [bound], sources, proof).pass).toBe(false);
});

test("consumer builder ordering accepts the bound primary repository and rejects another or a prefix match", () => {
  const plan = { builder_order: ["satellite API/orchestrator builder prerequisite", "primary michielvha/stackweaver synced backend/go.mod bump"], single_squash: true, skip_ci: false, distribution_edits: false, satellite_helper: "Only approved/preauthorized selected green checks", production_compatibility: "Production compatibility is unverified; synthetic samples only.", report_publication: "Only the authorized run report" };
  expect(gradeConsumerPlan(plan, "michielvha/stackweaver").pass).toBe(true);
  expect(gradeConsumerPlan({ ...plan, builder_order: [plan.builder_order[0], "monorepo backend/go.mod bump"] }, "michielvha/stackweaver").pass).toBe(true);
  for (const destination of ["primary other/project backend/go.mod", "primary michielvha/stackweaver-extra backend/go.mod"]) expect(gradeConsumerPlan({ ...plan, builder_order: [plan.builder_order[0], destination] }, "michielvha/stackweaver").pass).toBe(false);
  expect(gradeConsumerPlan({ ...plan, builder_order: [...plan.builder_order].reverse() }, "michielvha/stackweaver").pass).toBe(false);
  expect(gradeConsumerPlan({ ...plan, skip_ci: true }, "michielvha/stackweaver").pass).toBe(false);
  expect(gradeConsumerPlan({ ...plan, production_compatibility: "The synthetic caller samples support only bounded fixture routing. They establish no production call-site compatibility, check result or readiness." }, "michielvha/stackweaver").pass).toBe(true);
  expect(gradeConsumerPlan({ ...plan, production_compatibility: "The synthetic samples establish production call-site compatibility and readiness." }, "michielvha/stackweaver").pass).toBe(false);
  for (const claim of ["Samples prove production compatibility; nothing cannot ship", "Production compatibility is unverified; samples prove production compatibility", "Production compatibility is not verified but production compatibility is confirmed", "Unverified production compatibility is proven"]) expect(gradeConsumerPlan({ ...plan, production_compatibility: claim }, "michielvha/stackweaver").pass).toBe(false);
  expect(gradeConsumerPlan({ ...plan, production_compatibility: "None. They cannot establish compatibility with production source." }, "michielvha/stackweaver").pass).toBe(true);
});
