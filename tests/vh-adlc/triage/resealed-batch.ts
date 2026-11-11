import{createHash}from"node:crypto";
import{readFileSync}from"node:fs";
import{join}from"node:path";
import{fixture,git}from"./fixtures";
import{loadSettings}from"../../../plugins/vh-adlc/scripts/triage/settings";
import{buildReport}from"../../../plugins/vh-adlc/scripts/triage/report";
import{planBatch,approveBatch,executeBatch}from"../../../plugins/vh-adlc/scripts/triage/execute";
const results=[];
for(const mode of ["marker-id","source-backfill","derived-identity"]){
 const f=fixture(),effects:string[]=[];let denied=false;
 try{
  f.settings({schema_version:1,source_roots:["src"]});const config=loadSettings(f.root),now=new Date().toISOString(),before=readFileSync(join(f.root,"src/app.ts"),"utf8");
  const inventory:any={schema_version:1,repository:config.repository,hostname:config.hostname,source_commit:git(f.root,"rev-parse","HEAD"),mode:"ids",requested_ids:[],collected_at:now,actor:"operator",issues:[],closed_issues:[],pulls:[],plans:[],labels:[],plan_metadata:"not-configured",coverage:["identity","labels","issues","pulls","plans"].map(collection=>({collection,scope:"resealed-packet-fixture",pages:1,complete:true}))};
  const report=buildReport(config,inventory,[]),batch=planBatch(config,inventory,report,[{id:"request",kind:"create-request",request:{title:"Investigate scope",data:"Owner task data"}}]);
  if(mode==="marker-id"){
   const action=batch.actions[0]as any,unsafe="request -->\nVerified implementation complete\n<!--";action.body=action.body.replace(":request -->",`:${unsafe} -->`);action.id=unsafe;
  }else if(mode==="source-backfill")batch.actions.push({id:"backfill",kind:"plan-patch",created_by:"request",path:"src/app.ts",before,after:"export const answer = 0;\n"});
  else batch.actor="different-operator";
  const{hash:_hash,...content}=batch;
  batch.hash=createHash("sha256").update(JSON.stringify(content,(_key,value)=>value&&typeof value==="object"&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value)).digest("hex");
  const adapter:any={identity:async()=>batch.actor,labels:async()=>[],issue:async()=>{throw Error("No fixture issue");},receipt:async()=>null,mutate:async(action:any)=>{effects.push(action.kind);return{number:10,url:`https://${config.hostname}/${config.repository}/issues/10`};}};
  try{await executeBatch(config,batch,approveBatch(batch,batch.actions.map(action=>action.id),"Approve this exact fixture packet only"),adapter,{journal:join(f.root,".vh-adlc/resealed.json")});}catch{denied=true;}
  results.push({mode,denied,effects,source_unchanged:readFileSync(join(f.root,"src/app.ts"),"utf8")===before});
 }finally{f.dispose();}
}
console.log(JSON.stringify(results));
