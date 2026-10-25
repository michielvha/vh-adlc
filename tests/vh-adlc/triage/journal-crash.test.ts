import{test,expect}from"bun:test";
import{join}from"node:path";
import{existsSync,readFileSync,writeFileSync}from"node:fs";
import{fixture,git}from"./fixtures";
import{loadSettings}from"../../../plugins/vh-adlc/scripts/triage/settings";
import{buildReport}from"../../../plugins/vh-adlc/scripts/triage/report";
import{planBatch,approveBatch,executeBatch}from"../../../plugins/vh-adlc/scripts/triage/execute";
for(const point of["init-anchor","init-log","journal-complete","journal-started","journal-gated","head-lag","partial-log"])test(`original journal recovers after owned kill at ${point}`,async()=>{
 const f=fixture();try{
  f.settings({schema_version:1,source_roots:["src"]});const config=loadSettings(f.root),before="---\nissue: null\nstatus: planned\n---\n\n# Owner request\n";f.write("plans/link.md",before);
  const inventory:any={schema_version:1,hostname:config.hostname,repository:config.repository,source_commit:git(f.root,"rev-parse","HEAD"),mode:"ids",requested_ids:[],collected_at:new Date().toISOString(),issues:[],closed_issues:[],pulls:[],plans:[],labels:[],actor:"operator",plan_metadata:"not-configured",coverage:["identity","labels","issues","pulls","plans"].map(collection=>({collection,scope:"kill-point-fixture",pages:1,complete:true}))};
  const batch=planBatch(config,inventory,buildReport(config,inventory,[]),[{id:"request",kind:"create-request",request:{title:"Investigate scope",data:"Unverified owner task"}},{id:"link",kind:"plan-patch",path:"plans/link.md",before,after:before.replace("issue: null","issue: {{created_issue_url}}"),created_by:"request",gate:{status:"planned",document:"plans/link.md"}}]);
  const journal=join(f.root,".vh-adlc/journal.json"),batchPath=join(f.root,".vh-adlc/batch.json"),effects=join(f.root,".vh-adlc/effects.json"),marker=join(f.root,".vh-adlc/killed");writeFileSync(batchPath,JSON.stringify(batch));
  const killed=Bun.spawnSync([process.execPath,join(import.meta.dir,"journal-crash.ts"),f.root,batchPath,journal,effects,point,marker],{env:process.env,stdout:"pipe",stderr:"pipe",timeout:15000,detached:true});
  expect(existsSync(marker)).toBe(true);expect(killed.exitCode).not.toBe(0);
  const adapter:any={identity:async()=>"operator",labels:async()=>[],issue:async()=>{throw Error("No issue");},receipt:async(key:string)=>{try{return JSON.parse(readFileSync(effects,"utf8"))[key]??null;}catch{return null;}},mutate:async(_action:any,key:string)=>{let data:any={};try{data=JSON.parse(readFileSync(effects,"utf8"));}catch{}if(data[key])throw Error("Duplicate fixture creation");const result={number:10,url:`https://${config.hostname}/${config.repository}/issues/10`};data[key]=result;writeFileSync(effects,JSON.stringify(data));return result;}};
  const result=await executeBatch(config,batch,approveBatch(batch,["request","link"],"Resume this original exact test-only batch"),adapter,{journal,gate:async()=>true});
  expect(result).toEqual({completed:["request","link"],blocked:[],failed:[]});expect(Object.keys(JSON.parse(readFileSync(effects,"utf8")))).toHaveLength(1);expect(readFileSync(join(f.root,"plans/link.md"),"utf8")).toBe(before.replace("issue: null","issue: https://github.com/example/project/issues/10"));
 }finally{f.dispose();}
},60000);
