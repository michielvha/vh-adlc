import{hasManagedControllerAuthority}from"./controller-authority";
import{verifyInputs}from"./controller";
import{existsSync,mkdirSync,readFileSync,readdirSync,realpathSync,writeFileSync}from"node:fs";
import{dirname,isAbsolute,join,relative,resolve,sep}from"node:path";
import{loadSettings}from"./settings";
import{approveBatch,executeBatch,type Approval,type Batch}from"./execute";
import{githubExecutor}from"./github";
import{lifecycleGate}from"./lifecycle-gate";
import{inspectIssues,inspectRemoval,inspectSources,inspectSearch,verifyCommand,verificationRecord,withVerificationBoundary,requiredVerificationFailed}from"./verification";
import{originalVerificationSelection,type VerificationSelection}from"./controller-preparation";
export type ControllerState={schema_version:1;checkout:string;plugin:string;input:string;verification:VerificationSelection;indexRequests:number[]};

export function newControllerOutput(checkout:string,path:string){
 const output=resolve(path);let ancestor=output;while(!existsSync(ancestor))ancestor=dirname(ancestor);
 const physical=resolve(realpathSync(ancestor),relative(ancestor,output)),inside=relative(realpathSync(checkout),physical);
 if(inside!==".."&&!inside.startsWith(`..${sep}`)&&!isAbsolute(inside))throw Error("controller output must be outside the selected checkout");
 if(existsSync(output)&&readdirSync(output).length)throw Error("controller output must be new; preserve prior evidence");
 mkdirSync(output,{recursive:true,mode:0o700});return output;
}
export async function resumeController(run:string,batchHash:string,output:string,approval:Approval,plugin:string){
 if(!hasManagedControllerAuthority())throw Error("managed recovery requires current confined-controller authority");
 if(!/^[a-f0-9]{64}$/.test(batchHash)||approval.batch_hash!==batchHash)throw Error("select the original exact batch");
 const state=JSON.parse(readFileSync(join(run,"controller-state.json"),"utf8"))as ControllerState;
 if(state.schema_version!==1||realpathSync(state.plugin)!==realpathSync(plugin))throw Error("prior controller state does not match the installed component");
 const attempt=newControllerOutput(state.checkout,output),config=loadSettings(state.checkout),batch=JSON.parse(readFileSync(join(run,`batch-${batchHash}.json`),"utf8"))as Batch;
 const journal=join(run,`journal-${batchHash}.json`);
 writeFileSync(join(attempt,"prior-run.json"),JSON.stringify({run:resolve(run),batch_hash:batchHash,journal},null,2));
 if(!existsSync(journal)||batch.hash!==batchHash||!verifyInputs(state.input,{checkout:state.checkout,plugin:state.plugin}).pass)throw Error("original journal or unchanged fixed input unavailable");
 if(JSON.stringify(batch.report.index_requests)!==JSON.stringify(state.indexRequests))throw Error("original operator selection changed");
 approveBatch(batch,approval.action_ids,approval.owner_statement);
 if(typeof batch.verification_hash!=="string")throw Error("original verification input unavailable");
 const selection=originalVerificationSelection(state.input,state.verification,batch.verification_hash);
 const receipts=new Set<string>();
 function collect(value:unknown){if(Array.isArray(value)){for(const entry of value)collect(entry);}else if(value&&typeof value==="object"){for(const[key,item]of Object.entries(value)){if(key==="receipt"&&typeof item==="string")receipts.add(item);else collect(item);}}}
 collect(batch.report.observations);
 return withVerificationBoundary(async()=>{
  // Re-run every selected required check, including failures omitted by analysis.
  const checks=selection.checks,removals=selection.removals,observations=[];
  for(const pass of ["primary","adversarial"]as const){
   for(const[name,argv]of Object.entries(checks)){const result=verifyCommand(config,argv,pass);observations.push({name,pass,result});if(!result.verified)requiredVerificationFailed(config);}
   for(const item of removals){const result=inspectRemoval(config,item.path,item.before_commit,pass);observations.push({name:item.path,pass,result});}
   for(const receipt of receipts){
    const record=verificationRecord(config,batch.source_commit,receipt);if(!record)throw Error("original verification selection unavailable");if(record.pass!==pass)continue;
    let actual;
    if(record.kind==="inspection"){
     if(record.reads.some(read=>read.start_line!==record.reads[0].start_line||read.end_line!==record.reads[0].end_line))throw Error("inconsistent original read range");
     actual=inspectSources(config,record.reads.map(read=>read.path),pass,{start_line:record.reads[0].start_line,limit:record.reads[0].end_line-record.reads[0].start_line+1});
    }else if(record.kind==="issues")actual=inspectIssues(config,batch.inventory,record.issues!.map(issue=>issue.number),pass);
    else if(record.kind==="search")actual=inspectSearch(config,record.search!.query,record.search!.scope,pass);
    else if(record.kind==="command"){
     if(!Object.values(checks).some(argv=>JSON.stringify(argv)===JSON.stringify(record.argv)))throw Error("original check was not selected by the operator");
     actual=verifyCommand(config,record.argv,pass);
    }else{
     if(!removals.some(item=>item.path===record.removal!.path&&item.before_commit===record.removal!.before_commit))throw Error("original removal was not selected by the operator");
     actual=inspectRemoval(config,record.removal!.path,record.removal!.before_commit,pass);
    }
    if(actual.receipt!==receipt)throw Error("material verification change requires a new approved batch");observations.push({receipt,pass,result:actual});
   }
  }
  writeFileSync(join(attempt,"observations.json"),JSON.stringify(observations,null,2));
  const result=await executeBatch(config,batch,approval,githubExecutor(config),{journal,gate:gate=>lifecycleGate(config,gate)});
  writeFileSync(join(attempt,"result.json"),JSON.stringify(result,null,2));return result;
 },{cacheRoot:join(run,"verification-cache")});
}
