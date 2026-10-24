import{existsSync,readFileSync,renameSync,writeFileSync,realpathSync}from"node:fs";
import{dirname,join,basename}from"node:path";
import{repositoryLockPath}from"./execution-lock";
import type{Settings}from"./types";
type Pending={batch_hash:string;action_id:string;journal:string};
// Access only while holding the repository kernel lock. Retain pending attempts
// across caller-selected output paths; successful/known-denied journals retire them.
export function executionHistory(config:Settings,journal:string,batchHash:string){
 const path=repositoryLockPath(config)+".pending.json",original=join(realpathSync(dirname(journal)),basename(journal));
 let pending:Pending[]=[];
 if(existsSync(path)){
  const data=JSON.parse(readFileSync(path,"utf8"));
  if(data.schema_version!==1||!Array.isArray(data.pending)||data.pending.some((entry:any)=>!entry||typeof entry.journal!=="string"||!/^[a-f0-9]{64}$/.test(entry.batch_hash)||typeof entry.action_id!=="string"))throw Error("unreadable repository outcome history");
  pending=data.pending;
 }
 pending=pending.filter(entry=>{
  try{
   const previous=JSON.parse(readFileSync(entry.journal,"utf8"));
   if(previous.schema_version!==1||previous.batch_hash!==entry.batch_hash||!Array.isArray(previous.completed)||!Array.isArray(previous.uncertain))return true;
   return !previous.completed.includes(entry.action_id)&&(previous.started===entry.action_id||previous.uncertain.includes(entry.action_id));
  }catch{return true;}
 });
 const save=()=>{writeFileSync(path+".tmp",JSON.stringify({schema_version:1,pending}),{mode:0o600});renameSync(path+".tmp",path);};save();
 return{
  blocked:pending.some(entry=>entry.batch_hash!==batchHash||entry.journal!==original),
  resolve(actionId:string){pending=pending.filter(entry=>entry.batch_hash!==batchHash||entry.action_id!==actionId||entry.journal!==original);save();},
  register(actionId:string){const entry={batch_hash:batchHash,action_id:actionId,journal:original};if(!pending.some(old=>old.batch_hash===batchHash&&old.action_id===actionId&&old.journal===original))pending.push(entry);save();},
 };
}
