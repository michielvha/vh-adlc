import { afterEach, expect, test } from "bun:test";
import { readFileSync, readdirSync, lstatSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { checkBatch, batchJournalDigest, renderRecord, type Definition } from "../../../plugins/vh-adlc/scripts/audit/batch";
import { captureSnapshot, digest } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { createRun, intent, handoff, reconcilePolicy } from "../../../plugins/vh-adlc/scripts/audit/journal";
import { cleanupPending } from "../../../plugins/vh-adlc/scripts/audit/recovery";
import { fixture, git } from "./fixtures";
import { terminal } from "./evidence";
import { createLedgerCandidate } from "../../../plugins/vh-adlc/scripts/audit/ledger";
const projects: ReturnType<typeof fixture>[] = [];
function context(carry = false, allAssessment = false, priorLedger = false, checkNames = ["unit"], defaultBranch = "main", indexBeforeFreeze=false, oldPolicyRun=false) {
  const f = fixture(); projects.push(f);
  let pendingPolicyRun:ReturnType<typeof createRun>|undefined;
  if(oldPolicyRun){
    const policy=readFileSync(join(f.root,"audit-project.md"),"utf8");f.write("audit-project.md","# Earlier cleanup policy\n");f.commit();
    pendingPolicyRun=createRun(loadSettings(f.root),{artifact_root:f.artifacts,run_id:"earlier-policy",batch_digest:"c".repeat(64)});
    intent(pendingPolicyRun,{id:"key",kind:"key",correlation:"owned-key",target:"dev:slot",actor:"actor",organization:"org",cleanup_method:"#cleanup"});
    f.write("audit-project.md",policy);f.commit();
  }
  const config = loadSettings(f.root), base = git(f.root, "rev-parse", "HEAD");
  git(f.root, "update-ref", "refs/remotes/origin/main", base); git(f.root, "switch", "-qc", "fix/audit-batch");
  let taskBase = base, carried: Definition["carried"] = null;
  if (carry) {
    const snapshot = captureSnapshot(config, { mode: "reverify", ids: ["AUD-001", "AUD-002"], baseline: base, artifact_root: f.artifacts,
      required_checks: { "AUD-001": checkNames, "AUD-002": checkNames } });
    const document = { schema_version: 1, snapshot_digest: snapshot.digest, assessments: snapshot.selected_ids.map(id => terminal(f, snapshot, id)) };
    const candidate = createLedgerCandidate(config, snapshot, { document, at: "2026-11-02", run_id: "carried-ledger" });
    f.write(config.ledger_path, candidate.bytes); taskBase = f.commit("test: private ledger report");
    carried = { commit: taskBase, ids: snapshot.selected_ids, paths: [config.ledger_path], report_snapshot_digest: snapshot.digest,
      evidence_artifact: f.artifact("carried-report.json", JSON.stringify({ snapshot, document, candidate })) };
  }
  if (priorLedger) f.write(config.ledger_path, readFileSync(join(f.root, config.ledger_path), "utf8") + "\n### AUD-099 - Unapproved before freeze\nUnchecked source metadata.\n");
  // Actual disposable regression execution is retained separately by the model trial; these unit records are structural attestations.
  if(indexBeforeFreeze)f.write("docs/internal/README.md","# Internal docs\n\n| Audit record | Bounded audit repair evidence |\n");
  if (!allAssessment) f.write("src/app.ts", "export const answer = 43;\n"); const repaired = allAssessment ? taskBase : f.commit("test: authored fixture repair");
  const path = "docs/internal/maintenance/audit-A-test.md";
  const definition: Definition = { schema_version: 1, repository: config.repository, hostname: config.hostname, default_branch: defaultBranch, run_id: "batch-test", workstream: "A",
    scope_baseline: base, task_base: taskBase, source_target: repaired, ledger_path: config.ledger_path, record_path: path,
    affected_paths: ["src/app.ts", config.ledger_path, path,...(indexBeforeFreeze?["docs/internal/README.md"]:[])], verification_inputs: ["src/app.ts",...(indexBeforeFreeze?["docs/internal/README.md"]:[])],
    members: ["AUD-001", "AUD-002"].map((id, i) => ({ id, disposition: i === 0 && !allAssessment ? "authored-repair" : "assessment-only", contract: "Existing documented return-value contract.", eligibility: "restoration", required_checks: checkNames, ...(i === 0 && !allAssessment ? { pre_fix: taskBase, repair_commit: repaired } : {}) })),
    carried };
  const sourceSnapshot = captureSnapshot(config, { mode: "fix", ids: ["AUD-001", "AUD-002"], baseline: base, scope_baseline: base, artifact_root: f.artifacts, required_checks: { "AUD-001": checkNames, "AUD-002": checkNames } });
  const sourceRows = sourceSnapshot.selected_ids.map(id => terminal(f, sourceSnapshot, id));
  sourceRows[0].disposition = allAssessment ? "assessment-only" : "authored-repair";
  if (!allAssessment) sourceRows[0].red = { ...sourceRows[0].checks[0], commit: taskBase, exit_code: 1, artifact: f.artifact("source-red.txt") };
  const sourceDocument = { schema_version: 1, snapshot_digest: sourceSnapshot.digest, assessments: sourceRows };
  const candidate = createLedgerCandidate(config, sourceSnapshot, { document: sourceDocument, at: "2026-11-02", run_id: "batch-test", provisional: true });
  const provisional = { snapshot: sourceSnapshot, document: sourceDocument, candidate };
  f.write(path, renderRecord(definition)); f.write(config.ledger_path, candidate.bytes);
  const target = f.commit("test: finalize fixture ledger and record");
  const snapshot = captureSnapshot(config, { mode: "fix", ids: ["AUD-001", "AUD-002"], baseline: base, scope_baseline: base, artifact_root: f.artifacts, required_checks: { "AUD-001": checkNames, "AUD-002": checkNames } });
  const rows = snapshot.selected_ids.map(id => terminal(f, snapshot, id)); rows[0].disposition = allAssessment ? "assessment-only" : "authored-repair";
  if (!allAssessment) rows[0].red = { ...rows[0].checks[0], commit: taskBase, exit_code: 1, artifact: f.artifact("red.txt") };
  rows[0].batch_review = { producer: "author", reviewer: "independent", result: "NO FINDINGS", source_commit: target, artifact: f.artifact("review.txt", "MODEL: claude-opus-5.5\nNO FINDINGS\n") };
  const input = { record_path: path, review_target: target, snapshot, provisional, document: { schema_version: 1, snapshot_digest: snapshot.digest, assessments: rows },
    journal: { directory: "", batch_digest: "" },
    selection: { ids: ["AUD-001", "AUD-002"], workstream: "A", carried },
    review: { target, producer: "author", reviewer: "independent", artifact: rows[0].batch_review.artifact, model: "claude-opus-5.5" } };
  const run = createRun(config, { artifact_root: f.artifacts, run_id: definition.run_id, batch_digest: digest({ repository: definition.repository, hostname: definition.hostname, run_id: definition.run_id,
    workstream: definition.workstream, default_branch: definition.default_branch, scope_baseline: definition.scope_baseline, task_base: definition.task_base,
    ids: definition.members.map(member => member.id).sort(), carried: definition.carried ? { commit: definition.carried.commit, ids: definition.carried.ids.slice().sort() } : null }) });
  Object.assign(input, { journal: { directory: run.directory, batch_digest: run.header.batch_digest } });
  return { f, config, definition, input, base, target, path, run, pendingPolicyRun, observe: () => ({ default_branch: "main", default_commit: git(f.root, "rev-parse", "refs/remotes/origin/main") }) };
}
function retarget(c: ReturnType<typeof context>) {
  const target = git(c.f.root, "rev-parse", "HEAD"), previous = c.input.document.assessments;
  const snapshot = captureSnapshot(c.config, { mode: "fix", ids: ["AUD-001", "AUD-002"], baseline: c.base, scope_baseline: c.base, artifact_root: c.f.artifacts, required_checks: { "AUD-001": ["unit"], "AUD-002": ["unit"] } });
  const rows = snapshot.selected_ids.map(id => terminal(c.f, snapshot, id));
  rows.forEach((row, i) => { row.disposition = previous[i].disposition; if (row.disposition === "authored-repair") {
    row.red = previous[i].red; row.batch_review = { ...previous[i].batch_review!, source_commit: target };
  } });
  c.input.review_target = target; c.input.review.target = target; c.input.snapshot = snapshot;
  c.input.document = { schema_version: 1, snapshot_digest: snapshot.digest, assessments: rows };
}
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
test("a fully covered mixed batch checks the full scope and frozen source without SHA self-reference", () => {
  const c = context(), result = checkBatch(c.config, c.input, { observe: c.observe });
  expect(result.pass).toBe(true); expect(result.publication_base).toBe(c.base); expect(result.repair_batch).toBe(true);
});
test.each(["missing-member", "missing-contract", "missing-challenge", "one-check-only", "unresolved", "new-contract", "wrong-review", "changed-ledger", "changed-definition", "source-after-freeze", "pre-fix-source"])("%s blocks whole batch completion", kind => {
  const c = context();
  if (kind === "missing-member") c.input.document.assessments.pop();
  if (kind === "missing-challenge") c.input.document.assessments[1].challenge = null;
  if (kind === "one-check-only") c.input.document.assessments[0].checks = [];
  if (kind === "unresolved") { c.input.document.assessments[1].verdict = "UNKNOWN"; c.input.document.assessments[1].residuals = ["Cannot reproduce under available access."]; }
  if (kind === "wrong-review") c.input.review.target = c.base;
  if (kind === "changed-ledger") { c.f.write("docs/audit.md", "Rewritten ledger\n"); c.f.commit(); }
  if (["missing-contract", "new-contract", "changed-definition", "pre-fix-source"].includes(kind)) {
    if (kind === "missing-contract") c.definition.members[0].contract = "";
    if (kind === "new-contract") c.definition.members[0].eligibility = "feature-required";
    if (kind === "changed-definition") c.definition.members.pop();
    if (kind === "pre-fix-source") c.definition.source_target = c.base;
    c.f.write(c.path, renderRecord(c.definition)); c.f.commit();
  }
  if (kind === "source-after-freeze") { c.f.write("src/app.ts", "export const answer = 44;\n"); c.f.commit(); }
  expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(false);
});
test("append-only record evidence/review/state bookkeeping preserves freshness but rewriting evidence does not", () => {
  const c = context(), record = readFileSync(join(c.f.root, c.path), "utf8");
  c.f.write(c.path, record + "\nObserved final review outcome.\n"); c.f.commit("test: append state evidence");
  expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(true);
  c.f.write(c.path, record.replace("review pending", "rewritten history")); c.f.commit();
  expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(false);
});
test("scope baseline survives a squash while the discarded pre-squash source target is not used as the delta baseline", () => {
  const c = context(); git(c.f.root, "switch", "-q", "main"); git(c.f.root, "merge", "--squash", "fix/audit-batch"); const squash = c.f.commit("test: squash batch");
  git(c.f.root, "branch", "-D", "fix/audit-batch"); // Disposable fixture only, to simulate hosted squash branch deletion.
  const snap = captureSnapshot(loadSettings(c.f.root), { mode: "reverify", artifact_root: c.f.artifacts, baseline: c.base });
  expect(snap.history.status).toBe("scoped"); expect(snap.source.commit).toBe(squash);
  expect(captureSnapshot(loadSettings(c.f.root), { mode: "reverify", artifact_root: c.f.artifacts, baseline: c.target }).history.status).toBe("unscoped");
});

test("a stale default tracking tip cannot supply the recorded scope baseline", () => {
  const c = context();
  git(c.f.root, "update-ref", "refs/remotes/origin/main", c.target);
  git(c.f.root, "update-ref", "refs/remotes/origin/old-feature", c.base);
  expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(false);
});
test("re-reviewed ledger metadata still cannot delete pre-existing finding prose or IDs", () => {
  const c = context(), text = readFileSync(join(c.f.root, "docs/audit.md"), "utf8");
  c.f.write("docs/audit.md", text.replace("The return value needs a current check.\n", "")); c.f.commit(); retarget(c);
  expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(false);
});
test("all-assessment work produces no empty repair publication", () => {
  const c = context(false, true);
  const result = checkBatch(c.config, c.input, { observe: c.observe }); expect(result.pass).toBe(true); expect(result.publish_repair).toBe(false);
});

test("a carried report is reviewed from its default ancestor and requires exact owner inclusion and all original evidence", () => {
  const c = context(true); expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(true);
  c.input.selection.carried = null; expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(false);
});
test("an omitted carried ID or missing member challenge cannot hide behind a structurally valid artifact digest", () => {
  for (const kind of ["id", "challenge"]) {
    const c = context(true), carried = c.definition.carried!;
    const proof = JSON.parse(readFileSync(join(c.f.artifacts, carried.evidence_artifact.path), "utf8"));
    if (kind === "id") proof.document.assessments.pop(); else proof.document.assessments[0].challenge = null;
    carried.evidence_artifact = c.f.artifact("carried-bad.json", JSON.stringify(proof));
    c.input.selection.carried = structuredClone(carried); c.f.write(c.path, renderRecord(c.definition)); c.f.commit(); retarget(c);
    expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(false);
  }
});

test.each(["pre-fix-ledger-source", "missing-ledger-source", "placeholder-ledger-source", "contradictory-verdict", "unchecked-new-id"])("a freshly re-reviewed %s cannot bypass frozen provisional ledger binding", kind => {
  const c = context(); let bytes = readFileSync(join(c.f.root, c.config.ledger_path), "utf8");
  if (kind === "pre-fix-ledger-source") bytes = bytes.replaceAll("Verified source: " + c.definition.source_target, "Verified source: " + c.base);
  if (kind === "missing-ledger-source") bytes = bytes.replace(/^Verified source: .*\n/gm, "");
  if (kind === "placeholder-ledger-source") bytes = bytes.replaceAll("Verified source: " + c.definition.source_target, "Verified source: PLACEHOLDER");
  if (kind === "contradictory-verdict") bytes = bytes.replace(/(\| AUD-001 \| High \| Incorrect result \| )[^|]+/, "$1MOOT ");
  if (kind === "unchecked-new-id") bytes += "\n### AUD-099 - Unchecked finding\nAn unassessed new root cause.\n";
  c.f.write(c.config.ledger_path, bytes); c.f.commit(); retarget(c);
  expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(false);
});

test("an unchecked ledger edit hidden before frozen source cannot become a checked candidate baseline", () => {
  const c = context(false, false, true); expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(false);
});

test("a verbatim clean review may separate its model header and records with a blank line, without admitting other content", () => {
  const c = context(); c.input.review.artifact = c.f.artifact("blank-separated-review.txt", "MODEL: claude-opus-5.5\n\nNO FINDINGS\n");
  expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(true);
  c.input.review.artifact = c.f.artifact("review-footer.txt", "MODEL: claude-opus-5.5\nNO FINDINGS\nAn extra claim.\n"); expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(false);
});

test("even an all-assessment terminal batch must declare nonempty per-member final checks", () => {
  const c = context(false, true, false, []); expect(checkBatch(c.config, c.input, { observe: c.observe }).pass).toBe(false);
});

test("an author-named other branch cannot masquerade as the actual default even at an equal cached tip",()=>{
  const c=context(false,false,false,["unit"],"old-feature");git(c.f.root,"update-ref","refs/remotes/origin/old-feature",c.base);
  expect(checkBatch(c.config,c.input,{observe:c.observe}).pass).toBe(false);
});
test.each(["offline","advanced"])("%s actual remote observation cannot be replaced by a cached default ref",kind=>{
  const c=context(); const observe=()=>{if(kind==="offline")throw Error("synthetic remote unavailable");return {default_branch:"main",default_commit:c.target};};
  expect(checkBatch(c.config,c.input,{observe}).pass).toBe(false);
});

test("pending resource cleanup and a denied handoff block batch completion until absence is reconciled",async()=>{
  const c=context(),scope={target:"synthetic:owned",actor:"actor",organization:"org",cleanup_method:"#cleanup"};
  intent(c.run,{id:"key",kind:"key",correlation:"owned-key",...scope});handoff(c.run,"key","cleanup-permission-denied");
  expect(checkBatch(c.config,c.input,{observe:c.observe}).pass).toBe(false);
  await cleanupPending(c.run,scope,{authorized:true,lookup:async()=>[],cleanup:async()=>{throw Error("nothing exists");}});
  expect(checkBatch(c.config,c.input,{observe:c.observe}).pass).toBe(true);
});


test.each(["missing", "wrong-directory", "wrong-digest"])("a %s resource journal cannot establish batch completion", kind => {
  const c = context();
  if (kind === "missing") delete (c.input as any).journal;
  if (kind === "wrong-directory") c.input.journal.directory += "-another";
  if (kind === "wrong-digest") c.input.journal.batch_digest = "0".repeat(64);
  expect(checkBatch(c.config, c.input, {observe:c.observe}).pass).toBe(false);
});
test("resource journal scope stays stable across source updates but changes with selected scope", () => {
  const c = context(), original = batchJournalDigest(c.definition);
  expect(batchJournalDigest({...c.definition, source_target:"a".repeat(40)})).toBe(original);
  for (const changed of [{run_id:"another"},{workstream:"B"},{default_branch:"another"},{scope_baseline:"a".repeat(40)},
    {task_base:"a".repeat(40)},{members:c.definition.members.slice(1)},{carried:{commit:c.base,ids:["AUD-099"]} as any}])
    expect(batchJournalDigest({...c.definition,...changed})).not.toBe(original);
});


test("a fresh final snapshot root and empty journal cannot hide the original batch's pending key", () => {
  const c=context();intent(c.run,{id:"key",kind:"key",correlation:"owned-key",target:"synthetic:slot",actor:"actor",organization:"org",cleanup_method:"#cleanup"});
  const root=join(c.f.outer,"fresh-final-artifacts");mkdirSync(root,{mode:0o700});
  for(const name of readdirSync(c.f.artifacts))if(lstatSync(join(c.f.artifacts,name)).isFile())copyFileSync(join(c.f.artifacts,name),join(root,name));
  const {digest:_,...body}=c.input.snapshot;const changed={...body,artifact_root:root};c.input.snapshot={...changed,digest:digest(changed)};
  c.input.document.snapshot_digest=c.input.snapshot.digest;
  expect(()=>createRun(c.config,{artifact_root:root,run_id:c.definition.run_id,batch_digest:batchJournalDigest(c.definition)})).toThrow();
  expect(checkBatch(c.config,c.input,{observe:c.observe}).pass).toBe(false);
});


test("completion sees a pre-freeze pending resource from another registered run/root", () => {
  const c=context(),root=join(c.f.outer,"earlier-live-artifacts");mkdirSync(root,{mode:0o700});
  const earlier=createRun(c.config,{artifact_root:root,run_id:"earlier-live",batch_digest:"e".repeat(64)});
  intent(earlier,{id:"key",kind:"key",correlation:"earlier-key",target:"synthetic:slot",actor:"actor",organization:"org",cleanup_method:"#cleanup"});
  expect(checkBatch(c.config,c.input,{observe:c.observe}).pass).toBe(false);
});

test("consumer frontmatter survives the final record and append-only freshness checks",()=>{
 const c=context();const metadata={description:"Bounded audit repair evidence",covers:["src/**"]};
 const text=renderRecord(c.definition,metadata);
 expect(Bun.YAML.parse(text.match(/^---\n([\s\S]*?)\n---/)?.[1]??'')).toEqual(metadata);
 c.f.write(c.path,text);c.f.commit();retarget(c);
 expect(checkBatch(c.config,c.input,{observe:c.observe}).pass).toBe(true);
 c.f.write(c.path,text+"\nObserved completion after review.\n");c.f.commit();
 expect(checkBatch(c.config,c.input,{observe:c.observe}).pass).toBe(true);
 c.f.write(c.path,readFileSync(join(c.f.root,c.path),'utf8').replace(metadata.description,'Changed contract'));c.f.commit();
 expect(checkBatch(c.config,c.input,{observe:c.observe}).pass).toBe(false);
});


test("a generated index frozen with source is allowed but later index changes require a new freeze",()=>{
 const c=context(false,false,false,["unit"],"main",true);
 expect(checkBatch(c.config,c.input,{observe:c.observe}).pass).toBe(true);
 c.f.write("docs/internal/README.md","Changed after source freeze\n");c.f.commit();retarget(c);
 expect(checkBatch(c.config,c.input,{observe:c.observe}).pass).toBe(false);
});


test("a later batch completes after explicit old-policy cleanup reconciliation",async()=>{
 const c=context(false,false,false,["unit"],"main",false,true),old=c.pendingPolicyRun!;
 expect(checkBatch(c.config,c.input,{observe:c.observe}).pass).toBe(false);
 const cleanup=reconcilePolicy(c.config,old.directory,old.header.batch_digest,{owner_approved:true,owner_handoff:"owner:old-policy-cleanup",expected_digest:old.digest,policy_commit:c.base},{observe:c.observe});
 await cleanupPending(cleanup,{target:"dev:slot",actor:"actor",organization:"org",cleanup_method:"#cleanup"},{authorized:true,lookup:async()=>[],cleanup:async()=>{throw Error("already absent resource must not be deleted");}});
 expect(checkBatch(c.config,c.input,{observe:c.observe}).pass).toBe(true);
});


test.each([false,true])("non-forced CI follow-up restores Task-base ledger before refreezing: %s",restore=>{
 const c=context(),previousSource=c.definition.source_target;
 const taskLedger=git(c.f.root,"show",c.definition.task_base+":"+c.config.ledger_path)+"\n";
 c.f.write("src/app.ts","export const answer = 44;\n");
 if(restore)c.f.write(c.config.ledger_path,taskLedger);
 const source=c.f.commit("test: non-forced CI follow-up");
 c.definition.source_target=source;c.definition.members[0].repair_commit=source;
 if(restore){
  const snapshot=captureSnapshot(c.config,{mode:"fix",ids:c.input.selection.ids,baseline:c.base,scope_baseline:c.base,artifact_root:c.f.artifacts,required_checks:c.input.snapshot.required_checks});
  const assessments=snapshot.selected_ids.map(id=>terminal(c.f,snapshot,id));assessments[0].disposition="authored-repair";assessments[0].red=c.input.document.assessments[0].red;
  const document={schema_version:1,snapshot_digest:snapshot.digest,assessments};
  const candidate=createLedgerCandidate(c.config,snapshot,{document,at:"2026-11-03",run_id:c.definition.run_id,provisional:true});
  c.input.provisional={snapshot,document,candidate};c.f.write(c.config.ledger_path,candidate.bytes);
 }
 c.f.write(c.path,renderRecord(c.definition));c.f.commit("test: new ledger and record after follow-up freeze");retarget(c);
 const result=checkBatch(c.config,c.input,{observe:c.observe});
 expect(git(c.f.root,"merge-base","--is-ancestor",c.target,"HEAD")).toBe("");
 expect(source).not.toBe(previousSource);expect(result.pass).toBe(restore);
 if(!restore)expect(result.errors).toContain("Frozen source must retain the selected Task-base ledger before provisional updates.");
});
test("default advancement after publication blocks the old batch without a history rewrite",()=>{
 const c=context();git(c.f.root,"switch","-q","main");c.f.write("unrelated-current-main.txt","New default work.\n");const next=c.f.commit("test: actual advanced default");
 git(c.f.root,"update-ref","refs/remotes/origin/main",next);git(c.f.root,"switch","-q","fix/audit-batch");
 const result=checkBatch(c.config,c.input,{observe:c.observe});expect(result.pass).toBe(false);
 expect(result.errors).toContain("Scope baseline is not the fresh observed actual remote default/tracking tip.");
 expect(git(c.f.root,"rev-parse","HEAD")).toBe(c.target);
});
