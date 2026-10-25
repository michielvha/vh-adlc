import{existsSync,readFileSync,renameSync,writeFileSync,realpathSync,appendFileSync,openSync,closeSync,fsyncSync}from"node:fs";
import{dirname,join,basename}from"node:path";
import{createHash,randomUUID}from"node:crypto";
import{repositoryLockPath}from"./execution-lock";
import{isExecutionHistoryCapability}from"./execute";
import type{Settings}from"./types";
type Pending={batch_hash:string;action_id:string;journal:string};
type Checkpoint={batch_hash:string;digest:string};
type State={pending:Pending[];journals:Record<string,Checkpoint>};
const digest=(bytes:string)=>createHash("sha256").update(bytes).digest("hex");
function sync(path:string){const fd=openSync(path,"r");try{fsyncSync(fd);}finally{closeSync(fd);}}
function corrupt():never{throw Error("unreadable or changed repository outcome history");}
// Only the engine, while holding the repository kernel lock, may append outcomes.
// The persistent lock inode anchors an append-only chain and its latest head.
// This detects missing/edited artifacts, not an administrator rewriting all of
// the trusted control plane. Analysis tools cannot access any of these files.
export function executionHistory(config:Settings,journal:string,batchHash:string,capability?:unknown){
 if(!isExecutionHistoryCapability(capability))throw Error("repository outcome history is engine-private");
 const lock=repositoryLockPath(config),log=lock+".history.jsonl",head=lock+".history-head.json",original=join(realpathSync(dirname(journal)),basename(journal));
 if(existsSync(lock+".pending.json"))corrupt();
 let anchor=readFileSync(lock,"utf8"),state:State={pending:[],journals:{}},previous="",sequence=0;
 const persist=()=>{
  const payload=JSON.stringify({sequence:++sequence,previous,state}),hash=digest(payload);
  appendFileSync(log,JSON.stringify({payload,hash})+"\n",{mode:0o600});sync(log);
  writeFileSync(head+".tmp",JSON.stringify({anchor,sequence,hash}),{mode:0o600});sync(head+".tmp");renameSync(head+".tmp",head);sync(dirname(head));previous=hash;
 };
 if(!anchor){
  if(existsSync(log)||existsSync(head))corrupt();
  anchor=JSON.stringify({schema_version:1,genesis:randomUUID()});writeFileSync(lock,anchor,{mode:0o600});sync(lock);previous=digest(anchor);persist();
 }else{
  try{
   const genesis=JSON.parse(anchor);if(genesis.schema_version!==1||typeof genesis.genesis!=="string"||!existsSync(log)||!existsSync(head))corrupt();
   previous=digest(anchor);
   const bytes=readFileSync(log,"utf8");if(!bytes.endsWith("\n"))corrupt();
   for(const line of bytes.slice(0,-1).split("\n")){
    const record=JSON.parse(line);if(typeof record.payload!=="string"||digest(record.payload)!==record.hash)corrupt();
    const event=JSON.parse(record.payload);if(event.sequence!==++sequence||event.previous!==previous||!Array.isArray(event.state?.pending)||!event.state?.journals)corrupt();
    state=event.state;previous=record.hash;
   }
   const latest=JSON.parse(readFileSync(head,"utf8"));if(latest.anchor!==anchor||latest.sequence!==sequence||latest.hash!==previous)corrupt();
  }catch{corrupt();}
 }
 if(Object.entries(state.journals).some(([path,checkpoint])=>path!==original&&checkpoint.batch_hash===batchHash))throw Error("batch requires its original triage execution journal");
 const checkpoint=state.journals[original];
 if(existsSync(original)){
  if(!checkpoint||checkpoint.batch_hash!==batchHash||checkpoint.digest!==digest(readFileSync(original,"utf8")))throw Error("unreadable or changed triage execution journal");
 }else if(checkpoint)throw Error("missing original triage execution journal");
 // Crash recovery may retire only outcomes already checkpointed by this engine.
 if(checkpoint){
  const saved=JSON.parse(readFileSync(original,"utf8"));
  const remaining=state.pending.filter(entry=>entry.journal!==original||entry.batch_hash!==batchHash||!saved.completed.includes(entry.action_id)&&!saved.denied?.includes(entry.action_id));
  if(remaining.length!==state.pending.length){state.pending=remaining;persist();}
 }
 return{
  blocked:state.pending.some(entry=>entry.batch_hash!==batchHash||entry.journal!==original),
  checkpoint(){state.journals[original]={batch_hash:batchHash,digest:digest(readFileSync(original,"utf8"))};persist();},
  resolve(actionId:string){
   const saved=JSON.parse(readFileSync(original,"utf8"));
   if(state.journals[original]?.digest!==digest(readFileSync(original,"utf8"))||!saved.completed.includes(actionId)&&!saved.denied?.includes(actionId))throw Error("outcome lacks an engine checkpoint");
   const pending=state.pending.filter(entry=>entry.batch_hash!==batchHash||entry.action_id!==actionId||entry.journal!==original);
   if(pending.length!==state.pending.length){state.pending=pending;persist();}
  },
  register(actionId:string){const entry={batch_hash:batchHash,action_id:actionId,journal:original};if(!state.pending.some(old=>old.batch_hash===batchHash&&old.action_id===actionId&&old.journal===original)){state.pending.push(entry);persist();}},
 };
}
