import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, symlinkSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createRun, readRun, intent, outcome, inspectPending, reconcilePolicy, registeredPending, retireRun } from "../../../plugins/vh-adlc/scripts/audit/journal";
import { recoverEffect, cleanupPending, liveReady } from "../../../plugins/vh-adlc/scripts/audit/recovery";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { fixture, git } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
export function context() {
  const f = fixture(); projects.push(f); const config = loadSettings(f.root);
  const run = createRun(config, { artifact_root: f.artifacts, run_id: "synthetic-run", batch_digest: "a".repeat(64) });
  return { f, config, run, reload: () => readRun(config, run.directory, "a".repeat(64)) };
}
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });

test("saved report and local commit recovery retains the actual paths and commit without replay", async () => {
  const c = context(), before = git(c.f.root, "status", "--porcelain");
  const report = c.f.artifact("saved-report.md", "Saved observation.\n");
  const action = { id: "local-report", kind: "report" as const, correlation: "report-synthetic-run", target: "local-artifact" };
  intent(c.run, action); outcome(c.run, action.id, { state: "observed", artifact_path: report.path, artifact_digest: report.sha256 });
  const commit = git(c.f.root, "rev-parse", "HEAD");
  intent(c.reload(), { id: "local-commit", kind: "local-commit", correlation: "commit-synthetic-run", target: "owned-ledger", expected_head: commit });
  let replayed = 0;
  const result = await recoverEffect(c.reload(), "local-commit", {
    observe: async () => ({ state: "done", receipt: { state: "observed", commit } }),
    execute: async () => { replayed++; throw Error("must not execute"); }, authorized: true,
  });
  expect(result.state).toBe("observed"); expect(replayed).toBe(0);
  expect(c.reload().events.filter(e => e.kind === "outcome")).toHaveLength(2);
  expect(git(c.f.root, "status", "--porcelain")).toBe(before);
});

test("lost squash-merge acknowledgement records one observed outcome privately and never repeats the merge", async () => {
  const c = context(), before = git(c.f.root, "for-each-ref", "--format=%(refname) %(objectname)");
  intent(c.run, { id: "merge-42", kind: "merge", correlation: "pull-42", target: "pull:42", expected_head: git(c.f.root, "rev-parse", "HEAD") });
  let merged = false, calls = 0;
  const transport = {
    authorized: true,
    observe: async () => merged ? { state: "done", receipt: { state: "observed", commit: "b".repeat(40), pull_number: 42 } } : { state: "absent" },
    execute: async () => { calls++; merged = true; throw Error("lost response after accepted merge"); },
  } as const;
  await expect(recoverEffect(c.run, "merge-42", transport)).rejects.toThrow("lost response");
  expect(c.reload().events.filter(e => e.kind === "outcome")).toHaveLength(0);
  expect((await recoverEffect(c.reload(), "merge-42", transport)).state).toBe("observed");
  expect((await recoverEffect(c.reload(), "merge-42", transport)).state).toBe("observed");
  expect(calls).toBe(1); expect(c.reload().events.filter(e => e.kind === "outcome")).toHaveLength(1);
  expect(git(c.f.root, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(before);
  expect(readFileSync(join(c.run.directory, "events", "00000002.json"), "utf8")).toContain("pull_number");
});

test("missing local outcome or unknown remote state cannot authorize a blind merge retry", async () => {
  const c = context(); intent(c.run, { id: "merge", kind: "merge", correlation: "pull-42", target: "pull:42" });
  expect((await recoverEffect(c.reload(), "merge", { authorized: true, observe: async () => ({ state: "unknown" }) })).state).toBe("blocked");
  expect((await recoverEffect(c.reload(), "merge", { authorized: false, observe: async () => ({ state: "absent" }) })).state).toBe("blocked");
  await expect(recoverEffect(c.reload(), "missing-intent", { authorized: true, observe: async () => ({ state: "unknown" }) })).rejects.toThrow();
});

test("journal conflicts, scope drift, public modes, secret fields and symlinks fail closed", () => {
  const c = context(), action = { id: "x", kind: "merge" as const, correlation: "pull-42", target: "pull:42" };
  const stale = c.reload(); intent(c.run, action);
  expect(() => intent(stale, { ...action, id: "other" })).toThrow();
  expect(() => intent(c.reload(), { ...action, id: "secret", token: "do-not-save" } as never)).toThrow();
  expect(() => readRun(c.config, c.run.directory, "c".repeat(64))).toThrow();
  c.f.write("audit-project.md", "# Changed policy\n"); expect(() => c.reload()).toThrow();
  c.f.write("audit-project.md", "# Audit project policy\n\nNo standing publication grant.\n");
  chmodSync(join(c.run.directory, "header.json"), 0o644); expect(() => c.reload()).toThrow();
  chmodSync(join(c.run.directory, "header.json"), 0o600);
  const linked = join(c.f.artifacts, "linked"); symlinkSync(c.run.directory, linked); expect(() => readRun(c.config, linked, "a".repeat(64))).toThrow();
  expect(existsSync(join(c.f.root, "audit-run-synthetic-run"))).toBe(false);
});

test("changed policy leaves resource intents inspectable without conferring journal mutation or retry authority", () => {
  const c = context(); intent(c.run, { id: "owned-key", kind: "key", correlation: "unique-owned-key", target: "development:slot", actor: "fixture", organization: "org", cleanup_method: "#cleanup" });
  c.f.write("audit-project.md", "# Updated current policy\n");
  const result = inspectPending(loadSettings(c.f.root), c.run.directory, c.run.header.batch_digest);
  expect(result.policy_current).toBe(false); expect(result.handoff).toBe("policy-changed"); expect(result.live_ready).toBe(false);
  expect(result.pending.map(row => row.id)).toEqual(["owned-key"]);
  expect(() => outcome(c.run, "owned-key", { state: "observed" })).toThrow();
});


test("explicit committed policy handoff permits only old-resource reconciliation and unblocks a later run",async()=>{
 const c=context(),scope={target:"dev:slot",actor:"fixture",organization:"org",cleanup_method:"#cleanup"};
 intent(c.run,{id:"key",kind:"key",correlation:"owned-key",...scope});const before=c.reload(),header=readFileSync(join(before.directory,"header.json"));
 c.f.write("audit-project.md","# Current policy\n\n## Cleanup\nOnly the recorded owned key may be removed.\n");const policyCommit=c.f.commit();const config=loadSettings(c.f.root);
 const request={owner_approved:true,owner_handoff:"owner-session:cleanup-1",expected_digest:before.digest,policy_commit:policyCommit};
 expect(()=>reconcilePolicy(config,before.directory,before.header.batch_digest,{...request,owner_approved:false})).toThrow();
 expect(()=>reconcilePolicy(config,before.directory,before.header.batch_digest,{...request,expected_digest:"0".repeat(64)})).toThrow();
 c.f.write("audit-project.md","# Uncommitted policy\n");
 expect(()=>reconcilePolicy(loadSettings(c.f.root),before.directory,before.header.batch_digest,request)).toThrow();
 c.f.write("audit-project.md","# Current policy\n\n## Cleanup\nOnly the recorded owned key may be removed.\n");
 const observer={observe:()=>({default_branch:"main",default_commit:policyCommit})};
 const current=reconcilePolicy(config,before.directory,before.header.batch_digest,request,observer);
 expect(current.cleanup_only).toBe(true);expect(current.policy_current).toBe(true);
 expect(reconcilePolicy(config,before.directory,before.header.batch_digest,request,observer).revision).toBe(current.revision);
 expect(()=>intent(current,{id:"retry",kind:"merge",correlation:"pull-42",target:"pull:42"})).toThrow();
 let deleted=0;const resources=[{...scope,id:"key-id"}];
 await cleanupPending(current,scope,{authorized:true,lookup:async()=>resources,cleanup:async()=>{resources.length=0;deleted++;}});
 expect(deleted).toBe(1);expect(registeredPending(config)).toEqual([]);expect(liveReady(current)).toBe(false);
 const later=createRun(config,{artifact_root:c.f.artifacts,run_id:"later-run",batch_digest:"b".repeat(64)});expect(liveReady(later)).toBe(true);
 expect(readFileSync(join(before.directory,"header.json")).equals(header)).toBe(true);
});


test("cleanup transition refuses an unpublished policy and failed default observation",()=>{
 const c=context();intent(c.run,{id:"key",kind:"key",correlation:"owned-key",target:"dev:slot",actor:"actor",organization:"org",cleanup_method:"#cleanup"});
 const before=c.reload(),defaultCommit=git(c.f.root,"rev-parse","HEAD");
 git(c.f.root,"switch","-qc","feat/unpublished-policy");c.f.write("audit-project.md","# Unpublished policy\n");const policyCommit=c.f.commit();
 const request={owner_approved:true,owner_handoff:"owner:cleanup",expected_digest:before.digest,policy_commit:policyCommit};
 expect(()=>reconcilePolicy(loadSettings(c.f.root),before.directory,before.header.batch_digest,request,{observe:()=>({default_branch:"main",default_commit:defaultCommit})})).toThrow();
 expect(()=>reconcilePolicy(loadSettings(c.f.root),before.directory,before.header.batch_digest,request,{observe:()=>{throw Error("offline");}})).toThrow();
 expect(readRun(loadSettings(c.f.root),before.directory,before.header.batch_digest,{inspect:true}).events.length).toBe(before.events.length);
});


test("moving a repository preserves pending cleanup registration",async()=>{
 const c=context(),scope={target:"dev:slot",actor:"actor",organization:"org",cleanup_method:"#cleanup"};intent(c.run,{id:"key",kind:"key",correlation:"owned-key",...scope});
 const moved=join(c.f.outer,"moved-repository");renameSync(c.f.root,moved);const config=loadSettings(moved);
 expect(registeredPending(config).map(row=>row.action.id)).toEqual(["key"]);
 const run=readRun(config,c.run.directory,c.run.header.batch_digest);await cleanupPending(run,scope,{authorized:true,lookup:async()=>[],cleanup:async()=>{throw Error("absent");}});
 expect(registeredPending(config)).toEqual([]);
});
test("explicit retirement preserves a zero-pending digest after the completed artifact root is removed",()=>{
 const c=context(),before=c.reload(),request={owner_approved:true,owner_handoff:"owner:retained-outcomes",expected_digest:before.digest};
 const retired=retireRun(c.config,before.directory,before.header.batch_digest,request);expect(retired.zero_pending).toBe(true);
 const retirementPath=join(git(c.f.root,"rev-parse","--path-format=absolute","--git-common-dir"),"vh-adlc-audit-runs",before.header.run_id+".retired.json");
 unlinkSync(retirementPath); // Simulate interruption after the serialized event but before its registry receipt.
 expect(retireRun(c.config,before.directory,before.header.batch_digest,request)).toEqual(retired);
 expect(()=>intent(c.reload(),{id:"new",kind:"report",correlation:"new-report",target:"private"})).toThrow();
 rmSync(before.directory,{recursive:true});expect(registeredPending(c.config)).toEqual([]);
 expect(retireRun(c.config,before.directory,before.header.batch_digest,request)).toEqual(retired);
 const later=createRun(c.config,{artifact_root:c.f.artifacts,run_id:"after-retirement",batch_digest:"d".repeat(64)});expect(liveReady(later)).toBe(true);
});
test.each(["merge","key"] as const)("retirement refuses pending %s effects",kind=>{
 const c=context();intent(c.run,{id:kind,kind,correlation:"owned-pending",target:"dev:slot",...(kind==="key"?{actor:"actor",organization:"org",cleanup_method:"#cleanup"}:{})});
 expect(()=>retireRun(c.config,c.run.directory,c.run.header.batch_digest,{owner_approved:true,owner_handoff:"owner:retain",expected_digest:c.reload().digest})).toThrow();
});
