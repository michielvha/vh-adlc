import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fixture, git, baseSettings, ledger, wireDefault } from "./fixtures";
import { terminal } from "./evidence";
const projects: ReturnType<typeof fixture>[] = [];
const cli = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/audit/cli.ts");
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
function invoke(f: ReturnType<typeof fixture>, ...args: string[]) {
  return Bun.spawnSync([process.execPath, cli, ...args, "--repo", f.root], { env:{...process.env,PATH:(existsSync(join(f.outer,"wire-bin"))?join(f.outer,"wire-bin")+":":"")+process.env.PATH},stdout: "pipe", stderr: "pipe" });
}
test("native status and snapshot helpers preserve source, index and refs", () => {
  const f = fixture(); projects.push(f); const head = git(f.root, "rev-parse", "HEAD"), status = git(f.root, "status", "--porcelain");
  const result = invoke(f, "status"); expect(result.exitCode).toBe(0); expect(JSON.parse(result.stdout.toString()).verification).toBe("not-performed");
  const snap = invoke(f, "snapshot", "--mode", "reverify", "--ids", "AUD-001", "--artifact-root", f.artifacts, "--name", "snapshot");
  expect(snap.exitCode).toBe(0); expect(existsSync(join(f.artifacts, "snapshot.json"))).toBe(true);
  expect(JSON.parse(readFileSync(join(f.artifacts, "snapshot.json"), "utf8")).selected_ids).toEqual(["AUD-001"]);
  expect(git(f.root, "rev-parse", "HEAD")).toBe(head); expect(git(f.root, "status", "--porcelain")).toBe(status);
});
test("unknown operation, scope or option gives a safe error without creating output", () => {
  const f = fixture(); projects.push(f);
  for (const args of [["unknown"], ["status", "--execute", "injected"], ["snapshot", "--mode", "fuller", "--artifact-root", f.artifacts, "--name", "bad"],
    ["snapshot", "--mode", "fix", "--ids", "AUD-999", "--artifact-root", f.artifacts, "--name", "bad"]]) {
    expect(invoke(f, ...args).exitCode).toBe(1);
  }
  expect(existsSync(join(f.artifacts, "bad.json"))).toBe(false); expect(git(f.root, "status", "--porcelain")).toBe("");
});

test("installed journal CLI can retain an observed merge outcome and handoff, and inspect pending state after policy drift", () => {
  const f = fixture(); projects.push(f);
  const batch = "b".repeat(64), created = invoke(f, "journal-new", "--artifact-root", f.artifacts, "--run-id", "native-outcomes", "--batch-digest", batch);
  expect(created.exitCode).toBe(0); const directory = JSON.parse(created.stdout.toString()).directory;
  const input = f.artifact("merge-intent.json", JSON.stringify({ id: "merge", kind: "merge", correlation: "pull-42", target: "pull:42" }));
  expect(invoke(f, "journal-intent", "--directory", directory, "--batch-digest", batch, "--input", join(f.artifacts, input.path)).exitCode).toBe(0);
  expect(invoke(f, "journal-handoff", "--directory", directory, "--batch-digest", batch, "--action-id", "merge", "--reason", "observe-before-retry").exitCode).toBe(0);
  const receipt = f.artifact("merge-outcome.json", JSON.stringify({ state: "observed", commit: git(f.root, "rev-parse", "HEAD"), pull_number: 42 }));
  expect(invoke(f, "journal-outcome", "--directory", directory, "--batch-digest", batch, "--action-id", "merge", "--input", join(f.artifacts, receipt.path)).exitCode).toBe(0);
  const result = invoke(f, "journal-pending", "--directory", directory, "--batch-digest", batch); expect(result.exitCode).toBe(0); expect(JSON.parse(result.stdout.toString()).pending).toEqual([]);
  f.write("audit-project.md", "# Changed policy\n");
  const drift = invoke(f, "journal-pending", "--directory", directory, "--batch-digest", batch); expect(drift.exitCode).toBe(0); expect(JSON.parse(drift.stdout.toString()).handoff).toBe("policy-changed");
});

test("native generic outcomes cannot confuse a created key with confirmed cleanup", () => {
  const f = fixture(); projects.push(f); const batch = "c".repeat(64);
  const created = invoke(f, "journal-new", "--artifact-root", f.artifacts, "--run-id", "resource-outcomes", "--batch-digest", batch), directory = JSON.parse(created.stdout.toString()).directory;
  const input = f.artifact("key-intent.json", JSON.stringify({ id: "key", kind: "key", correlation: "owned-key", target: "dev:slot", actor: "actor", organization: "org", cleanup_method: "#cleanup" }));
  expect(invoke(f, "journal-intent", "--directory", directory, "--batch-digest", batch, "--input", join(f.artifacts, input.path)).exitCode).toBe(0);
  const receipt = f.artifact("key-outcome.json", JSON.stringify({ state: "observed", resource_id: "owned-key-id" }));
  expect(invoke(f, "journal-outcome", "--directory", directory, "--batch-digest", batch, "--action-id", "key", "--input", join(f.artifacts, receipt.path)).exitCode).toBe(1);
  const pending = invoke(f, "journal-pending", "--directory", directory, "--batch-digest", batch); expect(JSON.parse(pending.stdout.toString()).live_ready).toBe(false);
  expect(invoke(f, "journal-cleanup-outcome", "--directory", directory, "--batch-digest", batch, "--action-id", "key", "--input", join(f.artifacts, receipt.path), "--absence-confirmed", "true").exitCode).toBe(0);
});


test("native live plan registers key and row together and refuses another attempt before cleanup", () => {
  const f=fixture();projects.push(f);const batch="e".repeat(64);
  const created=invoke(f,"journal-new","--artifact-root",f.artifacts,"--run-id","live-plan","--batch-digest",batch);
  expect(created.exitCode).toBe(0);const directory=JSON.parse(created.stdout.toString()).directory;
  const actions=["key","row"].map(kind=>({id:kind,kind,correlation:"owned-"+kind,target:"dev:slot",actor:"actor",organization:"org",cleanup_method:"#cleanup"}));
  const malformed=f.artifact("malformed-plan.json",JSON.stringify([actions[0],{...actions[1],actor:undefined}]));
  const args=["--directory",directory,"--batch-digest",batch];
  expect(invoke(f,"journal-live-intents",...args,"--input",join(f.artifacts,malformed.path)).exitCode).toBe(1);
  expect(JSON.parse(invoke(f,"journal-pending",...args).stdout.toString()).pending).toEqual([]);
  const input=f.artifact("live-plan.json",JSON.stringify(actions));
  expect(invoke(f,"journal-live-intents",...args,"--input",join(f.artifacts,input.path)).exitCode).toBe(0);
  expect(JSON.parse(invoke(f,"journal-pending",...args).stdout.toString()).pending).toHaveLength(2);
  const registered=invoke(f,"journal-registered-pending");expect(registered.exitCode).toBe(0);expect(JSON.parse(registered.stdout.toString()).pending).toHaveLength(2);
  const second=f.artifact("second-plan.json",JSON.stringify([{...actions[0],id:"second-key",correlation:"second-key"}]));
  expect(invoke(f,"journal-live-intents",...args,"--input",join(f.artifacts,second.path)).exitCode).toBe(1);
  expect(JSON.parse(invoke(f,"journal-pending",...args).stdout.toString()).pending).toHaveLength(2);
});


test("native candidates include checked section updates without changing source", () => {
  const f=fixture();projects.push(f);f.write("docs/audit.md",ledger+"\n## Positive\n\nEarlier observation.\n");
  f.settings(baseSettings({profile:{name:"markdown-audit-v1",index_heading:"Severity index",finding_level:3,section_note_headings:["Positive"]}}));f.commit();
  const before=git(f.root,"status","--porcelain"),head=git(f.root,"rev-parse","HEAD");
  const required=f.artifact("required.json",JSON.stringify({"AUD-001":["unit"]}));
  const snapshot=invoke(f,"snapshot","--mode","full","--ids","AUD-001","--artifact-root",f.artifacts,"--requirements",join(f.artifacts,required.path),"--name","native-note-snapshot");expect(snapshot.exitCode).toBe(0);
  const saved=JSON.parse(snapshot.stdout.toString()),snap=JSON.parse(readFileSync(saved.path,"utf8"));
  const document=f.artifact("native-note-document.json",JSON.stringify({schema_version:1,snapshot_digest:snap.digest,assessments:[terminal(f,snap)]})),proof=f.artifact("native-note-proof.txt");
  const notes=f.artifact("native-notes.json",JSON.stringify([{heading:"Positive",ids:["AUD-001"],text:"Current evidence supersedes the earlier claim.",evidence:[proof]}]));
  const result=invoke(f,"candidate","--snapshot",saved.path,"--input",join(f.artifacts,document.path),"--date","2026-11-02","--run-id","native-notes","--name","native-note-candidate","--section-notes",join(f.artifacts,notes.path));
  expect(result.exitCode).toBe(0);const savedCandidate=JSON.parse(result.stdout.toString()),value=JSON.parse(readFileSync(savedCandidate.path,"utf8"));expect(value.bytes).toContain("Current evidence supersedes");expect(value.bytes).toContain("Earlier observation.");
  expect(git(f.root,"status","--porcelain")).toBe(before);expect(git(f.root,"rev-parse","HEAD")).toBe(head);
});


test("native owner-handoff reconciliation retires old cleanup without reactivating its run",()=>{
 const f=fixture();projects.push(f);const batch="f".repeat(64);
 const created=invoke(f,"journal-new","--artifact-root",f.artifacts,"--run-id","old-policy","--batch-digest",batch);const directory=JSON.parse(created.stdout.toString()).directory,args=["--directory",directory,"--batch-digest",batch];
 const key=f.artifact("transition-key.json",JSON.stringify({id:"key",kind:"key",correlation:"owned-key",target:"dev:slot",actor:"actor",organization:"org",cleanup_method:"#cleanup"}));
 expect(invoke(f,"journal-intent",...args,"--input",join(f.artifacts,key.path)).exitCode).toBe(0);
 const header=readFileSync(join(directory,"header.json")),digest=JSON.parse(invoke(f,"journal-read",...args).stdout.toString()).digest;
 f.write("audit-project.md","# Committed cleanup policy\n");const policy_commit=f.commit();wireDefault(f,policy_commit);
 const request=f.artifact("policy-handoff.json",JSON.stringify({owner_approved:true,owner_handoff:"owner-session:cleanup",expected_digest:digest,policy_commit}));
 expect(invoke(f,"journal-reconcile-policy",...args,"--input",join(f.artifacts,request.path)).exitCode).toBe(0);
 expect(invoke(f,"journal-intent",...args,"--input",join(f.artifacts,key.path)).exitCode).toBe(1);
 const receipt=f.artifact("policy-cleanup.json",JSON.stringify({state:"observed"}));
 expect(invoke(f,"journal-cleanup-outcome",...args,"--action-id","key","--input",join(f.artifacts,receipt.path),"--absence-confirmed","true").exitCode).toBe(0);
 const pending=JSON.parse(invoke(f,"journal-pending",...args).stdout.toString());expect(pending.pending).toEqual([]);expect(pending.cleanup_only).toBe(true);expect(pending.live_ready).toBe(false);
 expect(JSON.parse(invoke(f,"journal-registered-pending").stdout.toString()).pending).toEqual([]);expect(readFileSync(join(directory,"header.json")).equals(header)).toBe(true);
});


test("native retirement retains its receipt after completed run artifacts are removed",()=>{
 const f=fixture();projects.push(f);const batch="a".repeat(64);
 const created=invoke(f,"journal-new","--artifact-root",f.artifacts,"--run-id","native-retirement","--batch-digest",batch),directory=JSON.parse(created.stdout.toString()).directory,args=["--directory",directory,"--batch-digest",batch];
 const before=JSON.parse(invoke(f,"journal-read",...args).stdout.toString());
 const request=f.artifact("retirement-request.json",JSON.stringify({owner_approved:true,owner_handoff:"owner:retained-evidence",expected_digest:before.digest}));
 const retired=invoke(f,"journal-retire",...args,"--input",join(f.artifacts,request.path));expect(retired.exitCode).toBe(0);expect(JSON.parse(retired.stdout.toString()).zero_pending).toBe(true);
 rmSync(directory,{recursive:true});expect(JSON.parse(invoke(f,"journal-registered-pending").stdout.toString()).pending).toEqual([]);
 expect(invoke(f,"journal-retire",...args,"--input",join(f.artifacts,request.path)).exitCode).toBe(0);
});
