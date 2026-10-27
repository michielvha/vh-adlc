import{mock}from"bun:test";
import*as fs from"node:fs";
const native={...fs},[root,batchPath,journal,effects,point,marker]=process.argv.slice(2);
const readJournal=()=>{try{return JSON.parse(native.readFileSync(journal,"utf8"));}catch{return null;}};
const completed=(record:any)=>{
 if(readJournal()?.completed?.includes("request"))return true;
 return Object.values(record?.state?.journals??{}).some((entry:any)=>{try{return JSON.parse(entry.next?.payload??"null")?.completed?.includes("request");}catch{return false;}});
};
const die=()=>{native.writeFileSync(marker,point);process.kill(-process.pid,"SIGKILL");};
mock.module("node:fs",()=>({...native,
 writeFileSync(path:any,data:any,...rest:any[]){
  const target=String(path),bytes=Buffer.isBuffer(data)?data:Buffer.from(String(data));
  if(point==="anchor-partial"&&target.endsWith(".lock")&&bytes.toString().includes('"genesis"')){native.writeFileSync(path,bytes.subarray(0,Math.floor(bytes.length/2)));die();}
  if(point==="phase-write"&&(target.endsWith(".lock")&&bytes.toString().includes('"phase":"ready"')||target.endsWith(".ready.json.tmp"))){native.writeFileSync(path,"");die();}
  if(point==="plan-write"&&target.includes("plans/")&&target.includes("link.md")&&bytes.toString().includes("https://")){native.writeFileSync(path,bytes.subarray(0,Math.floor(bytes.length/2)));die();}
  const result=(native.writeFileSync as any)(path,data,...rest);if(point==="init-anchor"&&String(path).endsWith(".lock")&&String(data).includes('"genesis"'))die();return result;},
 appendFileSync(path:any,data:any,...rest:any[]){
  if(point==="phase-marker"&&String(path).endsWith(".lock")&&String(data)==="!")die();
  let record:any;try{record=JSON.parse(JSON.parse(String(data)).payload);}catch{}
  if(point==="partial-log"&&String(path).endsWith(".history.jsonl")&&completed(record)){(native.appendFileSync as any)(path,String(data).slice(0,Math.floor(String(data).length/2)),...rest);die();}
  const result=(native.appendFileSync as any)(path,data,...rest);if(point==="phase-marker-done"&&String(path).endsWith(".lock")&&String(data)==="!")die();if(point==="init-log"&&String(path).endsWith(".history.jsonl")&&record?.sequence===1)die();return result;
 },
 renameSync(from:any,to:any){
  if(point==="head-lag"&&String(to).endsWith(".history-head.json")&&completed(null))die();
  const result=native.renameSync(from,to);
  if(to===journal&&(point==="journal-complete"&&readJournal()?.completed?.includes("request")||point==="journal-started"&&readJournal()?.started==="request"||point==="journal-gated"&&readJournal()?.gated?.includes("link")))die();return result;
 },
}));
const{loadSettings}=await import("../../../plugins/vh-adlc/scripts/triage/settings");
const{executeBatch,approveBatch}=await import("../../../plugins/vh-adlc/scripts/triage/execute");
const config=loadSettings(root),batch=JSON.parse(native.readFileSync(batchPath,"utf8"));
const adapter={identity:async()=>"operator",labels:async()=>[],issue:async()=>{throw Error("No issue");},receipt:async(key:string)=>{try{return JSON.parse(native.readFileSync(effects,"utf8"))[key]??null;}catch{return null;}},mutate:async(_action:any,key:string)=>{let data:any={};try{data=JSON.parse(native.readFileSync(effects,"utf8"));}catch{}if(data[key])throw Error("Duplicate fixture creation");const result={number:10,url:`https://${config.hostname}/${config.repository}/issues/10`};data[key]=result;native.writeFileSync(effects,JSON.stringify(data));return result;}};
await executeBatch(config,batch,approveBatch(batch,batch.actions.map((action:any)=>action.id),"Approve exact test-only recovery batch"),adapter,{journal,gate:async()=>true});
