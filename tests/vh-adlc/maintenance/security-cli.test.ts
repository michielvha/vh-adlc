import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fixture, git } from "./fixtures";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import { createRun, canonicalJSON, digest } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { main } from "../../../plugins/vh-adlc/scripts/maintenance/cli";
import { alertContext } from "../../../plugins/vh-adlc/scripts/maintenance/collect";
import { parseObservation } from "../../../plugins/vh-adlc/scripts/maintenance/history";
import type { Inventory } from "../../../plugins/vh-adlc/scripts/maintenance/collect";
import { verifySecurityResult } from "../../../plugins/vh-adlc/scripts/maintenance/security-io";
import { record, text } from "../../../plugins/vh-adlc/scripts/maintenance/security-value";
import { evidenceBinding, reconcileSecurity } from "../../../plugins/vh-adlc/scripts/maintenance/security";
import { createSecurityRevision, readSecurityRevisions, selectSecurityChain, historyAuthorityBinding } from "../../../plugins/vh-adlc/scripts/maintenance/security-history";
function reportResult(value:unknown){const row=record(value);return{path:text(row.path),digest:text(row.digest)};}
const projects:ReturnType<typeof fixture>[]=[];afterEach(()=>projects.splice(0).forEach(f=>f.dispose()));
function setup(policyPath="policy.md"){
  const f=fixture();projects.push(f);f.write(policyPath,"Consumer rules.\n");f.write("CLAUDE.md","Consumer bridge.\n");
  f.settings({schema_version:1,security_policy:policyPath,source_references:["CLAUDE.md"]});
  git(f.root,"update-ref","refs/remotes/origin/main","HEAD");
  const config=loadSettings(f.root),run=createRun(config),now=new Date().toISOString();
  const coverage={status:"complete" as const,pages:1,count:0},raw={number:1,state:"open",dependency:{package:{ecosystem:"npm",name:"widget"},manifest_path:"package-lock.json",version_requirement:"1.0"},security_advisory:{ghsa_id:"GHSA-abcd-1234-abcd",severity:"high",summary:"$(touch forbidden)"}};
  const inventory:Inventory={schema_version:1,hostname:config.hostname,repository:config.repository,source_commit:run.header.source_commit,collected_at:now,requests:[],scope:run.header.scope,discovery:[],repositories:[{repository:config.repository,identity:{id:1,default_branch:"main"},pulls:[],dashboards:[],coverage:{identity:{...coverage,count:1},pulls:coverage,dashboards:coverage},dependabot:{coverage:{...coverage,count:1},alerts:[{number:1,state:"open",package:"widget",manifest:"package-lock.json",severity:"high",description:raw.security_advisory.summary,context:alertContext(raw,config.hostname,config.repository,"dependabot")}]},code_scanning:{coverage,alerts:[]}}]};
  f.write(".tools/inventory.json",JSON.stringify(inventory));
  const packet={schema_version:1,synthetic_input:false,inventory:{path:"inventory.json",sha256:digest(readFileSync(join(f.root,".tools/inventory.json")))},analysis:{evaluated_at:now,collection_revision:1,policy_assessment:{reviewer:"operator",reference:"local:policy-check",assessed_at:now},decisions:[],evidence:[],groups:[],coverage_handoffs:[]},scanner_packets:[],history:[],evidence_files:[]};
  f.write(".tools/packet.json",JSON.stringify(packet));
  return{...f,config,run,inventory,packet,save:()=>f.write(".tools/packet.json",JSON.stringify(packet))};
}
test("actual security-reconcile derives inventory findings without mutating source, index or run",async()=>{
  const f=setup(),before=git(f.root,"status","--porcelain"),index=readFileSync(join(f.root,".git/index"));
  const result=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile","--repo",f.root,"--run-id",f.run.header.run_id,"--input",join(f.root,".tools/packet.json")]));
  expect(result.revision.snapshot).toMatchObject({accounting_state:"pending",open_remediation_count:1,all_clear:false});
  expect(git(f.root,"status","--porcelain")).toBe(before);expect(readFileSync(join(f.root,".git/index"))).toEqual(index);
  expect(result.revision.snapshot.input.observations[0].raw_reference).not.toContain(f.root);
});
test("typed snapshots round-trip in private reports while arbitrary claimed reconciliation is rejected",async()=>{
  const f=setup(),result=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile","--repo",f.root,"--run-id",f.run.header.run_id,"--input",join(f.root,".tools/packet.json")]));
  f.write(".tools/security.json",JSON.stringify(result));f.write(".tools/request.json",JSON.stringify({authorized_sweep:true,read_only:true}));
  const saved=reportResult(await main(["report","--repo",f.root,"--run-id",f.run.header.run_id,"--inventory",join(f.root,".tools/inventory.json"),"--default-commit",f.run.header.source_commit,"--default-branch","main","--request",join(f.root,".tools/request.json"),"--security",join(f.root,".tools/security.json")]));
  const report=readFileSync(saved.path,"utf8");expect(parseObservation(report)!.observations[0].count).toBe(1);expect(report).toContain("maintenance-security-v1");expect(report).not.toContain("$(touch forbidden)");
  result.revision.snapshot.accounting_state="reconciled";f.write(".tools/security.json",JSON.stringify(result));
  await expect(main(["report","--repo",f.root,"--run-id",f.run.header.run_id,"--inventory",join(f.root,".tools/inventory.json"),"--default-commit",f.run.header.source_commit,"--default-branch","main","--request",join(f.root,".tools/request.json"),"--security",join(f.root,".tools/security.json")])).rejects.toThrow();
});
test("packet, source and policy drift invalidate a previously computed security receipt",async()=>{
  const f=setup();f.packet.inventory.sha256="f".repeat(64);f.save();
  await expect(main(["security-reconcile","--repo",f.root,"--run-id",f.run.header.run_id,"--input",join(f.root,".tools/packet.json")])).rejects.toThrow();
});
test("consumer-required scanner evidence remains an explicit missing surface",async()=>{
  const f=setup(),packet={...f.packet,analysis:{...f.packet.analysis,required_surfaces:[{repository:"example/project",surface:"scanner/trivy/vulnerability",reason:"consumer pipeline evidence required"}]}};
  f.write(".tools/packet.json",JSON.stringify(packet));
  const result=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile","--repo",f.root,"--run-id",f.run.header.run_id,"--input",join(f.root,".tools/packet.json")]));
  expect(result.revision.snapshot.input.coverage.find(c=>c.surface==="scanner/trivy/vulnerability")).toMatchObject({status:"incomplete",count:null});
});
test("synthetic packets remain visibly synthetic and cannot assert a live all-clear",async()=>{
  const f=setup();f.packet.synthetic_input=true;f.save();
  const result=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile","--repo",f.root,"--run-id",f.run.header.run_id,"--input",join(f.root,".tools/packet.json")]));
  expect(result.revision.snapshot.all_clear).toBe(false);expect(result.revision.snapshot.input.observations.every(o=>o.synthetic)).toBe(true);
});
test("committed history is imported even when the supplied history list is empty",async()=>{
  const f=setup(),old={schema_version:1,run_id:randomUUID(),created_at:"2026-11-01T00:00:00Z",observations:[{hostname:"github.com",repository:f.config.repository,surface:"dependabot",scope:{state:"open",filters:[],exclusions:[]},observed_at:"2026-11-01T00:00:00Z",source_reference:"commit:"+f.run.header.source_commit,status:"complete",reason:null,count:1,alerts:[{number:9,identity:"dependabot:9",package:"older",manifest:"old.lock",severity:"high"}]}]};
  f.write(f.config.history_dir+"/prior.md",'```maintenance-observation-v1\n'+JSON.stringify(old)+'\n```\n');git(f.root,"add",f.config.history_dir);git(f.root,"commit","-qm","docs: prior observation");git(f.root,"update-ref","refs/remotes/origin/main","HEAD");
  f.inventory.source_commit=git(f.root,"rev-parse","HEAD");f.write(".tools/inventory.json",JSON.stringify(f.inventory));f.packet.inventory.sha256=digest(readFileSync(join(f.root,".tools/inventory.json")));f.save();
  const result=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile","--repo",f.root,"--run-id",f.run.header.run_id,"--input",join(f.root,".tools/packet.json")]));
  expect(result.revision.snapshot.input.observations.some(o=>o.provider_id==="9"&&!o.complete)).toBe(true);
  expect(result.revision.snapshot.input.history_provenance?.some(p=>p.startsWith("commit:"))).toBe(true);
});
test("an OSV security PR without an alert cannot disappear from security accounting",async()=>{
  const f=setup(),repo=f.inventory.repositories[0];
  repo.pulls.push({repository:repo.repository,number:42,title:"chore(deps): update module widget [security]",body:"OSV-only security update",state:"open",draft:false,author:{login:"renovate",type:"Bot"},author_class:"configured",head:"b".repeat(40),base:f.run.header.source_commit,base_ref:"main",files:[],checks:[],statuses:[],evidence:{status:"complete",pages:1,count:0}});
  f.write(".tools/inventory.json",JSON.stringify(f.inventory));f.packet.inventory.sha256=digest(readFileSync(join(f.root,".tools/inventory.json")));f.save();
  const result=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile","--repo",f.root,"--run-id",f.run.header.run_id,"--input",join(f.root,".tools/packet.json")]));
  expect(result.revision.snapshot.input.observations.some(o=>o.surface==="security-pr"&&o.provider_id==="42")).toBe(true);
});

test("append and resume preserve one legacy block, revalidate current inputs and recover typed retry",async()=>{
  const f=setup("agents/policy.md");
  // Real consumers bind uppercase entry points alongside lowercase project policy paths.
  f.write("AGENTS.md","Consumer instructions.\n");f.write("CLAUDE.md","Consumer bridge.\n");
  const args=["--repo",f.root,"--run-id",f.run.header.run_id],result=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile",...args,"--input",join(f.root,".tools/packet.json")]));
  f.write(".tools/security.json",JSON.stringify(result));f.write(".tools/request.json",JSON.stringify({authorized_sweep:true,read_only:true}));
  const saved=reportResult(await main(["report",...args,"--inventory",join(f.root,".tools/inventory.json"),"--default-commit",f.run.header.source_commit,"--default-branch","main","--request",join(f.root,".tools/request.json"),"--security",join(f.root,".tools/security.json")]));
  const first=readFileSync(saved.path,"utf8");f.write(".tools/prior.md",first);
  const nextTime=new Date(Date.parse(f.inventory.collected_at)+1000).toISOString();
  const nextInventory={...f.inventory,collected_at:nextTime};f.write(".tools/inventory2.json",JSON.stringify(nextInventory));
  f.write(".tools/tracking.json",JSON.stringify({reference:"local:assignment",owner:"owner",next_action:"investigate"}));
  const original=result.revision.snapshot.input,occurrence=original.observations[0],raw=readFileSync(join(f.root,".tools/tracking.json"));
  const nextPacket={...f.packet,inventory:{path:"inventory2.json",sha256:digest(readFileSync(join(f.root,".tools/inventory2.json")))},analysis:{...f.packet.analysis,evaluated_at:nextTime,collection_revision:2,
    decisions:[{id:occurrence.id,change:"unknown",outcome:"open",follow_up:{reference:"local:assignment",owner:"owner",assignment_handoff:null,next_action:"investigate"},delivery_required:false,delivery_evidence:[]}],
    evidence:[{id:"tracking",kind:"tracking",result:"accessible",occurrence_id:occurrence.id,target:occurrence.target,binding:evidenceBinding(original.source_commit,original.policy,original.scope,occurrence.target),reference:"local:tracking",digest:digest(raw),observed_at:nextTime,complete:true,synthetic:false}]},
    history:[{path:"prior.md",sha256:digest(first)}],evidence_files:[{reference:"local:tracking",path:"tracking.json",sha256:digest(raw)}]};
  f.write(".tools/packet2.json",JSON.stringify(nextPacket));const next=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile",...args,"--input",join(f.root,".tools/packet2.json")]));
  expect(next.revision.snapshot.accounting_state).toBe("reconciled");
  f.write(".tools/security2.json",JSON.stringify(next));const update={expected_digest:digest(first),step_id:randomUUID(),at:nextTime,append:"Tracked handoff observed.",security:join(f.root,".tools/security2.json")};f.write(".tools/update.json",JSON.stringify(update));
  const applied=record(await main(["append",...args,"--update",join(f.root,".tools/update.json")]));
  expect(record(await main(["append",...args,"--update",join(f.root,".tools/update.json")])).digest).toBe(applied.digest);
  const final=readFileSync(saved.path,"utf8");expect(final.match(/```maintenance-observation-v1/g)).toHaveLength(1);expect(final.match(/```maintenance-security-v1/g)).toHaveLength(2);
  await main(["resume",...args]);f.write("agents/policy.md","Changed policy.\n");await expect(main(["resume",...args])).rejects.toThrow();
});

test("actual packets positively reobserve disappeared alerts only with current terminal and source proof",async()=>{
  for(const mode of ["fixed","dismissed","auto_dismissed","open","denied","stale","wrong-target"]){
    const f=setup(),args=["--repo",f.root,"--run-id",f.run.header.run_id];
    const first=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile",...args,"--input",join(f.root,".tools/packet.json")]));
    const prior='```maintenance-security-v1\n'+JSON.stringify(createSecurityRevision(first.revision.snapshot,null))+'\n```\n';f.write(".tools/prior.md",prior);
    const o=first.revision.snapshot.input.observations[0],now=new Date(Date.parse(f.inventory.collected_at)+1000).toISOString();
    const state=["fixed","dismissed","auto_dismissed","open"].includes(mode)?mode:"fixed",raw={...f.inventory.repositories[0].dependabot.alerts![0].context!.raw,state};
    const inventory={...f.inventory,collected_at:now,repositories:f.inventory.repositories.map(r=>({...r,dependabot:{coverage:{status:"complete",pages:1,count:0},alerts:[]}})),terminal:[{hostname:o.hostname,repository:o.repository,surface:o.surface,number:1,state,status:mode==="denied"?"incomplete":"complete",reason:mode==="denied"?"denied":null,observed_at:mode==="stale"?f.inventory.collected_at:now,raw_digest:digest(canonicalJSON(raw)),raw}]};
    f.write(".tools/next-inventory.json",JSON.stringify(inventory));f.write(".tools/proof.json",JSON.stringify({target:o.target,checks:"observed"}));
    const target=mode==="wrong-target"?{...o.target,reference:"b".repeat(40)}:o.target,original=first.revision.snapshot.input;
    const evidence=[["source","corrected"],["check","pass"],["scan","absent"]].map(([kind,result])=>({id:kind,kind,result,occurrence_id:o.id,target,binding:evidenceBinding(original.source_commit,original.policy,original.scope,target),reference:"local:proof",digest:digest(readFileSync(join(f.root,".tools/proof.json"))),observed_at:now,complete:true,synthetic:false}));
    const packet={...f.packet,inventory:{path:"next-inventory.json",sha256:digest(readFileSync(join(f.root,".tools/next-inventory.json")))},analysis:{...f.packet.analysis,evaluated_at:now,collection_revision:2,decisions:[{id:o.id,change:"compatible-authored",outcome:mode==="fixed"||["denied","stale","wrong-target"].includes(mode)?"fixed":"unknown",follow_up:null,delivery_required:false,delivery_evidence:[]}],evidence},history:[{path:"prior.md",sha256:digest(prior)}],evidence_files:[{reference:"local:proof",path:"proof.json",sha256:digest(readFileSync(join(f.root,".tools/proof.json")))}]};
    f.write(".tools/next-packet.json",JSON.stringify(packet));
    const result=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile",...args,"--input",join(f.root,".tools/next-packet.json")]));
    expect(result.revision.snapshot.findings[0].remediation).toBe(mode==="fixed"?"fixed-verified":"unknown");
    expect(result.revision.snapshot.findings[0].occurrence.complete).toBe(!["denied","stale","wrong-target"].includes(mode));
    expect(result.revision.snapshot.findings[0].exception).toBeNull();
  }
});

test("imported digest-valid successors cannot narrow a run or erase its earlier occurrences",async()=>{
  for(const mode of ["scope","identity","omission"]){
    const f=setup(),args=["--repo",f.root,"--run-id",f.run.header.run_id];
    const first=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile",...args,"--input",join(f.root,".tools/packet.json")])).revision;
    const changed=structuredClone(first.snapshot.input);changed.observations=[];changed.coverage=changed.coverage.map(c=>({...c,count:0}));
    if(mode==="scope"){changed.scope.repositories=["example/satellite"];changed.coverage=changed.coverage.map(c=>({...c,repository:"example/satellite"}));}
    if(mode==="identity")changed.repository="example/other";
    const {digest:_,...row}=first,next={...row,snapshot_revision:2,previous_snapshot_digest:first.digest,snapshot:reconcileSecurity(changed)};
    const forged={...next,digest:digest(canonicalJSON(next))},markdown=[first,forged].map(r=>'```maintenance-security-v1\n'+JSON.stringify(r)+'\n```\n').join('\n');
    const chain=selectSecurityChain(readSecurityRevisions(markdown));expect(chain.gaps.length).toBeGreaterThan(0);expect(chain.latest!.digest).toBe(first.digest);
    f.write(".tools/history.md",markdown);f.inventory.repositories[0].dependabot={coverage:{status:"complete",pages:1,count:0},alerts:[]};f.write(".tools/empty.json",JSON.stringify(f.inventory));
    const packet={...f.packet,inventory:{path:"empty.json",sha256:digest(readFileSync(join(f.root,".tools/empty.json")))},analysis:{...f.packet.analysis,collection_revision:2},history:[{path:"history.md",sha256:digest(markdown)}]};f.write(".tools/import.json",JSON.stringify(packet));
    const result=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile",...args,"--input",join(f.root,".tools/import.json")]));
    expect(result.revision.snapshot.findings).toHaveLength(1);expect(result.revision.snapshot.accounting_state).toBe("pending");expect(result.revision.snapshot.all_clear).toBe(false);
  }
});

test("actual packet history resolution approval is specific to conflict digests and chosen outcome",async()=>{
  const f=setup(),args=["--repo",f.root,"--run-id",f.run.header.run_id];
  const base=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile",...args,"--input",join(f.root,".tools/packet.json")])).revision.snapshot.input,o=base.observations[0];
  f.write(".tools/verification.json","Observed verification and approval receipt.\n");const fileDigest=digest(readFileSync(join(f.root,".tools/verification.json")));
  const evidence=(id:string,kind:string,result:string)=>({id,kind,result,occurrence_id:o.id,target:o.target,binding:evidenceBinding(base.source_commit,base.policy,base.scope,o.target),reference:"local:verification",digest:fileDigest,observed_at:base.evaluated_at,complete:true,synthetic:false});
  const follow={reference:"local:verification",owner:null,assignment_handoff:"local:assignment",next_action:"investigate"},d={id:o.id,change:"unknown",outcome:"open",follow_up:follow,delivery_required:false,delivery_evidence:[],exception:null,successor:null};
  const priorA=createSecurityRevision(reconcileSecurity({...base,run_id:randomUUID()}),null),priorB=createSecurityRevision(reconcileSecurity({...base,run_id:randomUUID(),decisions:[{...d,outcome:"fixed"}],evidence:[evidence("source","source","corrected"),evidence("check","check","pass"),evidence("scan","scan","absent")]}),null),priorC=createSecurityRevision(reconcileSecurity({...base,run_id:randomUUID(),decisions:[{...d,outcome:"unknown"}]}),null);
  const prior=(rows:typeof priorA[])=>rows.map(r=>'```maintenance-security-v1\n'+JSON.stringify(r)+'\n```\n').join('\n');let markdown=prior([priorA,priorB]);f.write(".tools/conflicts.md",markdown);
  const packet={...f.packet,analysis:{...f.packet.analysis,decisions:[d],evidence:[evidence("tracking","tracking","accessible"),evidence("approval","authority","supersedes-history")]},history:[{path:"conflicts.md",sha256:digest(markdown)}],history_resolutions:[{occurrence_id:o.id,prior_digests:[priorA.digest,priorB.digest],evidence_id:"approval"}],evidence_files:[{reference:"local:verification",path:"verification.json",sha256:fileDigest}]};
  packet.analysis.evidence[1].binding=historyAuthorityBinding({...base,decisions:[d]},o.id,[priorA.digest,priorB.digest]);
  f.write(".tools/resolve.json",JSON.stringify(packet));await main(["security-reconcile",...args,"--input",join(f.root,".tools/resolve.json")]);
  markdown=prior([priorA,priorC]);f.write(".tools/conflicts.md",markdown);packet.history[0].sha256=digest(markdown);packet.history_resolutions[0].prior_digests=[priorA.digest,priorC.digest];f.write(".tools/resolve.json",JSON.stringify(packet));
  await expect(main(["security-reconcile",...args,"--input",join(f.root,".tools/resolve.json")])).rejects.toThrow();
  markdown=prior([priorA,priorB]);f.write(".tools/conflicts.md",markdown);packet.history[0].sha256=digest(markdown);packet.history_resolutions[0].prior_digests=[priorA.digest,priorB.digest];d.outcome="unknown";f.write(".tools/resolve.json",JSON.stringify(packet));
  await expect(main(["security-reconcile",...args,"--input",join(f.root,".tools/resolve.json")])).rejects.toThrow();
});

async function checkoutDraft(f:ReturnType<typeof setup>){
  const args=["--repo",f.root,"--run-id",f.run.header.run_id];
  const result=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile",...args,"--input",join(f.root,".tools/packet.json")]));
  f.write(".tools/security.json",JSON.stringify(result));f.write(".tools/request.json",JSON.stringify({authorized_sweep:true}));
  const saved=reportResult(await main(["report",...args,"--inventory",join(f.root,".tools/inventory.json"),"--default-commit",f.run.header.source_commit,"--default-branch","main","--request",join(f.root,".tools/request.json"),"--security",join(f.root,".tools/security.json")]));
  expect(saved.path.startsWith(join(f.root,f.config.history_dir)+"/")).toBe(true);
  return{args,result,saved};
}
test("resume revalidates a saved uncommitted report as a checkout draft",async()=>{
  const f=setup(),{args}=await checkoutDraft(f);
  await main(["resume",...args]);
});
test("a checkout draft chains a later reconciliation onto its saved revision and resume revalidates each append",async()=>{
  const f=setup(),{args,saved}=await checkoutDraft(f),first=readFileSync(saved.path,"utf8"),[applied]=readSecurityRevisions(first);
  const nextTime=new Date(Date.parse(f.inventory.collected_at)+1000).toISOString();
  f.write(".tools/inventory2.json",JSON.stringify({...f.inventory,collected_at:nextTime}));
  f.write(".tools/packet2.json",JSON.stringify({...f.packet,inventory:{path:"inventory2.json",sha256:digest(readFileSync(join(f.root,".tools/inventory2.json")))},analysis:{...f.packet.analysis,evaluated_at:nextTime,collection_revision:2}}));
  const next=verifySecurityResult(f.config,f.run.header.run_id,await main(["security-reconcile",...args,"--input",join(f.root,".tools/packet2.json")]));
  expect(next.revision).toMatchObject({snapshot_revision:2,previous_snapshot_digest:applied.digest});
  expect(next.revision.snapshot.input.history_provenance).toEqual([applied.digest]);
  f.write(".tools/security2.json",JSON.stringify(next));
  f.write(".tools/update.json",JSON.stringify({expected_digest:digest(first),step_id:randomUUID(),at:nextTime,append:"Second reconciliation recorded.",security:join(f.root,".tools/security2.json")}));
  const appended=record(await main(["append",...args,"--update",join(f.root,".tools/update.json")]));
  expect(record(await main(["append",...args,"--update",join(f.root,".tools/update.json")])).digest).toBe(appended.digest);
  expect(selectSecurityChain(readSecurityRevisions(readFileSync(saved.path,"utf8"))).latest!.digest).toBe(next.revision.digest);
  await main(["resume",...args]);
});
test("uncommitted history is labelled local and a failed resume names its security cause",async()=>{
  const f=setup(),other={schema_version:1,run_id:randomUUID(),created_at:"2026-11-01T00:00:00Z",observations:[]};
  f.write(f.config.history_dir+"/other.md",'```maintenance-observation-v1\n'+JSON.stringify(other)+'\n```\n');
  const {args,result}=await checkoutDraft(f);
  expect(result.revision.snapshot.input.history_provenance).toEqual([`local:${f.config.history_dir}/other.md:${digest(readFileSync(join(f.root,f.config.history_dir,"other.md")))}`]);
  await main(["resume",...args]);
  f.write("policy.md","Changed policy.\n");
  const cli=join(import.meta.dir,"../../../plugins/vh-adlc/scripts/maintenance/cli.ts"),run=Bun.spawnSync([process.execPath,cli,"resume",...args],{stdout:"pipe",stderr:"pipe"});
  expect(run.exitCode).toBe(1);
  expect(run.stderr.toString()).toContain("maintenance security verification failed: security reconciliation result changed or falsely reconciled");
});
