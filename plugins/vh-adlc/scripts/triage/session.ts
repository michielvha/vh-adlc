import{createInterface}from"node:readline";
import{createReadStream,mkdirSync,existsSync}from"node:fs";
import{join}from"node:path";
import{git}from"./settings";
import{inspectIssues,inspectRemoval,inspectSources,verifyCommand,withVerificationBoundary}from"./verification";
import{buildReport,saveReport}from"./report";
import{executeBatch,planBatch}from"./execute";
import type{Adapter,Approval,Batch}from"./execute";
import type{Inventory,Settings}from"./types";
import type{Report}from"./report";

/** Trusted controller owns this process. Analysis and operator input are distinct streams.
 * No receipt-import or trust-flag operation exists. Cache bytes never enter live authority.
 */
async function sessionWithinBoundary(options:{config:Settings;inventory:Inventory;checks:Record<string,string[]>;output:string;analysis:AsyncIterable<string>;control?:AsyncIterable<string>;write:(line:string)=>void;adapter:Adapter;gate?:Parameters<typeof executeBatch>[4]["gate"]}){
 const{config,inventory}=options,reports=new Map<string,Report>(),batches=new Map<string,Batch>();
 if(inventory.schema_version!==1||inventory.repository!==config.repository||inventory.hostname!==config.hostname||inventory.source_commit!==git(config.root,"rev-parse","HEAD")||[inventory.issues,inventory.closed_issues,inventory.pulls,inventory.plans,inventory.coverage].some(value=>!Array.isArray(value)))throw Error("invalid fixed session inventory");
 mkdirSync(options.output,{recursive:true});
 async function handle(line:string,operator:boolean){
  let id:unknown=null;
  try{
   const request=JSON.parse(line);id=request.id;
   const args=request.params??{};let result:unknown;
   if(!operator){
    if(request.method==="inspect")result=inspectSources(config,args.paths,args.pass);
    else if(request.method==="inspect-issues")result=inspectIssues(config,inventory,args.numbers,args.pass);
    else if(request.method==="inspect-removal")result=inspectRemoval(config,args.path,args.before_commit,args.pass);
    else if(request.method==="verify"){
     if(typeof args.check!=="string"||!Object.hasOwn(options.checks,args.check))throw Error("check was not selected by the trusted controller");
     result=verifyCommand(config,options.checks[args.check],args.pass);
    }else if(request.method==="report"){
     const report=buildReport(config,inventory,args.observations,{indexRequests:args.index_requests});
     const path=saveReport(config,report,{output:join(options.output,`${report.run_id}.md`)});reports.set(report.run_id,report);result={report,path};
    }else if(request.method==="batch"){
     const report=reports.get(args.run_id);if(!report)throw Error("report is not owned by this session");
     const batch=planBatch(config,inventory,report,args.actions);batches.set(batch.hash,batch);result=batch;
    }else throw Error("analysis operation denied");
   }else{
    if(!["execute","resume"].includes(request.method))throw Error("operator operation denied");
    const approval=args.approval as Approval,batch=request.method==="resume"?args.batch as Batch:batches.get(approval?.batch_hash);
    if(!batch)throw Error("batch is not owned by this session");
    const journal=join(options.output,`journal-${approval?.batch_hash}.json`);
    if(request.method==="resume"&&(!/^[a-f0-9]{64}$/.test(approval?.batch_hash??"")||!existsSync(journal)))throw Error("resume requires the original journal");
    result=await executeBatch(config,batch,approval,options.adapter,{journal,gate:options.gate});
   }
   options.write(JSON.stringify({id,result,channel:operator?"operator":"analysis"}));
  }catch{options.write(JSON.stringify({id,error:"verification session request denied",channel:operator?"operator":"analysis"}));}
 }
 // Serialize both channels. Approval cannot race ahead of its report or batch.
 let pending=Promise.resolve();
 const consume=async(lines:AsyncIterable<string>,operator:boolean)=>{for await(const line of lines){if(!line.trim())continue;pending=pending.then(()=>handle(line,operator));await pending;}};
 await Promise.all([consume(options.analysis,false),...(options.control?[consume(options.control,true)]:[])]);await pending;
}
export function operatorInput(fd:number){
 if(!Number.isSafeInteger(fd)||fd<3)throw Error("operator input must be a separate inherited descriptor");
 return createInterface({input:createReadStream("",{fd,autoClose:false}),crlfDelay:Infinity});
}

export function verificationSession(options:Parameters<typeof sessionWithinBoundary>[0]){return withVerificationBoundary(()=>sessionWithinBoundary(options));}
