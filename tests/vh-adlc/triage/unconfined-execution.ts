import{fixture,git}from"./fixtures";
import{loadSettings}from"../../../plugins/vh-adlc/scripts/triage/settings";
import{inspectSources,withVerificationBoundary}from"../../../plugins/vh-adlc/scripts/triage/verification";
import{buildReport}from"../../../plugins/vh-adlc/scripts/triage/report";
import{planBatch,approveBatch,executeBatch}from"../../../plugins/vh-adlc/scripts/triage/execute";
import{join}from"node:path";
import{resumeController}from"../../../plugins/vh-adlc/scripts/triage/controller-recovery";
import{operatorController}from"../../../plugins/vh-adlc/scripts/triage/controller-operator";
const f=fixture(),effects:string[]=[];let denied=false,result:unknown;try{
 f.settings({schema_version:1,source_roots:["src"]});const config=loadSettings(f.root),now=new Date().toISOString();
 const issue:any={number:1,title:"Export answer 42",body:"Export answer 42",state:"open",author:"owner",labels:[],milestone:null,created_at:now,updated_at:now,comments:[]};
 const inventory:any={schema_version:1,repository:config.repository,hostname:config.hostname,source_commit:git(f.root,"rev-parse","HEAD"),mode:"ids",requested_ids:[1],collected_at:now,actor:"fixture-operator",issues:[structuredClone(issue)],closed_issues:[],pulls:[],plans:[],labels:[],plan_metadata:"not-configured",coverage:["identity","labels","issues","pulls","plans","comments:1"].map(collection=>({collection,scope:"synthetic-direct-import-reproduction",pages:1,complete:true}))};
 const adapter:any={identity:async()=>"fixture-operator",labels:async()=>[],issue:async()=>structuredClone(issue),receipt:async()=>null,mutate:async(action:any)=>{effects.push(action.kind);if(action.kind==="comment")issue.comments.push({id:1,author:"fixture-operator",body:action.body,created_at:now});if(action.kind==="close")issue.state="closed";return{issue:structuredClone(issue)};}};
 await withVerificationBoundary(async()=>{
  const proof=(pass:"primary"|"adversarial")=>{const receipt=inspectSources(config,["src/app.ts"],pass).receipt;return[{kind:"source",path:"src/app.ts",line:1,detail:"Observed public export",verified:true,receipt},{kind:"wiring",path:"src/app.ts",line:1,detail:"Module exposes its public API",verified:true,receipt}];};
  const report=buildReport(config,inventory,[{number:1,state:"resolved",remaining:"",evidence:proof("primary"),adversarial:proof("adversarial")}]),batch=planBatch(config,inventory,report,[{id:"explain",kind:"comment",issue:1,body:"Observed the export"},{id:"close",kind:"close",issue:1,reason:"completed",comment:"explain",duplicate_of:null}]);
  result=await executeBatch(config,batch,approveBatch(batch,["explain","close"],"Fixture approval only"),adapter,{journal:join(f.root,".vh-adlc/direct-import.json")});

 });
}catch{denied=true;}finally{f.dispose();}
let recoveryDenied=false,operatorDenied=false;
try{await resumeController("/nonexistent-original-run","a".repeat(64),"/nonexistent-attempt",{}as any,"/nonexistent-plugin");}catch(error){recoveryDenied=error instanceof Error&&error.message.includes("confined-controller authority");}
try{await operatorController({}as any);}catch(error){operatorDenied=error instanceof Error&&error.message.includes("confined-controller authority");}
console.log(JSON.stringify({denied,result,effects,recoveryDenied,operatorDenied}));
