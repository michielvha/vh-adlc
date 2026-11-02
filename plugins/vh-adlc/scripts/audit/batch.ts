import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJSON } from "../maintenance/journal";
import { repositoryPath } from "../maintenance/authority";
import { tableCells } from "./inventory";
import { validateHistoricalCandidate, validateFrozenFixCandidate, type Candidate } from "./ledger";
import { evaluateCommittedAssessments, validArtifact } from "./assessment";
import { digest, git, gitBytes, hash, type Snapshot } from "./snapshot";
import type { Settings } from "./types";

export type Definition = {
  schema_version: 1; repository: string; hostname: string; default_branch: string; run_id: string; workstream: string;
  scope_baseline: string; task_base: string; source_target: string; ledger_path: string; record_path: string;
  affected_paths: string[]; verification_inputs: string[];
  members: { id: string; disposition: "authored-repair" | "assessment-only"; contract: string; eligibility: string; required_checks: string[];
    pre_fix?: string; repair_commit?: string; coupled_bundle?: string }[];
  carried: null | { commit: string; ids: string[]; paths: string[]; report_snapshot_digest: string; evidence_artifact: { path: string; sha256: string } };
};
export function renderRecord(definition: Definition) {
  return "# Audit repair batch\n\n## Definition\n\n```json\n" + JSON.stringify(definition, null, 2) +
    "\n```\n\n## Evidence\n\nAppend actual per-member red/green/scenario/challenge and final-target checks.\n\n## Reviews\n\nRetain returned records verbatim with exact targets, model and isolation.\n\n## State\n\nreview pending\n";
}
function definition(text: string): Definition {
  const section = text.match(/^## Definition\s*\n([\s\S]*?)(?=^## Evidence\s*$)/m);
  const blocks = [...(section?.[1] ?? "").matchAll(/^```json\n([\s\S]*?)\n```$/gm)];
  if (!section || blocks.length !== 1 || [...text.matchAll(/^## Definition\s*$/gm)].length !== 1) throw Error("one committed audit Definition is required");
  return JSON.parse(blocks[0][1]);
}
function ancestor(config: Settings, a: string, b: string) {
  if (!/^[a-f0-9]{40,64}$/.test(a) || !/^[a-f0-9]{40,64}$/.test(b)) return false;
  try { git(config.root, "merge-base", "--is-ancestor", a, b); return true; } catch { return false; }
}
function changed(config: Settings, a: string, b: string) { return git(config.root, "diff", "--name-only", "-z", a, b, "--").split("\0").filter(Boolean); }
function appendOnlyRecord(before: string, after: string) {
  const split = (text: string) => text.split(/(?=^## (?:Definition|Evidence|Reviews|State)\s*$)/m);
  const old = split(before), current = split(after);
  return old.length === 5 && current.length === 5 && old[0] === current[0] && old[1] === current[1] &&
    old.slice(2).every((section, i) => current[i + 2].startsWith(section));
}
function preservedLedger(before: string, after: string, selected: string[]) {
  const current = after.split("\n"); let cursor = 0, header: string[] | null = null;
  for (const line of before.split("\n")) {
    const cells = tableCells(line);
    if (cells[0]?.toUpperCase() === "ID") header = cells;
    const id = cells[0]?.replace(/^\[([^\]]+)\]\([^)]*\)$/, "$1");
    if (header && selected.includes(id) && line.trim().startsWith("|")) {
      const status = header.findIndex(c => /^(Status|State)$/i.test(c)), title = header.findIndex(c => /^(Title|Finding|Description)$/i.test(c));
      const next = current.findIndex((value, i) => i >= cursor && tableCells(value)[0] === cells[0]);
      if (next < 0) return false;
      const replacement = tableCells(current[next]);
      if (replacement.length !== cells.length || cells.some((cell, i) => i === status ? false : status < 0 && i === title ? !replacement[i].startsWith(cell) : replacement[i] !== cell)) return false;
      cursor = next + 1;
    } else {
      const next = current.indexOf(line, cursor);
      if (next < 0) return false;
      cursor = next + 1;
    }
  }
  return true;
}
export function checkBatch(config: Settings, input: {
  record_path: string; review_target: string; snapshot: Snapshot; document: unknown;
  provisional: { snapshot: Snapshot; document: { schema_version: number; snapshot_digest: string; assessments: any[] }; candidate: Candidate };
  selection: { ids: string[]; workstream: string; carried: Definition["carried"] };
  review: { target: string; producer: string; reviewer: string; artifact: { path: string; sha256: string }; model: string };
}) {
  const errors: string[] = []; let publication_base: string | null = null, repair_batch = false;
  try {
    const recordPath = repositoryPath(input.record_path), target = input.review_target;
    const record = gitBytes(config.root, "show", `${target}:${recordPath}`).toString(), def = definition(record);
    publication_base = def.scope_baseline;
    if (def.schema_version !== 1 || def.repository !== config.repository || def.hostname !== config.hostname || def.record_path !== recordPath ||
        def.ledger_path !== config.ledger_path || !def.run_id?.trim() || def.workstream !== input.selection.workstream ||
        !Array.isArray(def.members) || !def.members.length || new Set(def.members.map(m => m.id)).size !== def.members.length ||
        digest(def.members.map(m => m.id).sort()) !== digest([...input.selection.ids].sort()) ||
        digest(input.snapshot.selected_ids.slice().sort()) !== digest([...input.selection.ids].sort())) errors.push("Definition and current selection differ.");
    if (!ancestor(config, def.scope_baseline, def.task_base) || !ancestor(config, def.task_base, def.source_target) ||
        !ancestor(config, def.source_target, target)) errors.push("Scope, Task base and frozen source must be real ordered ancestors.");
    git(config.root, "check-ref-format", "refs/heads/" + def.default_branch);
    if (git(config.root, "rev-parse", "refs/remotes/origin/" + def.default_branch) !== def.scope_baseline) errors.push("Fetched default scope baseline is no longer current.");
    if (!Array.isArray(def.affected_paths) || !Array.isArray(def.verification_inputs) ||
        [...def.affected_paths, ...def.verification_inputs].some(path => repositoryPath(path) !== path) ||
        !def.affected_paths.includes(config.ledger_path) || !def.affected_paths.includes(recordPath)) errors.push("Definition lacks its actual affected paths and verification inputs.");
    const metadata = new Set([config.ledger_path, recordPath]);
    if (def.verification_inputs.some(path => metadata.has(path)) || changed(config, def.source_target, target).some(path => !metadata.has(path))) errors.push("Source/test/config changed after frozen Verified source.");
    if (changed(config, def.scope_baseline, target).some(path => !def.affected_paths.includes(path))) errors.push("Full publication diff contains undeclared paths.");
    if (!preservedLedger(gitBytes(config.root, "show", `${def.scope_baseline}:${config.ledger_path}`).toString(),
      gitBytes(config.root, "show", `${target}:${config.ledger_path}`).toString(), [...input.selection.ids, ...(def.carried?.ids ?? [])])) errors.push("Existing finding content, IDs or unrelated index cells were removed or rewritten.");
    if (def.carried) {
      if (canonicalJSON(def.carried) !== canonicalJSON(input.selection.carried) || def.task_base !== def.carried.commit ||
          git(config.root, "rev-parse", def.carried.commit + "^") !== def.scope_baseline || !def.carried.ids.length ||
          def.carried.paths.some(path => path !== config.ledger_path) ||
          changed(config, def.scope_baseline, def.task_base).some(path => !def.carried!.paths.includes(path)) ||
          !validArtifact(input.snapshot.artifact_root, def.carried.evidence_artifact)) errors.push("Carried ledger report requires its exact owner-included full scope and bound evidence.");
      const carried = JSON.parse(readFileSync(join(input.snapshot.artifact_root, def.carried.evidence_artifact.path), "utf8"));
      if (carried.snapshot?.digest !== def.carried.report_snapshot_digest || carried.snapshot?.source.commit !== def.scope_baseline ||
          digest(carried.candidate?.ids?.slice().sort()) !== digest(def.carried.ids.slice().sort()) ||
          !validateHistoricalCandidate(config, carried.snapshot, carried.candidate, carried.document) ||
          gitBytes(config.root, "show", `${def.carried.commit}:${config.ledger_path}`).toString() !== carried.candidate.bytes) errors.push("Every carried finding needs its original checked report/source/challenge evidence.");
    } else if (input.selection.carried !== null || def.task_base !== def.scope_baseline) errors.push("Unapproved pre-repair publication changes are not hidden behind Task base.");
    if (gitBytes(config.root, "show", `${def.source_target}:${config.ledger_path}`).toString() !== gitBytes(config.root, "show", `${def.task_base}:${config.ledger_path}`).toString()) errors.push("Frozen source must retain the selected Task-base ledger before provisional updates.");
    const provisional = input.provisional;
    if (!provisional || provisional.snapshot.source.commit !== def.source_target || provisional.candidate.source_target !== def.source_target ||
        provisional.candidate.scope_baseline !== def.scope_baseline || provisional.candidate.run_id !== def.run_id ||
        digest(provisional.candidate.ids.slice().sort()) !== digest(input.selection.ids.slice().sort()) ||
        digest(provisional.snapshot.required_checks) !== digest(input.snapshot.required_checks) ||
        !validateFrozenFixCandidate(config, provisional.snapshot, provisional.candidate, provisional.document) ||
        gitBytes(config.root, "show", `${target}:${config.ledger_path}`).toString() !== provisional.candidate.bytes) errors.push("Committed ledger must equal the frozen-source checked provisional candidate.");
    const semantics = (document: any) => document.assessments.map((row: any) => ({ id: row.id, disposition: row.disposition, verdict: row.verdict, reason: row.reason, residuals: row.residuals,
      evidence: row.evidence.map(({ commit, ...evidence }: any) => evidence) })).sort((a: any, b: any) => a.id.localeCompare(b.id));
    if (!provisional || digest(semantics(provisional.document)) !== digest(semantics(input.document))) errors.push("Final member verdicts/scenarios must match the provisional ledger assessments.");
    const rows = (input.document as { assessments: { id: string; disposition: string; red?: { commit: string } }[] })?.assessments;
    for (const member of def.members) {
      const row = rows?.find(row => row.id === member.id);
      if (!member.contract?.trim() || member.eligibility !== "restoration" || row?.disposition !== member.disposition ||
          !Array.isArray(member.required_checks) || digest(member.required_checks.slice().sort()) !== digest((input.snapshot.required_checks[member.id] ?? []).slice().sort())) errors.push("Member contract, eligibility, disposition or required checks are missing: " + member.id);
      if (member.disposition === "authored-repair") {
        repair_batch = true;
        if (!member.pre_fix || !member.repair_commit || !ancestor(config, def.task_base, member.pre_fix) ||
            !ancestor(config, member.pre_fix, member.repair_commit) || member.pre_fix === member.repair_commit ||
            !ancestor(config, member.repair_commit, def.source_target) || row?.red?.commit !== member.pre_fix) errors.push("Authored member needs its actual pre-fix/repair targets: " + member.id);
      } else if (member.disposition !== "assessment-only" || member.pre_fix || member.repair_commit) errors.push("Assessment-only members must not invent repair history.");
    }
    if (input.snapshot.source.commit !== target || input.snapshot.mode !== "fix") errors.push("Final per-member checks must target the actual final batch head.");
    const evidence = evaluateCommittedAssessments(config, input.snapshot, input.document);
    if (!evidence.pass || evidence.coverage !== "complete" || evidence.eligible_ids.length !== def.members.length) errors.push(...evidence.errors, "Every requested member needs its final disposition-specific terminal evidence.");
    const review = input.review;
    if (review.target !== target || !review.producer?.trim() || !review.reviewer?.trim() || review.producer === review.reviewer ||
        !review.model?.trim() || !validArtifact(input.snapshot.artifact_root, review.artifact) ||
        !new RegExp("^MODEL: " + review.model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\r?\\nNO FINDINGS\\s*$").test(readFileSync(join(input.snapshot.artifact_root, review.artifact.path), "utf8"))) errors.push("Current independent audit review is missing or has findings.");
    const head = git(config.root, "rev-parse", "HEAD");
    if (git(config.root, "status", "--porcelain") || !ancestor(config, target, head) || changed(config, target, head).some(path => path !== recordPath)) errors.push("Current source/ledger changed since review.");
    if (head !== target && !appendOnlyRecord(record, gitBytes(config.root, "show", `${head}:${recordPath}`).toString())) errors.push("Only append-only record bookkeeping can retain review freshness.");
    for (const [path, bound] of [[config.settings_path, input.snapshot.bindings.settings], [config.project_procedure, input.snapshot.bindings.procedure]] as const) {
      if (hash(readFileSync(join(config.root, path))) !== bound) errors.push("Current audit policy/settings changed.");
    }
  } catch { errors.push("Batch objects, record or evidence cannot be validated."); }
  return { pass: !errors.length, publication_base, repair_batch, publish_repair: !errors.length && repair_batch, errors,
    limit: "Structural operator attestations; independent semantic review and separate delivery authority remain required." };
}
