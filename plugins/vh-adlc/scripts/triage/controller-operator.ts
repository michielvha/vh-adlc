import{hasManagedControllerAuthority}from"./controller-authority";
import{existsSync,readFileSync,writeFileSync}from"node:fs";
import{join}from"node:path";
import{executeBatch,planBatch}from"./execute";
import type{Adapter,Approval,Batch}from"./execute";
import type{Report}from"./report";
import type{Inventory,Settings}from"./types";
import{lifecycleGate}from"./lifecycle-gate";
import{inspectIssues,inspectRemoval,inspectSources}from"./verification";

// Only the controller's parent input reaches this function. Analysis runs in a
// different client with stdin ignored and a fixed read-only tool transport.
export async function operatorController(options:{config:Settings;inventory:Inventory;report:Report;output:string;input:AsyncIterable<string>;adapter:Adapter;write:(line:string)=>void}){
 if(!hasManagedControllerAuthority())throw Error("managed operator requires current confined-controller authority");
 const{config,inventory,report}=options,batches=new Map<string,Batch>();
 for await(const line of options.input){
  if(!line.trim())continue;let id:unknown=null;
  try{
   const request=JSON.parse(line),args=request.params??{};id=request.id;let result:unknown;
   if(request.method==="batch"){
    const batch=planBatch(config,inventory,report,args.actions);const path=join(options.output,`batch-${batch.hash}.json`),bytes=JSON.stringify(batch);
    if(existsSync(path)){if(readFileSync(path,"utf8")!==bytes)throw Error("prior batch artifact differs");}else writeFileSync(path,bytes,{flag:"wx",mode:0o600});
    batches.set(batch.hash,batch);result=batch;
   }else if(request.method==="execute"||request.method==="resume"){
    const approval=args.approval as Approval,batch=request.method==="resume"?args.batch as Batch:batches.get(approval?.batch_hash);
    if(!batch||!/^[a-f0-9]{64}$/.test(approval?.batch_hash??""))throw Error("unowned batch");
    const journal=join(options.output,`journal-${approval.batch_hash}.json`);
    if(request.method==="resume"&&!existsSync(journal))throw Error("original journal required");
    result=await executeBatch(config,batch,approval,options.adapter,{journal,gate:gate=>lifecycleGate(config,gate)});
   }else if(request.method==="inspect")result=inspectSources(config,args.paths,args.pass,args.range);
   else if(request.method==="inspect-issues")result=inspectIssues(config,inventory,args.numbers,args.pass);
   else if(request.method==="inspect-removal")result=inspectRemoval(config,args.path,args.before_commit,args.pass);
   else throw Error("unknown operator operation");
   options.write(JSON.stringify({id,channel:"operator",result}));
  }catch{options.write(JSON.stringify({id,channel:"operator",error:"operator request denied; no unvalidated effect"}));}
 }
}
