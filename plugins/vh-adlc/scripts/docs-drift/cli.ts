#!/usr/bin/env bun
import { PUBLISHER_ENTRIES, type PublisherEntry } from "./identity";
import { auditSessionOutput, runAuditSession } from "./audit-session";
import { persistAuditOutput, type AuditOutputArtifacts } from "./report-output";
import { persistHostedAuditOutput } from "./history-output";
import { persistLocalAuditOutput } from "./local-history-output";
import { collectAuditProposalInputs, auditProposalInputsOutput } from "./audit-proposal-inputs";
import { collectNativeReportHistory, historyCollectionOutput } from "./history-collection";
import { assessmentReviewOutput, collectAssessmentReviewTarget, collectAssessmentReview } from "./assessment-review";
import { readCoordinatedSelection } from "./coordination";
import { collectNativeRetained } from "./retained-controller";
import { checkClosurePublication, publishClosure, resumeClosure } from "./closure-controller";
import { collectClosureWorkerInputs, collectClosureReviewTarget, collectClosureReview, closureReviewTargetProjection, closureReviewProjection } from "./closure-worker";
import { inspectRecovery, applyRecovery, recoveryInspectionOutput } from "./recovery-controller";
import { recoveryEffectsOutput, publicationEffectsOutput } from "./recovery-output";
import { OUTPUT_LIMIT } from "./owned-process";
import type { PublishResult } from "./publish";
import { readAssessmentReport, assessmentReportOutput } from "./assessment-report";
import { checkPublication, publishPublication, resumePublication } from "./publication-controller";
import { collectCandidateReview } from "./candidate-review";
import { collectReviewTarget } from "./review-target";
import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { artifactDirectoryScope, captureSnapshot, externalArtifactDirectory } from "./snapshot";
import { runScan, type ScanRun } from "./scan";
import { checkUpgradeSignals, collectTrialBindings } from "./adoption";
import { loadCommittedSettings } from "./settings";
import { readNativeContext, withNativeObservation } from "./transport";
import { prepareTrialFixture } from "./trial-setup";
import { selectApprovedRuntime, selectCandidateRuntime } from "./bootstrap";
import { collectProposals } from "./proposals";
import { inspectPreparation, inspectCandidate, prepareEdits, PreparationEvidenceError } from "./preparation";
import { readCandidateVerificationArtifacts } from "./verification-evidence";
import { assessSource } from "./source-assessment";
import { verifyCandidate } from "./candidate-verification";
import { collectWorkerPreparation } from "./worker-preparation";
import { collectWorkerInputs, type WorkerCollectionOptions } from "./publication-worker";
import { collectPublicationBindings } from "./publication-bindings";
import { collectPublicationInputs } from "./publication-inputs";
import { collectNativeResolution, collectNativeClosure, collectNativeClosureTarget, closureTargetOutput } from "./resolution-entry";
import { readBoundArtifact } from "./evidence-input";
import { canonicalJSON, decodeUTF8, protocolPath } from "./protocol";
import { runDirectoryMain } from "./run-cli";

type Diagnostic = { code: string; message: string };
export type CLIReport = {
  schema_version: 1; command: string; outcome: "collected" | "attention" | "incomplete"; diagnostics: Diagnostic[];
  audit_session?: Awaited<ReturnType<typeof runAuditSession>>; details_omitted?: boolean;
  report_artifacts?: AuditOutputArtifacts | null;
  retained_operation?: Awaited<ReturnType<typeof collectNativeRetained>>["retained_operation"];
  recovery_inspection?: Awaited<ReturnType<typeof inspectRecovery>>;
  recovery_effects?: ReturnType<typeof recoveryEffectsOutput>["recovery_effects"];
  audit_proposal_inputs?: Awaited<ReturnType<typeof collectAuditProposalInputs>>;
  history_collection?: Awaited<ReturnType<typeof collectNativeReportHistory>>;
  assessment_review_target?: Awaited<ReturnType<typeof collectAssessmentReviewTarget>>;
  assessment_review?: Awaited<ReturnType<typeof collectAssessmentReview>>;
  assessment_report?: ReturnType<typeof readAssessmentReport>; markdown?: string;
  source_commit?: string; settings_sha256?: string; bindings_sha256?: string; assessment?: ScanRun;
  signals?: ReturnType<typeof checkUpgradeSignals>;
  trial?: ReturnType<typeof collectTrialBindings>;
  preparation?: ReturnType<typeof prepareTrialFixture>;
  runtime?: Awaited<ReturnType<typeof selectApprovedRuntime> | ReturnType<typeof selectCandidateRuntime>>;
  proposals?: ReturnType<typeof collectProposals>;
  edit_inspection?: ReturnType<typeof inspectPreparation>;
  worker_preparation?: Awaited<ReturnType<typeof collectWorkerPreparation>>;
  worker_inputs?: Awaited<ReturnType<typeof collectWorkerInputs>>;
  publication_check?: Awaited<ReturnType<typeof checkPublication>>;
  publication_effects?: ReturnType<typeof publicationEffectsOutput>["publication_effects"];
  candidate_review?: Awaited<ReturnType<typeof collectCandidateReview>>;
  review_target?: Awaited<ReturnType<typeof collectReviewTarget>>;
  publication_bindings?: Awaited<ReturnType<typeof collectPublicationBindings>>;
  publication_inputs?: Awaited<ReturnType<typeof collectPublicationInputs>>;
  verification?: Awaited<ReturnType<typeof verifyCandidate>>;
  source_assessment?: Awaited<ReturnType<typeof assessSource>>;
  candidate_inspection?: ReturnType<typeof inspectCandidate>;
  retained_resources?: { checkout: string | null; record_path: string | null };
  closure_publication_check?: Awaited<ReturnType<typeof checkClosurePublication>>;
  closure_worker_inputs?: Awaited<ReturnType<typeof collectClosureWorkerInputs>>;
  closure_review_target?: ReturnType<typeof closureReviewTargetProjection>;
  closure_review?: ReturnType<typeof closureReviewProjection>;
  closure_target?: Awaited<ReturnType<typeof collectNativeClosureTarget>>;
  closure?: Awaited<ReturnType<typeof collectNativeClosure>>;
  resolution?: Awaited<ReturnType<typeof collectNativeResolution>>;
  prepared?: Awaited<ReturnType<typeof prepareEdits>>;
};
const usage = `Documentation drift helper protocol 1
bun <plugin>/scripts/docs-drift/cli.ts inspect-retained|restore-retained --repo <repo> --source <original-full-commit>
  --artifact-root <new-private-external-directory> --operation-id <original-operation>
  Restores observations only; grants no replay or cleanup and reconstructs no missing original approval.
bun <plugin>/scripts/docs-drift/cli.ts scan --repo <repo> --source <full-commit>
  --artifact-root <private-external-directory>
bun <plugin>/scripts/docs-drift/cli.ts assess-source --repo <repo> --source <full-commit>
  --artifact-root <private-external-directory>
bun <plugin>/scripts/docs-drift/cli.ts report-findings --repo <repo> --source <full-commit>
  --artifact-root <private-external-directory> --source-verification <relative-original-record>
  --source-verification-sha256 <sha256> --assessment <relative-finding-assessments>
  --assessment-sha256 <sha256>
bun <plugin>/scripts/docs-drift/cli.ts check-upgrade-signals --repo <repo>
  --source <full-commit>
bun <plugin>/scripts/docs-drift/cli.ts trial-bindings --repo <repo>
  [--entry <hosted|copilot|claude>]
  --source <full-commit>
bun <plugin>/scripts/docs-drift/cli.ts prepare-trial-fixture --repo <repo>
  [--entry <hosted|copilot|claude>]
  --source <full-current-default-commit> --artifact-root <private-external-directory>
bun <plugin>/scripts/docs-drift/cli.ts inspect-runtime --repo <repo>
  --source <full-current-default-commit> --cache-root <retained-cache>
  --entry <hosted|copilot|claude> --launcher <invoked-launcher> --settings <invoked-settings>
  [--trial-definition <sha256>]
bun <plugin>/scripts/docs-drift/cli.ts collect-proposals --repo <repo>
  --source <full-current-default-commit>
bun <plugin>/scripts/docs-drift/cli.ts collect-publication-inputs --repo <assessment-repo>
  --source <full-commit> --candidate-repo <candidate-repo> --candidate <full-checkpoint-commit>
  --cache-root <retained-cache> --entry <hosted|copilot|claude>
  --launcher <invoked-launcher> --settings <invoked-settings>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>
  [--resolution-record <repo-relative-path> --resolution-sha256 <sha256>]
bun <plugin>/scripts/docs-drift/cli.ts collect-assessment-review-target|read-assessment-review
  <the source/runtime/original-worker arguments of read-worker-preparation>
  --reviewer-capture <original-independent-capture> --reviewer-capture-sha256 <sha256> (read only)
bun <plugin>/scripts/docs-drift/cli.ts collect-audit-proposal-inputs
  (same original source/decision/runtime flags as collect-worker-inputs; collects all full original diffs without publication authority)
bun <plugin>/scripts/docs-drift/cli.ts run-audit
  (same original source/decision/runtime flags as collect-worker-inputs; invokes the selected native worker and independent reviewer)
  Requires separate authority for provider execution; no publication, supplied role, prompt or model override is accepted.
bun <plugin>/scripts/docs-drift/cli.ts collect-report-history
  (same original source/decision/runtime flags as collect-worker-inputs; hosted runs bind GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT)
bun <plugin>/scripts/docs-drift/cli.ts collect-worker-inputs --repo <assessment-repo> --source <full-commit>
  --artifact-root <private-external-directory> --cache-root <retained-cache>
  --entry <hosted|copilot|claude> --launcher <invoked-launcher> --settings <invoked-settings>
  --source-verification <relative-record-path> --source-verification-sha256 <sha256>
  --decisions <relative-packet-path> --decisions-sha256 <sha256>
bun <plugin>/scripts/docs-drift/cli.ts read-worker-preparation --repo <assessment-repo> --source <full-commit>
  --artifact-root <private-external-directory> --cache-root <retained-cache>
  --entry <hosted|copilot|claude> --launcher <invoked-launcher> --settings <invoked-settings>
  --source-verification <relative-record-path> --source-verification-sha256 <sha256>
  --decisions <relative-packet-path> --decisions-sha256 <sha256>
  --worker-capture <relative-original-capture-path> --worker-capture-sha256 <sha256>
bun <plugin>/scripts/docs-drift/cli.ts bind-publication --repo <assessment-repo> --source <full-commit>
  --candidate-repo <candidate-repo> --candidate <full-checkpoint-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256> --cache-root <retained-cache>
  --entry <hosted|copilot|claude> --launcher <invoked-launcher> --settings <invoked-settings>
  --source-verification <relative-record-path> --source-verification-sha256 <sha256>
  --candidate-verification <relative-record-path> --candidate-verification-sha256 <sha256>
  --decisions <relative-packet-path> --decisions-sha256 <sha256>
  [--resolution-record <repo-relative-path> --resolution-sha256 <sha256>]
bun <plugin>/scripts/docs-drift/cli.ts collect-review-target --repo <assessment-repo> --source <full-commit>
  --candidate-repo <candidate-repo> --candidate <full-checkpoint-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256> --cache-root <retained-cache>
  --entry <hosted|copilot|claude> --launcher <invoked-launcher> --settings <invoked-settings>
  --source-verification <relative-record-path> --source-verification-sha256 <sha256>
  --candidate-verification <relative-record-path> --candidate-verification-sha256 <sha256>
  --decisions <relative-packet-path> --decisions-sha256 <sha256>
  --worker-capture <relative-original-capture-path> --worker-capture-sha256 <sha256>
  [--resolution-record <repo-relative-path> --resolution-sha256 <sha256>]
bun <plugin>/scripts/docs-drift/cli.ts read-candidate-review --repo <assessment-repo> --source <full-commit>
  --candidate-repo <candidate-repo> --candidate <full-checkpoint-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256> --cache-root <retained-cache>
  --entry <hosted|copilot|claude> --launcher <invoked-launcher> --settings <invoked-settings>
  --source-verification <relative-record-path> --source-verification-sha256 <sha256>
  --candidate-verification <relative-record-path> --candidate-verification-sha256 <sha256>
  --decisions <relative-packet-path> --decisions-sha256 <sha256>
  --worker-capture <relative-original-capture-path> --worker-capture-sha256 <sha256>
  --reviewer-capture <relative-original-capture-path> --reviewer-capture-sha256 <sha256>
  [--resolution-record <repo-relative-path> --resolution-sha256 <sha256>]
bun <plugin>/scripts/docs-drift/cli.ts <check-publication|publish|resume>
  <the source, candidate, runtime, proof and original-role arguments of read-candidate-review>
  --authority <relative-scoped-request-path> --authority-sha256 <sha256>
  [--journal-directory <original-private-journal-directory>] (resume only)
bun <plugin>/scripts/docs-drift/cli.ts check-verification --repo <assessment-repo> --source <full-commit>
  --candidate-repo <candidate-repo> --candidate <full-checkpoint-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256> --verification <relative-record-path>
  --verification-sha256 <sha256>
  [--resolution-record <repo-relative-path> --resolution-sha256 <sha256>]
bun <plugin>/scripts/docs-drift/cli.ts verify-candidate --repo <assessment-repo> --source <full-commit>
  --candidate-repo <candidate-repo> --candidate <full-checkpoint-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>
  [--resolution-record <repo-relative-path> --resolution-sha256 <sha256>]
bun <plugin>/scripts/docs-drift/cli.ts check-candidate --repo <assessment-repo> --source <full-commit>
  --candidate-repo <candidate-repo> --candidate <full-checkpoint-commit>
  [--resolution-record <repo-relative-path> --resolution-sha256 <sha256>]
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>
bun <plugin>/scripts/docs-drift/cli.ts check-edits --repo <repo> --source <full-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>
bun <plugin>/scripts/docs-drift/cli.ts collect-closure --repo <repo> --source <full-current-default-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>
bun <plugin>/scripts/docs-drift/cli.ts <check-closure-publication|publish-closure|resume-closure>
  --repo <repo> --source <full-current-default-commit> --artifact-root <private-external-directory>
  --selection <relative-closure-target-packet> --selection-sha256 <sha256>
  --cache-root <retained-cache> --entry <hosted|copilot|claude>
  --launcher <invoked-launcher> --settings <invoked-settings>
  --worker-capture <relative-original-capture-path> --worker-capture-sha256 <sha256>
  --reviewer-capture <relative-original-capture-path> --reviewer-capture-sha256 <sha256>
  --authority <relative-exact-authority-record> --authority-sha256 <sha256>
  [--journal-directory <original-private-journal>]
bun <plugin>/scripts/docs-drift/cli.ts <collect-closure-worker-inputs|collect-closure-review-target|read-closure-review>
  --repo <repo> --source <full-current-default-commit> --artifact-root <private-external-directory>
  --selection <relative-closure-target-packet> --selection-sha256 <sha256>
  --cache-root <retained-cache> --entry <hosted|copilot|claude>
  --launcher <invoked-launcher> --settings <invoked-settings>
  [--worker-capture <relative-original-capture-path> --worker-capture-sha256 <sha256>]
  [--reviewer-capture <relative-original-capture-path> --reviewer-capture-sha256 <sha256>]
bun <plugin>/scripts/docs-drift/cli.ts collect-closure-target --repo <repo> --source <full-current-default-commit>
  --artifact-root <private-external-directory> --selection <relative-closure-target-selection>
  --selection-sha256 <sha256>
bun <plugin>/scripts/docs-drift/cli.ts collect-resolution --repo <repo> --source <full-current-default-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>
bun <plugin>/scripts/docs-drift/cli.ts prepare --repo <repo> --source <full-commit>
  --artifact-root <private-external-directory> --selection <relative-packet-path>
  --selection-sha256 <sha256>

bun <original-retained-plugin>/scripts/docs-drift/cli.ts <inspect-recovery|acknowledge-delivery|reconcile-publication>
  --repo <repo> --source <original-source-commit> --artifact-root <original-private-directory>
  --cache-root <original-retained-cache> --entry <hosted|copilot|claude>
  --journal-directory <original-journal-directory> --selection <relative-recovery-selection>
  --selection-sha256 <sha256>
  [--authority <relative-exact-current-authority> --authority-sha256 <sha256>] (writes only)

Recovery inspection presents exact scopes and grants no effects. Recovery uses
original retained code, policy and journal evidence while preserving current
worktree policy and launchers. Acknowledgement requires a fresh exact owner
request. Reconciliation requires its exact owner request or adopted procedure.
Acknowledged and retired deliveries exit 1 and retain attention status.

report-findings checks original source quotes and complete finding accounting.
It emits caller-recorded judgments in JSON and Markdown. Assessment review target
collection binds a finding assessment returned by the original native worker.
Reading assessment review reloads its independent reviewer at that exact target.
Neither accepts a loose assessment or effect grant. The workflow combines
delivery and prior-attention evidence in its final run report.

Prepare the locked verified binary and required knowledge before invoking this
helper. The scanner reads the selected committed configuration and runs in its
owned source copy. JSON reports collection accounting. Candidate assessment,
content decisions and publication have their own lifecycle gates.
Complete collection exits 0. Incomplete input, setup or collection exits 2.
Upgrade signals compare committed intake metadata. A mismatch exits 1.
Trial bindings report candidate policy with execution authority none.
A non-hosted --entry needs the native read credential and observed current default.
Scalar policy ignores entry selection. Omit --entry for offline scalar inspection.
Signal consistency reads committed blobs and requires no publication credential.
Native reads require GH_TOKEN for github.com and *.ghe.com, or GH_ENTERPRISE_TOKEN
for an enterprise server, to observe the authenticated account and repository.
Trial preparation requires that credential and the observed current default.
Mapped policy requires --entry for prepare-trial-fixture.
It imports the committed synthetic fixture into a new owned directory.
Runtime inspection verifies the approved retained selection, or the candidate
bound by trial-definition. Actual model invocation and effect grants are separate.
Proposal collection reads the configured shared and legacy PR inventory.
Resolution collection fetches selected complete native PR diffs into a new owned
object store, then rechecks their source and metadata. Its output grants no effects.
Closure-target collection adds the exact proposed explanation/close payloads and
per-disposition model scopes to current native metadata. It grants no effects and
requires original semantic verification, independent review and authority before execution.
Closure collection recovers the durable merged consolidation record and original
full diffs from native inputs. Independent closure review and permission follow.
Edit checks require caller HEAD to equal the selected source commit.
A source mismatch returns the assessment-source diagnostic.
Edit checks compute postimages and feature-protection decisions. Semantic
verification, applying changes and publication have their own lifecycle steps.
Prepare requires the selected run's local-edit authority. It scans the committed
source, creates an owned preparation copy and applies the selected postimages.
Candidate inspection compares immutable Git objects with the selected complete
postimages and binds the full diff/tree. Working-tree overlays stay preserved.
A selected durable resolution record must match its exact bytes, assessed source
and complete postimages. Required input observations must be available.
The assessment repo must retain its selected HEAD for feature protection.
Publication input collection observes native current-default policy in a new owned
object store and verifies the adopted retained runtime and Git-source freshness.
Candidate verification reruns the committed scanner and configured verification
vectors in a fresh credential-free owned copy and retains original process/output
artifacts. Verification checks re-read those original bytes and current bindings.
Generators and semantic review follow their separately selected steps.
Worker input collection captures the original assessment, decisions and native proposal
inputs before candidate authoring. Reading worker preparation reopens its original
launch/native output and validates its declared edits against current source and
adopted runtime. Edit application and publication require their selected authority.
Publication binding collection rechecks source
and candidate verification artifacts,
current native proposals and the decision packet before deriving review bindings.
Source assessment retains the complete original scan without running baseline checks.
Existing passing baseline verification records remain readable. Candidate checks
must pass on the selected repaired checkpoint.
Review-target collection materializes the original worker proposal and exact candidate
into its independent review target. Reading candidate review reloads the original
independent reviewer capture at that target. Both commands supply authority none. Publication checks bind a separately captured
actual owner request or adopted procedure. Publishing and resuming execute only
from the exact approved retained controller. Resume reopens the original private
controller and journal records and rechecks the same source, review and authority.
Bindings have authority none. Original role evidence, current required observations and actual effect grants
follow in the controller. This collection has authority none.
Closure worker inputs bind the current merged record, original proposal hunks, proposed
explanations and retained runtime before semantic assessment. Closure review-target
collection reloads the original worker's scoped current-source and asset evidence.
Reading closure review requires its original independent reviewer at the exact
manifest. These read-only commands supply authority none. Closure execution follows
its separate effect grants and fresh publication checks. Closure publication and resume
require the exact retained executing controller, original native roles and actual
scoped authority. Original native journals bind same-operation recovery. The publisher
rechecks exact own effects, fresh source and current permission before each action.
Local edit/candidate commands accept an optional --coordination <relative-record>
with --coordination-sha256 <sha256>. The record binds an original current-owner
request to the exact source and selected actions. Claimed feature documents remain
protected. Worker and publication commands reopen coordination through their
original bound decision packet; a loose command option cannot grant it.
Verification, review and publication follow their own fresh owned-checkout gates.
`;

function publicationOutcome(state: PublishResult["state"]): CLIReport["outcome"] {
  if (state === "complete") return "collected";
  return state === "acknowledged" || state === "retired" ? "attention" : "incomplete";
}

const auditSessionCommands = ["run-audit"];
const historyCommands = ["collect-report-history"];
const originalInputCommands = [...historyCommands, "collect-audit-proposal-inputs"];
const assessmentReviewCommands = ["collect-assessment-review-target", "read-assessment-review"];
const retainedCommands = ["inspect-retained", "restore-retained"];
const recoveryCommands = ["inspect-recovery", "acknowledge-delivery", "reconcile-publication"];
const finalPublicationCommands = ["check-publication", "publish", "resume"];
const publicationCommands = ["bind-publication", "collect-review-target", "read-candidate-review", ...finalPublicationCommands];
const candidateCommands = ["check-candidate", "collect-publication-inputs", "verify-candidate", "check-verification", ...publicationCommands];
const closureEffectCommands = ["check-closure-publication", "publish-closure", "resume-closure"];
const closureRoleCommands = ["collect-closure-worker-inputs", "collect-closure-review-target", "read-closure-review", ...closureEffectCommands];
const coordinationCommands = ["check-edits", "prepare", "check-candidate", "verify-candidate", "check-verification", "collect-publication-inputs"];
const selectionCommands = [...closureRoleCommands, "check-edits", "prepare", "collect-resolution", "collect-closure", "collect-closure-target", ...candidateCommands];

export function argumentsForCommand(argv: string[]) {
  const command = argv[0];
  if (!["scan", "assess-source", "report-findings", "collect-worker-inputs", "read-worker-preparation", "check-upgrade-signals", "trial-bindings", "prepare-trial-fixture", "inspect-runtime", "collect-proposals", ...originalInputCommands, ...auditSessionCommands, ...assessmentReviewCommands, ...selectionCommands, ...recoveryCommands, ...retainedCommands].includes(command)) throw Error("unknown docs-drift command");
  const needsArtifacts = ["scan", "assess-source", "report-findings", "collect-worker-inputs", "read-worker-preparation", "prepare-trial-fixture", ...originalInputCommands, ...auditSessionCommands, ...assessmentReviewCommands, ...selectionCommands, ...recoveryCommands, ...retainedCommands].includes(command);
  const flags = ["--repo", "--source"];
  if (needsArtifacts) flags.push("--artifact-root");
  if (["trial-bindings", "prepare-trial-fixture"].includes(command)) flags.push("--entry");
  if (command === "inspect-runtime") flags.push("--cache-root", "--entry", "--launcher", "--settings", "--trial-definition");
  if (retainedCommands.includes(command)) flags.push("--operation-id");
  if (recoveryCommands.includes(command)) flags.push("--cache-root", "--entry", "--journal-directory");
  if (["acknowledge-delivery", "reconcile-publication"].includes(command)) flags.push("--authority", "--authority-sha256");
  if ([...selectionCommands, ...recoveryCommands].includes(command)) flags.push("--selection", "--selection-sha256");
  if (candidateCommands.includes(command)) flags.push("--candidate-repo", "--candidate", "--resolution-record", "--resolution-sha256");
  if (coordinationCommands.includes(command)) flags.push("--coordination", "--coordination-sha256");
  if (command === "check-verification") flags.push("--verification", "--verification-sha256");
  if ([...originalInputCommands, ...auditSessionCommands, ...assessmentReviewCommands, "collect-publication-inputs", ...publicationCommands, ...closureRoleCommands, "collect-worker-inputs", "read-worker-preparation"].includes(command)) flags.push("--cache-root", "--entry", "--launcher", "--settings");
  if ([...assessmentReviewCommands, ...closureEffectCommands, "collect-closure-review-target", "read-closure-review", "read-worker-preparation", "collect-review-target", "read-candidate-review", ...finalPublicationCommands].includes(command)) flags.push("--worker-capture", "--worker-capture-sha256");
  if ([...originalInputCommands, ...auditSessionCommands, ...assessmentReviewCommands, "collect-worker-inputs", "read-worker-preparation"].includes(command)) flags.push("--source-verification", "--source-verification-sha256", "--decisions", "--decisions-sha256");
  if (publicationCommands.includes(command)) flags.push("--source-verification", "--source-verification-sha256", "--candidate-verification", "--candidate-verification-sha256", "--decisions", "--decisions-sha256");
  if (["read-assessment-review", ...closureEffectCommands, "read-closure-review", "read-candidate-review", ...finalPublicationCommands].includes(command)) flags.push("--reviewer-capture", "--reviewer-capture-sha256");
  if ([...finalPublicationCommands, ...closureEffectCommands].includes(command)) flags.push("--authority", "--authority-sha256");
  if (["resume", "resume-closure"].includes(command)) flags.push("--journal-directory");
  if (command === "report-findings") flags.push("--source-verification", "--source-verification-sha256", "--assessment", "--assessment-sha256");
  const values = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!flags.includes(flag)) throw Error("unknown " + command + " option");
    if (values.has(flag)) throw Error("duplicate " + command + " option");
    if (!value || value.startsWith("--")) throw Error(command + " option requires a value");
    values.set(flag, value);
  }
  const repo = values.get("--repo"), source = values.get("--source"), artifacts = values.get("--artifact-root");
  if (!repo || !source || (needsArtifacts && !artifacts)) throw Error(command + " requires " + flags.join(", "));
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(source)) throw Error(command + " requires a full immutable source commit");
  const requiredReferences: Record<string, string[]> = {
    "collect-closure-worker-inputs": ["--cache-root", "--entry", "--launcher", "--settings"],
    "collect-closure-review-target": ["--cache-root", "--entry", "--launcher", "--settings", "--worker-capture", "--worker-capture-sha256"],
    "read-closure-review": ["--cache-root", "--entry", "--launcher", "--settings", "--worker-capture", "--worker-capture-sha256", "--reviewer-capture", "--reviewer-capture-sha256"],
    "report-findings": ["--source-verification", "--source-verification-sha256", "--assessment", "--assessment-sha256"],
    "check-verification": ["--verification", "--verification-sha256"],
    "collect-worker-inputs": ["--source-verification", "--source-verification-sha256", "--decisions", "--decisions-sha256"],
    "read-worker-preparation": ["--source-verification", "--source-verification-sha256", "--decisions", "--decisions-sha256", "--worker-capture", "--worker-capture-sha256"],
    "read-candidate-review": ["--source-verification", "--source-verification-sha256", "--candidate-verification", "--candidate-verification-sha256", "--decisions", "--decisions-sha256", "--worker-capture", "--worker-capture-sha256", "--reviewer-capture", "--reviewer-capture-sha256"],
    "collect-review-target": ["--source-verification", "--source-verification-sha256", "--candidate-verification", "--candidate-verification-sha256", "--decisions", "--decisions-sha256", "--worker-capture", "--worker-capture-sha256"],
    "bind-publication": ["--source-verification", "--source-verification-sha256", "--candidate-verification", "--candidate-verification-sha256", "--decisions", "--decisions-sha256"],
  };
  requiredReferences["collect-report-history"] = ["--cache-root", "--entry", "--launcher", "--settings", "--source-verification", "--source-verification-sha256", "--decisions", "--decisions-sha256"];
  requiredReferences["run-audit"] = [...requiredReferences["collect-report-history"]];
  requiredReferences["collect-audit-proposal-inputs"] = [...requiredReferences["collect-report-history"]];
  requiredReferences["collect-assessment-review-target"] = ["--cache-root", "--entry", "--launcher", "--settings", "--source-verification", "--source-verification-sha256",
    "--decisions", "--decisions-sha256", "--worker-capture", "--worker-capture-sha256"];
  requiredReferences["read-assessment-review"] = [...requiredReferences["collect-assessment-review-target"], "--reviewer-capture", "--reviewer-capture-sha256"];
  for (const name of finalPublicationCommands) requiredReferences[name] = [...requiredReferences["read-candidate-review"], "--authority", "--authority-sha256"];
  requiredReferences.resume.push("--journal-directory");
  for (const name of closureEffectCommands) requiredReferences[name] = [...requiredReferences["read-closure-review"], "--authority", "--authority-sha256"];
  requiredReferences["resume-closure"].push("--journal-directory");
  for (const name of recoveryCommands) requiredReferences[name] = ["--cache-root", "--entry", "--journal-directory", "--selection", "--selection-sha256", ...(name === "inspect-recovery" ? [] : ["--authority", "--authority-sha256"])];
  for (const name of retainedCommands) requiredReferences[name] = ["--operation-id"];
  if (values.has("--coordination") !== values.has("--coordination-sha256")) throw Error("Coordinated selection path and digest are required together");
  const missing = (requiredReferences[command] ?? []).filter(flag => !values.has(flag));
  if (missing.length) throw Error(command + " requires " + missing.join(", "));
  const entry = values.get("--entry");
  if (["trial-bindings", "prepare-trial-fixture"].includes(command) && entry !== undefined
    && !PUBLISHER_ENTRIES.some(known => known === entry)) throw Error("Unknown trial publisher entry");
  return { command, repo, source, artifacts, operation: values.get("--operation-id"), cache: values.get("--cache-root"), entry: values.get("--entry"),
    launcher: values.get("--launcher"), settings: values.get("--settings"), definition: values.get("--trial-definition"),
    selection: values.get("--selection"), selection_sha256: values.get("--selection-sha256"), candidate_repo: values.get("--candidate-repo"), candidate: values.get("--candidate"), resolution_record: values.get("--resolution-record"), resolution_sha256: values.get("--resolution-sha256"), verification: values.get("--verification"), verification_sha256: values.get("--verification-sha256"),
    source_verification: values.get("--source-verification"), source_verification_sha256: values.get("--source-verification-sha256"),
    coordination: values.get("--coordination"), coordination_sha256: values.get("--coordination-sha256"),
    assessment: values.get("--assessment"), assessment_sha256: values.get("--assessment-sha256"),
    candidate_verification: values.get("--candidate-verification"), candidate_verification_sha256: values.get("--candidate-verification-sha256"),
    decisions: values.get("--decisions"), decisions_sha256: values.get("--decisions-sha256"),
    authority: values.get("--authority"), authority_sha256: values.get("--authority-sha256"), journal_directory: values.get("--journal-directory"),
    reviewer_capture: values.get("--reviewer-capture"), reviewer_capture_sha256: values.get("--reviewer-capture-sha256"),
    worker_capture: values.get("--worker-capture"), worker_capture_sha256: values.get("--worker-capture-sha256") };
}

function nativeCredential(hostname: string): string {
  return (hostname === "github.com" || hostname.endsWith(".ghe.com") ? process.env.GH_TOKEN : process.env.GH_ENTERPRISE_TOKEN) ?? "";
}

function nativeContext(repo: string, source: string) {
  const { settings } = loadCommittedSettings(repo, source);
  return readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: nativeCredential(settings.hostname) });
}

function privateArtifacts(path: string | undefined, repo: string) {
  if (!path) throw Error("command requires artifact-root");
  const requested = resolve(path), root = externalArtifactDirectory(requested, repo);
  const stat = lstatSync(requested), owner = process.getuid?.();
  if (owner === undefined || root !== requested || !stat.isDirectory() || stat.isSymbolicLink()
    || stat.uid !== owner || (stat.mode & 0o077) !== 0) throw Error("command requires a private owned external artifact directory");
  return { root, owner: "uid-" + owner };
}

function failureDiagnostics(error: unknown, code: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [], seen = new Set<unknown>();
  function visit(value: unknown): void {
    if (seen.has(value)) return;
    seen.add(value);
    diagnostics.push({ code, message: value instanceof Error ? value.message : "Command input or setup unavailable" });
    if (value instanceof AggregateError) for (const member of value.errors) visit(member);
    if (value instanceof Error && value.cause !== undefined) visit(value.cause);
  }
  visit(error);
  return diagnostics;
}

/** Technical collection feeds the controller's separate semantic decisions and effect grants. */
export async function main(argv: string[]): Promise<number> {
  if (argv.includes("--run-dir")) return runDirectoryMain(argv);
  if (argv.length === 1 && ["--help", "help"].includes(argv[0])) { writeSync(1, usage); return 0; }
  let report: CLIReport;
  try {
    const options = argumentsForCommand(argv), repo = realpathSync(options.repo);
    if (retainedCommands.includes(options.command)) {
      const artifacts = privateArtifacts(options.artifacts, repo), { settings } = loadCommittedSettings(repo, options.source);
      report = await collectNativeRetained({ repo, source: options.source, artifact_root: artifacts.root,
        operation_id: options.operation!, owner: artifacts.owner, run: randomUUID(), credential: nativeCredential(settings.hostname),
        ...(options.command === "restore-retained" ? { restore: true as const } : {}) });
    } else if (recoveryCommands.includes(options.command)) {
      const artifacts = privateArtifacts(options.artifacts, repo), entry = options.entry;
      if (entry !== "hosted" && entry !== "copilot" && entry !== "claude") throw Error("Recovery requires a retained entry selection");
      const bytes = readBoundArtifact({ source_repo: repo, artifact_root: artifacts.root,
        reference: { path: options.selection, sha256: options.selection_sha256 } });
      const selection: unknown = JSON.parse(decodeUTF8(bytes));
      if (!canonicalJSON(selection).equals(bytes)) throw Error("Invalid canonical recovery selection JSON");
      const { settings } = loadCommittedSettings(repo, options.source);
      const input: Parameters<typeof inspectRecovery>[0] = { repo, source: options.source, artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID(),
        credential: nativeCredential(settings.hostname), cache_directory: resolve(options.cache!), entry,
        journal_directory: resolve(options.journal_directory!), selection };
      if (options.command === "inspect-recovery") {
        report = recoveryInspectionOutput(await inspectRecovery(input), options.source);
      } else {
        const recovery_effects = await applyRecovery({ ...input,
          purpose: options.command === "acknowledge-delivery" ? "acknowledgement" : "reconciliation",
          authority: { path: options.authority, sha256: options.authority_sha256 } });
        report = recoveryEffectsOutput({ command: options.command, source: options.source, result: recovery_effects,
          outcome: publicationOutcome(recovery_effects.state), limit: Math.min(OUTPUT_LIMIT, settings.reports.max_entry_bytes) });
      }
    } else if (selectionCommands.includes(options.command)) {
      const artifacts = privateArtifacts(options.artifacts, repo);
      let candidate: { repo: string; commit: string } | null = null;
      if (candidateCommands.includes(options.command)) {
        if (!options.candidate_repo || !options.candidate) throw Error("candidate inspection requires candidate-repo and candidate");
        candidate = { repo: realpathSync(options.candidate_repo), commit: options.candidate };
        artifactDirectoryScope(artifacts.root, candidate.repo).assertExternal(join(artifacts.root, protocolPath(options.selection)));
      }
      const bytes = readBoundArtifact({ source_repo: repo, artifact_root: artifacts.root,
        reference: { path: options.selection, sha256: options.selection_sha256 } });
      let selection: unknown;
      try {
        selection = JSON.parse(decodeUTF8(bytes));
        if (!canonicalJSON(selection).equals(bytes)) throw Error("noncanonical selection");
      } catch { throw Error("invalid canonical selection JSON"); }
      const protection_context = coordinationCommands.includes(options.command) ? { coordinated: readCoordinatedSelection({ repo,
        source: options.source, artifact_root: artifacts.root, candidate_repo: candidate?.repo, selection,
        reference: options.coordination === undefined ? undefined : { path: options.coordination, sha256: options.coordination_sha256 } }) } : undefined;
      if (candidate) {
        if ((options.resolution_record === undefined) !== (options.resolution_sha256 === undefined)) throw Error("resolution record path and digest are required together");
        const resolution = options.resolution_record !== undefined && options.resolution_sha256 !== undefined
          ? { path: options.resolution_record, sha256: options.resolution_sha256 } : undefined;
        if (["collect-publication-inputs", ...publicationCommands].includes(options.command)) {
          const entry = options.entry;
          if ((entry !== "hosted" && entry !== "copilot" && entry !== "claude") || !options.cache || !options.launcher || !options.settings)
            throw Error("publication input collection requires cache-root, entry, launcher and settings");
          const { settings } = loadCommittedSettings(repo, options.source);
          const input: Parameters<typeof collectPublicationInputs>[0] = { repo, source: options.source, selection, candidate_repo: candidate.repo, candidate: candidate.commit,
            resolution_record: resolution, protection_context, artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID(), credential: nativeCredential(settings.hostname),
            cache_directory: resolve(options.cache), entry, launcher_path: resolve(options.launcher), settings_path: resolve(options.settings) };
          if (finalPublicationCommands.includes(options.command)) {
            const publication = { ...input,
              source_verification: { path: options.source_verification, sha256: options.source_verification_sha256 },
              candidate_verification: { path: options.candidate_verification, sha256: options.candidate_verification_sha256 },
              decisions: { path: options.decisions, sha256: options.decisions_sha256 },
              worker_capture: { path: options.worker_capture, sha256: options.worker_capture_sha256 },
              reviewer_capture: { path: options.reviewer_capture, sha256: options.reviewer_capture_sha256 },
              authority: { path: options.authority, sha256: options.authority_sha256 } };
            if (options.command === "check-publication") {
              const publication_check = await checkPublication(publication);
              report = { schema_version: 1, command: options.command, outcome: publication_check.complete ? "collected" : "incomplete",
                source_commit: options.source, publication_check, diagnostics: publication_check.diagnostics.map(message => ({ code: "publication-check", message })) };
            } else {
              const publication_effects = options.command === "resume"
                ? await resumePublication({ ...publication, journal_directory: resolve(options.journal_directory!) })
                : await publishPublication(publication);
              report = publicationEffectsOutput({ command: options.command, source: options.source, result: publication_effects,
                outcome: publicationOutcome(publication_effects.state), limit: Math.min(OUTPUT_LIMIT, settings.reports.max_entry_bytes) });
            }
          } else if (options.command === "read-candidate-review") {
            const candidate_review = await collectCandidateReview({ ...input,
              source_verification: { path: options.source_verification, sha256: options.source_verification_sha256 },
              candidate_verification: { path: options.candidate_verification, sha256: options.candidate_verification_sha256 },
              decisions: { path: options.decisions, sha256: options.decisions_sha256 },
              worker_capture: { path: options.worker_capture, sha256: options.worker_capture_sha256 },
              reviewer_capture: { path: options.reviewer_capture, sha256: options.reviewer_capture_sha256 } });
            report = { schema_version: 1, command: options.command, outcome: candidate_review.complete ? "collected" : "incomplete",
              source_commit: options.source, candidate_review, diagnostics: candidate_review.diagnostics.map(message => ({ code: "candidate-review", message })) };
          } else if (options.command === "collect-review-target") {
            const review_target = await collectReviewTarget({ ...input,
              source_verification: { path: options.source_verification, sha256: options.source_verification_sha256 },
              candidate_verification: { path: options.candidate_verification, sha256: options.candidate_verification_sha256 },
              decisions: { path: options.decisions, sha256: options.decisions_sha256 },
              worker_capture: { path: options.worker_capture, sha256: options.worker_capture_sha256 } });
            report = { schema_version: 1, command: options.command, outcome: review_target.complete ? "collected" : "incomplete",
              source_commit: options.source, review_target, diagnostics: review_target.diagnostics.map(message => ({ code: "review-target", message })) };
          } else if (options.command === "bind-publication") {
            const publication_bindings = await collectPublicationBindings({ ...input,
              source_verification: { path: options.source_verification, sha256: options.source_verification_sha256 },
              candidate_verification: { path: options.candidate_verification, sha256: options.candidate_verification_sha256 },
              decisions: { path: options.decisions, sha256: options.decisions_sha256 } });
            report = { schema_version: 1, command: options.command, outcome: publication_bindings.complete ? "collected" : "incomplete",
              source_commit: options.source, publication_bindings, diagnostics: publication_bindings.diagnostics.map(message => ({ code: "publication-bindings", message })) };
          } else {
            const publication_inputs = await collectPublicationInputs(input);
            report = { schema_version: 1, command: options.command, outcome: publication_inputs.complete ? "collected" : "incomplete",
              source_commit: options.source, publication_inputs, diagnostics: publication_inputs.diagnostics.map(message => ({ code: "publication-inputs", message })) };
          }
        } else if (options.command === "verify-candidate") {
          const verification = await verifyCandidate({ repo, source: options.source, selection, candidate_repo: candidate.repo, candidate: candidate.commit,
            resolution_record: resolution, protection_context, artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID() });
          report = { schema_version: 1, command: options.command, outcome: verification.complete ? "collected" : "incomplete",
            source_commit: options.source, verification, diagnostics: verification.diagnostics.map(message => ({ code: "candidate-verification", message })) };
        } else if (options.command === "check-verification") {
          const verification = readCandidateVerificationArtifacts({ repo, source: options.source, selection, candidate_repo: candidate.repo, candidate: candidate.commit,
            resolution_record: resolution, protection_context, artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID(),
            reference: { path: options.verification, sha256: options.verification_sha256 } });
          report = { schema_version: 1, command: options.command, outcome: "collected", source_commit: options.source, verification, diagnostics: [] };
        } else {
          const candidate_inspection = inspectCandidate({ repo, source: options.source, selection, candidate_repo: candidate.repo, candidate: candidate.commit, resolution_record: resolution,
            protection_context, artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID() });
          report = { schema_version: 1, command: options.command, outcome: candidate_inspection.complete ? "collected" : "incomplete",
            source_commit: options.source, candidate_inspection, diagnostics: candidate_inspection.diagnostics.map(message => ({ code: "candidate-inspection", message })) };
        }
      } else if (closureRoleCommands.includes(options.command)) {
        if (!options.cache || !options.launcher || !options.settings || !["hosted", "copilot", "claude"].includes(options.entry ?? ""))
          throw Error("Closure roles require their selected retained entry and cache");
        const settings = loadCommittedSettings(repo, options.source).settings;
        const common = { repo, source: options.source, selection, artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID(),
          credential: nativeCredential(settings.hostname), cache_directory: resolve(options.cache), entry: options.entry as "hosted" | "copilot" | "claude",
          launcher_path: resolve(options.launcher), settings_path: resolve(options.settings) };
        const base = { schema_version: 1 as const, command: options.command, source_commit: options.source };
        const observationScope = { hostname: settings.hostname, repository: settings.repository, credential: common.credential };
        if (closureEffectCommands.includes(options.command)) {
          const reviewed = { ...common, worker_capture: { path: options.worker_capture, sha256: options.worker_capture_sha256 },
            reviewer_capture: { path: options.reviewer_capture, sha256: options.reviewer_capture_sha256 },
            authority: { path: options.authority, sha256: options.authority_sha256 } };
          if (options.command === "check-closure-publication") {
            const value = await checkClosurePublication(reviewed);
            report = { ...base, outcome: value.complete ? "collected" : "incomplete", closure_publication_check: value,
              diagnostics: value.diagnostics.map(message => ({ code: "closure-publication-check", message })) };
          } else {
            const value = options.command === "publish-closure" ? await publishClosure(reviewed)
              : await resumeClosure({ ...reviewed, journal_directory: options.journal_directory! });
            report = publicationEffectsOutput({ command: options.command, source: options.source, outcome: publicationOutcome(value.state),
              result: value, limit: Math.min(OUTPUT_LIMIT, settings.reports.max_entry_bytes) });
          }
        } else if (options.command === "collect-closure-worker-inputs") {
          const value = await withNativeObservation(observationScope, observation => collectClosureWorkerInputs({ ...common, observation }));
          report = { ...base, outcome: value.complete ? "collected" : "incomplete", closure_worker_inputs: value,
            diagnostics: value.diagnostics.map(message => ({ code: "closure-worker-inputs", message })) };
        } else if (options.command === "collect-closure-review-target") {
          const value = await withNativeObservation(observationScope, observation => collectClosureReviewTarget({ ...common, observation,
            worker_capture: { path: options.worker_capture, sha256: options.worker_capture_sha256 } }));
          report = { ...base, outcome: value.complete ? "collected" : "incomplete", closure_review_target: closureReviewTargetProjection(value),
            diagnostics: value.diagnostics.map(message => ({ code: "closure-review-target", message })) };
        } else {
          const value = await withNativeObservation(observationScope, observation => collectClosureReview({ ...common, observation,
            worker_capture: { path: options.worker_capture, sha256: options.worker_capture_sha256 },
            reviewer_capture: { path: options.reviewer_capture, sha256: options.reviewer_capture_sha256 } }));
          report = { ...base, outcome: value.complete ? "collected" : "incomplete", closure_review: closureReviewProjection(value),
            diagnostics: value.diagnostics.map(message => ({ code: "closure-review", message })) };
        }
        if (Buffer.byteLength(JSON.stringify(report) + "\n") > Math.min(OUTPUT_LIMIT, settings.reports.max_entry_bytes))
          throw Error("Closure role report exceeds the configured output bound");
      } else if (["collect-resolution", "collect-closure", "collect-closure-target"].includes(options.command)) {
        const settings = loadCommittedSettings(repo, options.source).settings;
        const input = { repo, source: options.source, selection, artifact_root: artifacts.root, owner: artifacts.owner,
          run: randomUUID(), credential: nativeCredential(settings.hostname) };
        if (options.command === "collect-closure-target") {
          report = closureTargetOutput(await collectNativeClosureTarget(input), options.source);
        } else if (options.command === "collect-closure") {
          const closure = await collectNativeClosure(input);
          report = { schema_version: 1, command: options.command, outcome: closure.complete ? "collected" : "incomplete",
            diagnostics: closure.diagnostics.map(message => ({ code: "closure-collection", message })),
            source_commit: options.source, closure };
        } else {
          const resolution = await collectNativeResolution(input);
          report = { schema_version: 1, command: options.command, outcome: resolution.complete ? "collected" : "incomplete",
            diagnostics: resolution.diagnostics.map(message => ({ code: "resolution-collection", message })),
            source_commit: options.source, resolution };
        }
      } else if (options.command === "prepare") {
        const prepared = await prepareEdits({ repo, source: options.source, selection, protection_context, artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID() });
        report = { schema_version: 1, command: options.command, outcome: prepared.state === "incomplete" ? "incomplete" : "collected",
          source_commit: options.source, diagnostics: prepared.diagnostics.map(message => ({ code: "preparation", message })), prepared };
      } else {
        const edit_inspection = inspectPreparation({ repo, source: options.source, selection, protection_context });
        const protection = edit_inspection.protection?.diagnostics ?? [], protectionMessages = new Set(protection.map(item => item.message));
        report = { schema_version: 1, command: options.command, outcome: edit_inspection.complete ? "collected" : "incomplete",
          source_commit: options.source, diagnostics: [...protection, ...edit_inspection.diagnostics.filter(message => !protectionMessages.has(message)).map(message => ({ code: "edit-inspection", message }))], edit_inspection };
      }
    } else if ([...originalInputCommands, ...auditSessionCommands, ...assessmentReviewCommands, "collect-worker-inputs", "read-worker-preparation"].includes(options.command)) {
      const artifacts = privateArtifacts(options.artifacts, repo), entry = options.entry;
      if ((entry !== "hosted" && entry !== "copilot" && entry !== "claude") || !options.cache || !options.launcher || !options.settings)
        throw Error("worker input collection requires cache-root, entry, launcher and settings");
      const { settings } = loadCommittedSettings(repo, options.source);
      const input: WorkerCollectionOptions = { repo, source: options.source, artifact_root: artifacts.root, owner: artifacts.owner,
        run: [...historyCommands, ...auditSessionCommands].includes(options.command) && entry === "hosted" ? process.env.GITHUB_RUN_ID ?? "" : randomUUID(),
        credential: nativeCredential(settings.hostname), cache_directory: resolve(options.cache), entry, launcher_path: resolve(options.launcher), settings_path: resolve(options.settings),
        source_verification: { path: options.source_verification, sha256: options.source_verification_sha256 },
        decisions: { path: options.decisions, sha256: options.decisions_sha256 } };
      if (options.command === "run-audit") {
        const attempt = process.env.GITHUB_RUN_ATTEMPT;
        const session = await runAuditSession({ ...input, environment: process.env,
          hosted_run_attempt: entry === "hosted" && attempt !== undefined && /^[1-9][0-9]*$/u.test(attempt) ? Number(attempt) : undefined });
        const persist = entry === "hosted" ? persistHostedAuditOutput
          : settings.reports.interactive === "local-attestation" ? persistLocalAuditOutput : persistAuditOutput;
        const saved = persist({ repo, source: options.source, artifact_root: artifacts.root, session });
        report = auditSessionOutput(session, Math.min(OUTPUT_LIMIT, settings.reports.max_entry_bytes), saved);
      } else if (options.command === "collect-audit-proposal-inputs") {
        report = auditProposalInputsOutput(await collectAuditProposalInputs(input));
      } else if (historyCommands.includes(options.command)) {
        const attempt = process.env.GITHUB_RUN_ATTEMPT;
        report = historyCollectionOutput(await collectNativeReportHistory({ ...input,
          hosted_run_attempt: entry === "hosted" && attempt !== undefined && /^[1-9][0-9]*$/u.test(attempt) ? Number(attempt) : undefined }));
      } else if (assessmentReviewCommands.includes(options.command)) {
        const original = { ...input, worker_capture: { path: options.worker_capture, sha256: options.worker_capture_sha256 } };
        report = options.command === "collect-assessment-review-target"
          ? assessmentReviewOutput("collect-assessment-review-target", await collectAssessmentReviewTarget(original))
          : assessmentReviewOutput("read-assessment-review", await collectAssessmentReview({ ...original,
            reviewer_capture: { path: options.reviewer_capture, sha256: options.reviewer_capture_sha256 } }));
      } else if (options.command === "read-worker-preparation") {
        const worker_preparation = await collectWorkerPreparation({ ...input, worker_capture: { path: options.worker_capture, sha256: options.worker_capture_sha256 } });
        report = { schema_version: 1, command: options.command, outcome: worker_preparation.complete ? "collected" : "incomplete", source_commit: options.source,
          worker_preparation, diagnostics: worker_preparation.diagnostics.map(message => ({ code: "worker-preparation", message })) };
      } else {
        const worker_inputs = await collectWorkerInputs(input);
        report = { schema_version: 1, command: options.command, outcome: worker_inputs.complete ? "collected" : "incomplete", source_commit: options.source,
          worker_inputs, diagnostics: worker_inputs.diagnostics.map(message => ({ code: "worker-inputs", message })) };
      }
    } else if (options.command === "report-findings") {
      const artifacts = privateArtifacts(options.artifacts, repo);
      const assessment_report = readAssessmentReport({ repo, source: options.source, artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID(),
        source_verification: { path: options.source_verification, sha256: options.source_verification_sha256 },
        assessment: { path: options.assessment, sha256: options.assessment_sha256 } });
      report = assessmentReportOutput(assessment_report);
    } else if (options.command === "assess-source") {
      const artifacts = privateArtifacts(options.artifacts, repo);
      const source_assessment = await assessSource({ repo, source: options.source, artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID() });
      report = { schema_version: 1, command: options.command, outcome: source_assessment.complete ? "collected" : "incomplete",
        source_commit: options.source, source_assessment, diagnostics: source_assessment.diagnostics.map(message => ({ code: "source-assessment", message })) };
    } else if (options.command === "trial-bindings") {
      const entry = options.entry as PublisherEntry | undefined;
      const context = entry && entry !== "hosted" ? nativeContext(repo, options.source) : null;
      if (context && context.default_commit !== options.source) throw Error("trial binding source must match the observed current default");
      const trial = collectTrialBindings({ repo, current_default: options.source, entry, ...(context ? { identity: context.identity } : {}) });
      report = { schema_version: 1, command: options.command, outcome: "collected", source_commit: options.source, diagnostics: [], trial };
    } else if (options.command === "check-upgrade-signals") {
      const signals = checkUpgradeSignals({ repo, source: options.source });
      report = { schema_version: 1, command: options.command, outcome: signals.matches === false ? "attention" : "collected",
        source_commit: options.source, diagnostics: [], signals };
    } else if (options.command === "collect-proposals") {
      const context = nativeContext(repo, options.source);
      if (context.default_commit !== options.source) throw Error("proposal collection source must match the observed current default");
      const { settings } = loadCommittedSettings(repo, options.source), proposals = collectProposals(context.repository, settings);
      report = { schema_version: 1, command: options.command, outcome: proposals.complete ? "collected" : "incomplete", source_commit: options.source,
        diagnostics: proposals.diagnostics.map(message => ({ code: "proposal-collection", message })), proposals };
    } else if (options.command === "inspect-runtime") {
      const entry = options.entry;
      if ((entry !== "hosted" && entry !== "copilot" && entry !== "claude") || !options.cache || !options.launcher || !options.settings)
        throw Error("runtime inspection requires cache-root, entry, launcher and settings");
      if (options.definition !== undefined && !/^[a-f0-9]{64}$/u.test(options.definition)) throw Error("runtime inspection requires a full trial definition digest");
      const context = nativeContext(repo, options.source);
      if (context.default_commit !== options.source) throw Error("runtime inspection source must match the observed current default");
      const selection: Parameters<typeof selectApprovedRuntime>[0] = { repo, current_default: options.source, identity: context.identity, cache_directory: resolve(options.cache), entry,
        launcher_path: resolve(options.launcher), settings_path: resolve(options.settings) };
      const runtime = options.definition === undefined ? await selectApprovedRuntime(selection)
        : await selectCandidateRuntime({ ...selection, definition_sha256: options.definition });
      report = { schema_version: 1, command: options.command, outcome: "collected", source_commit: options.source, diagnostics: [], runtime };
    } else if (options.command === "prepare-trial-fixture") {
      const artifacts = privateArtifacts(options.artifacts, repo), context = nativeContext(repo, options.source);
      if (context.default_commit !== options.source) throw Error("trial preparation source must match the observed current default");
      const preparation = prepareTrialFixture({ repo, current_default: options.source, identity: context.identity, entry: options.entry as PublisherEntry | undefined, directory: artifacts.root });
      report = { schema_version: 1, command: options.command, outcome: "collected", source_commit: options.source, diagnostics: [], preparation };
    } else {
      const artifacts = privateArtifacts(options.artifacts, repo);
      const snapshot = captureSnapshot(repo, options.source);
      const assessment = await runScan(snapshot, { artifact_root: artifacts.root, owner: artifacts.owner, run: randomUUID() });
      report = { schema_version: 1, command: "scan", outcome: assessment.complete ? "collected" : "incomplete",
        source_commit: snapshot.source_commit, settings_sha256: snapshot.settings_sha256,
        bindings_sha256: snapshot.protocol.sha256, diagnostics: assessment.diagnostics, assessment };
    }
  } catch (error) {
    report = { schema_version: 1, command: argv[0] ?? "", outcome: "incomplete", diagnostics: failureDiagnostics(error, argv[0] === "scan" ? "scan-setup-or-input" : "command-setup-or-input"),
      ...(error instanceof PreparationEvidenceError ? { retained_resources: { checkout: error.checkout, record_path: error.record_path } } : {}) };
  }
  writeSync(1, JSON.stringify(report) + "\n");
  return report.outcome === "incomplete" ? 2 : report.outcome === "attention" ? 1 : 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
