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
import { evidenceBinding } from "../../../plugins/vh-adlc/scripts/maintenance/security";
const projects:ReturnType<typeof fixture>[]=[];afterEach(()=>projects.splice(0).forEach(f=>f.dispose()));
function setup(){
  const f=fixture();projects.push(f);f.write("policy.md","Consumer rules.\n");f.settings({schema_version:1,security_policy:"policy.md"});
  git(f.root,"update-ref","refs/remotes/origin/main","HEAD");
  const config=loadSettings(f.root),run=createRun(config),now=new Date().toISOString();
  const coverage={status:"complete" as const,pages:1,count:0},raw={number:1,state:"open",dependency:{package:{ecosystem:"npm",name:"widget"},manifest_path:"package-lock.json",version_requirement:"1.0"},security_advisory:{ghsa_id:"GHSA-abcd-1234-abcd",severity:"high",summary:"$(touch forbidden)"}};
  const inventory:Inventory={schema_version:1,hostname:config.hostname,repository:config.repository,source_commit:run.header.source_commit,collected_at:now,requests:[],scope:run.header.scope,discovery:[],repositories:[{repository:config.repository,identity:{id:1,default_branch:"main"},pulls:[],dashboards:[],coverage:{identity:{...coverage,count:1},pulls:coverage,dashboards:coverage},dependabot:{coverage:{...coverage,count:1},alerts:[{number:1,state:"open",package:"widget",manifest:"package-lock.json",severity:"high",description:raw.security_advisory.summary,context:alertContext(raw,config.hostname,config.repository,"dependabot")}]},code_scanning:{coverage,alerts:[]}}]};
  f.write(".tools/inventory.json",JSON.stringify(inventory));
  const packet={schema_version:1,inventory:{path:"inventory.json",sha256:digest(readFileSync(join(f.root,".tools/inventory.json")))},analysis:{evaluated_at:now,collection_revision:1,policy_assessment:{reviewer:"operator",reference:"local:policy-check",assessed_at:now},decisions:[],evidence:[],groups:[],coverage_handoffs:[]},scanner_packets:[],history:[],evidence_files:[]};
  f.write(".tools/packet.json",JSON.stringify(packet));
  return{...f,config,run,inventory,packet,save:()=>f.write(".tools/packet.json",JSON.stringify(packet))};
}
test("actual security-reconcile derives inventory findings without mutating source, index or run",async()=>{
  const f=setup(),before=git(f.root,"status","--porcelain"),index=readFileSync(join(f.root,".git/index"));
  const result=await main(["security-reconcile","--repo",f.root,"--run-id",f.run.header.run_id,"--input",join(f.root,".tools/packet.json")]);
  expect(result.revision.snapshot).toMatchObject({accounting_state:"pending",open_remediation_count:1,all_clear:false});
  expect(git(f.root,"status","--porcelain")).toBe(before);expect(readFileSync(join(f.root,".git/index"))).toEqual(index);
  expect(result.revision.snapshot.input.observations[0].raw_reference).not.toContain(f.root);
});
test("typed snapshots round-trip in private reports while arbitrary claimed reconciliation is rejected",async()=>{
  const f=setup(),result=await main(["security-reconcile","--repo",f.root,"--run-id",f.run.header.run_id,"--input",join(f.root,".tools/packet.json")]);
  f.write(".tools/security.json",JSON.stringify(result));f.write(".tools/request.json",JSON.stringify({authorized_sweep:true,read_only:true}));
  const saved=await main(["report","--repo",f.root,"--run-id",f.run.header.run_id,"--inventory",join(f.root,".tools/inventory.json"),"--default-commit",f.run.header.source_commit,"--default-branch","main","--request",join(f.root,".tools/request.json"),"--security",join(f.root,".tools/security.json")]);
  const report=readFileSync(saved.path,"utf8");expect(parseObservation(report)!.observations[0].count).toBe(1);expect(report).toContain("maintenance-security-v1");expect(report).not.toContain("$(touch forbidden)");
  result.revision.snapshot.accounting_state="reconciled";f.write(".tools/security.json",JSON.stringify(result));
  await expect(main(["report","--repo",f.root,"--run-id",f.run.header.run_id,"--inventory",join(f.root,".tools/inventory.json"),"--default-commit",f.run.header.source_commit,"--default-branch","main","--request",join(f.root,".tools/request.json"),"--security",join(f.root,".tools/security.json")])).rejects.toThrow();
});
test("packet, source and policy drift invalidate a previously computed security receipt",async()=>{
  const f=setup();f.packet.inventory.sha256="f".repeat(64);f.save();
  await expect(main(["security-reconcile","--repo",f.root,"--run-id",f.run.header.run_id,"--input",join(f.root,".tools/packet.json")])).rejects.toThrow();
});

test("append and resume preserve one legacy block, revalidate current inputs and recover typed retry",async()=>{
  const f=setup(),args=["--repo",f.root,"--run-id",f.run.header.run_id],result=await main(["security-reconcile",...args,"--input",join(f.root,".tools/packet.json")]);
  f.write(".tools/security.json",JSON.stringify(result));f.write(".tools/request.json",JSON.stringify({authorized_sweep:true,read_only:true}));
  const saved=await main(["report",...args,"--inventory",join(f.root,".tools/inventory.json"),"--default-commit",f.run.header.source_commit,"--default-branch","main","--request",join(f.root,".tools/request.json"),"--security",join(f.root,".tools/security.json")]);
  const first=readFileSync(saved.path,"utf8");f.write(".tools/prior.md",first);
  const nextTime=new Date(Date.parse(f.inventory.collected_at)+1000).toISOString();
  const nextInventory={...f.inventory,collected_at:nextTime};f.write(".tools/inventory2.json",JSON.stringify(nextInventory));
  f.write(".tools/tracking.json",JSON.stringify({reference:"local:assignment",owner:"owner",next_action:"investigate"}));
  const original=result.revision.snapshot.input,occurrence=original.observations[0],raw=readFileSync(join(f.root,".tools/tracking.json"));
  const nextPacket={...f.packet,inventory:{path:"inventory2.json",sha256:digest(readFileSync(join(f.root,".tools/inventory2.json")))},analysis:{...f.packet.analysis,evaluated_at:nextTime,collection_revision:2,
    decisions:[{id:occurrence.id,change:"unknown",outcome:"open",follow_up:{reference:"local:assignment",owner:"owner",assignment_handoff:null,next_action:"investigate"},delivery_required:false,delivery_evidence:[]}],
    evidence:[{id:"tracking",kind:"tracking",result:"accessible",occurrence_id:occurrence.id,target:occurrence.target,binding:evidenceBinding(original.source_commit,original.policy,original.scope,occurrence.target),reference:"local:tracking",digest:digest(raw),observed_at:nextTime,complete:true,synthetic:false}]},
    history:[{path:"prior.md",sha256:digest(first)}],evidence_files:[{reference:"local:tracking",path:"tracking.json",sha256:digest(raw)}]};
  f.write(".tools/packet2.json",JSON.stringify(nextPacket));const next=await main(["security-reconcile",...args,"--input",join(f.root,".tools/packet2.json")]);
  expect(next.revision.snapshot.accounting_state).toBe("reconciled");
  f.write(".tools/security2.json",JSON.stringify(next));const update={expected_digest:digest(first),step_id:randomUUID(),at:nextTime,append:"Tracked handoff observed.",security:join(f.root,".tools/security2.json")};f.write(".tools/update.json",JSON.stringify(update));
  const applied=await main(["append",...args,"--update",join(f.root,".tools/update.json")]);
  expect((await main(["append",...args,"--update",join(f.root,".tools/update.json")])).digest).toBe(applied.digest);
  const final=readFileSync(saved.path,"utf8");expect(final.match(/```maintenance-observation-v1/g)).toHaveLength(1);expect(final.match(/```maintenance-security-v1/g)).toHaveLength(2);
  await main(["resume",...args]);f.write("policy.md","Changed policy.\n");await expect(main(["resume",...args])).rejects.toThrow();
});
