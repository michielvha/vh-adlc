import{existsSync,readFileSync,renameSync,writeFileSync,realpathSync,appendFileSync,openSync,closeSync,fsyncSync,truncateSync}from"node:fs";
import{dirname,join,basename}from"node:path";
import{createHash,randomUUID}from"node:crypto";
import{repositoryLockPath}from"./execution-lock";
import{isExecutionHistoryCapability}from"./execute";
import type{Settings}from"./types";
type Pending={batch_hash:string;action_id:string;journal:string};
type Checkpoint={batch_hash:string;digest:string|null;next?:{digest:string;payload:string}};
type State={pending:Pending[];journals:Record<string,Checkpoint>};
const digest=(bytes:string)=>createHash("sha256").update(bytes).digest("hex"),hex=(value:unknown)=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
function sync(path:string){const fd=openSync(path,"r");try{fsyncSync(fd);}finally{closeSync(fd);}}
function corrupt():never{throw Error("unreadable or changed repository outcome history");}
function atomic(path:string,bytes:string){writeFileSync(path+".tmp",bytes,{mode:0o600});sync(path+".tmp");renameSync(path+".tmp",path);sync(dirname(path));}
function validState(state:State){
 return state&&Array.isArray(state.pending)&&state.journals&&typeof state.journals==="object"&&!Array.isArray(state.journals)&&
 state.pending.every(entry=>entry&&hex(entry.batch_hash)&&typeof entry.action_id==="string"&&typeof entry.journal==="string")&&
 Object.values(state.journals).every(entry=>entry&&hex(entry.batch_hash)&&(entry.digest===null||hex(entry.digest))&&(!entry.next||hex(entry.next.digest)&&typeof entry.next.payload==="string"&&digest(entry.next.payload)===entry.next.digest));
}
// Engine-only, under the repository kernel lock. The persistent inode anchors
// the chain. Hashes detect damaged state, not an administrator replacing the
// trusted control plane; confined analysis tools cannot access these files.
export function executionHistory(config:Settings,journal:string,batchHash:string,capability?:unknown){
 if(!isExecutionHistoryCapability(capability))throw Error("repository outcome history is engine-private");
 const lock=repositoryLockPath(config),log=lock+".history.jsonl",head=lock+".history-head.json",seed=lock+".init.json",ready=lock+".ready.json",original=join(realpathSync(dirname(journal)),basename(journal));
 if(existsSync(lock+".pending.json"))corrupt();
 let anchor:any;const stored=readFileSync(lock,"utf8"),committed=stored.endsWith("!"),marker=committed?stored.slice(0,-1):stored,initial=()=>!existsSync(log)&&!existsSync(head)&&!existsSync(ready);
 const validAnchor=(value:any)=>value?.schema_version===2&&typeof value.genesis==="string"&&["initializing","ready"].includes(value.phase);
 if(!marker){
  if(committed||!initial())corrupt();
  if(existsSync(seed)){try{anchor=JSON.parse(readFileSync(seed,"utf8"));}catch{corrupt();}}
  else{anchor={schema_version:2,genesis:randomUUID(),phase:"initializing"};atomic(seed,JSON.stringify(anchor));}
  if(!validAnchor(anchor)||anchor.phase!=="initializing")corrupt();
  writeFileSync(lock,JSON.stringify(anchor),{mode:0o600});sync(lock);
 }else{try{anchor=JSON.parse(marker);}catch{
  // Only an unfinished first anchor write can be completed from its durable
  // seed. Once history exists, a damaged or missing anchor still fails closed.
  if(committed||!initial()||!existsSync(seed))corrupt();const bytes=readFileSync(seed,"utf8");
  try{anchor=JSON.parse(bytes);}catch{corrupt();}
  if(!validAnchor(anchor)||anchor.phase!=="initializing"||!bytes.startsWith(marker))corrupt();
  writeFileSync(lock,bytes,{mode:0o600});sync(lock);
 }}
 if(!validAnchor(anchor))corrupt();
 if(existsSync(ready)){
  let phase:any;try{phase=JSON.parse(readFileSync(ready,"utf8"));}catch{corrupt();}
  if(phase.schema_version!==1||phase.genesis!==anchor.genesis)corrupt();
 }
 if(committed){if(!existsSync(ready))corrupt();anchor.phase="ready";}
 let state:State={pending:[],journals:{}},sequence=0,previous=digest(anchor.genesis),bytes=0,poisoned=false;
 const saveHead=()=>atomic(head,JSON.stringify({anchor:anchor.genesis,sequence,hash:previous,bytes}));
 const persist=()=>{
  if(poisoned)throw Error("repository outcome history requires reload");
  try{
   const payload=JSON.stringify({sequence:sequence+1,previous,state}),hash=digest(payload),line=JSON.stringify({payload,hash})+"\n";
   appendFileSync(log,line,{mode:0o600});sync(log);sequence++;previous=hash;bytes+=Buffer.byteLength(line);saveHead();
  }catch(error){poisoned=true;throw error;}
 };
 if(existsSync(log)){
  try{
   const content=readFileSync(log,"utf8"),last=content.lastIndexOf("\n"),complete=last<0?"":content.slice(0,last+1),tail=content.slice(last+1),records:{sequence:number;hash:string;bytes:number}[]=[];
   for(const line of complete.split("\n").slice(0,-1)){
    const record=JSON.parse(line);if(typeof record.payload!=="string"||digest(record.payload)!==record.hash)corrupt();
    const event=JSON.parse(record.payload);if(event.sequence!==sequence+1||event.previous!==previous||!validState(event.state))corrupt();
    sequence++;previous=record.hash;bytes+=Buffer.byteLength(line+"\n");state=event.state;records.push({sequence,hash:previous,bytes});
   }
   if(anchor.phase==="initializing"){
    if(sequence>1||state.pending.length||Object.keys(state.journals).length)corrupt();
    if(!sequence){if(existsSync(head))corrupt();truncateSync(log,0);sync(log);persist();}
    else{if(tail)corrupt();saveHead();}
   }else{
    if(!existsSync(head))corrupt();const saved=JSON.parse(readFileSync(head,"utf8")),committed=records.find(record=>record.sequence===saved.sequence);
    if(saved.anchor!==anchor.genesis||!committed||committed.hash!==saved.hash||committed.bytes!==saved.bytes||sequence-saved.sequence>1)corrupt();
    // A partial append after the committed head never authorized an effect.
    // A complete valid successor is an interrupted head publication.
    if(tail){if(saved.sequence!==sequence)corrupt();truncateSync(log,bytes);sync(log);}
    if(saved.sequence!==sequence)saveHead();
   }
  }catch{corrupt();}
 }else{
  if(anchor.phase!=="initializing"||existsSync(head))corrupt();persist();
 }
 if(anchor.phase==="initializing"){
  atomic(ready,JSON.stringify({schema_version:1,genesis:anchor.genesis}));
  // One appended commit byte cannot truncate the genesis. Its persistent inode
  // also prevents deletion of every side file from masquerading as a new run.
  appendFileSync(lock,"!");sync(lock);anchor.phase="ready";
 }
 if(Object.entries(state.journals).some(([path,checkpoint])=>path!==original&&checkpoint.batch_hash===batchHash))throw Error("batch requires its original triage execution journal");
 let checkpoint=state.journals[original];
 if(checkpoint&&checkpoint.batch_hash!==batchHash)throw Error("changed triage execution journal batch");
 if(checkpoint?.next){
  const current=existsSync(original)?digest(readFileSync(original,"utf8")):null;
  if(current!==checkpoint.digest&&current!==checkpoint.next.digest)throw Error("unreadable or changed triage execution journal");
  if(current!==checkpoint.next.digest)atomic(original,checkpoint.next.payload);
  checkpoint.digest=checkpoint.next.digest;delete checkpoint.next;persist();
 }
 if(existsSync(original)){
  if(!checkpoint||checkpoint.digest!==digest(readFileSync(original,"utf8")))throw Error("unreadable or changed triage execution journal");
 }else if(checkpoint)throw Error("missing original triage execution journal");
 const saved=()=>JSON.parse(readFileSync(original,"utf8"));
 const matches=(entry:Pending,actionId?:string)=>entry.batch_hash===batchHash&&entry.journal===original&&(actionId===undefined||entry.action_id===actionId);
 if(checkpoint){
  const data=saved(),remaining=state.pending.filter(entry=>!matches(entry)||!data.completed.includes(entry.action_id)&&!data.denied?.includes(entry.action_id));
  if(remaining.length!==state.pending.length){state.pending=remaining;persist();}
 }
 return{
  blocked:state.pending.some(entry=>!matches(entry)),
  attempted(actionId:string){return state.pending.some(entry=>matches(entry,actionId));},
  save(payload:string){
   if(poisoned)throw Error("repository outcome history requires reload");
   const data=JSON.parse(payload);if(data.schema_version!==1||data.batch_hash!==batchHash)throw Error("invalid engine journal checkpoint");
   checkpoint??={batch_hash:batchHash,digest:null};state.journals[original]=checkpoint;
   checkpoint.next={digest:digest(payload),payload};persist();
   try{atomic(original,payload);}catch(error){poisoned=true;throw error;}
   checkpoint.digest=checkpoint.next.digest;delete checkpoint.next;persist();
  },
  resolve(actionId:string){
   if(poisoned)throw Error("repository outcome history requires reload");const data=saved();
   if(state.journals[original]?.digest!==digest(readFileSync(original,"utf8"))||!data.completed.includes(actionId)&&!data.denied?.includes(actionId))throw Error("outcome lacks an engine checkpoint");
   const pending=state.pending.filter(entry=>!matches(entry,actionId));if(pending.length!==state.pending.length){state.pending=pending;persist();}
  },
  register(actionId:string){if(!state.pending.some(entry=>matches(entry,actionId))){state.pending.push({batch_hash:batchHash,action_id:actionId,journal:original});persist();}},
 };
}
