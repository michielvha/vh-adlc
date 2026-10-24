import{expect,test}from"bun:test";
import{join}from"node:path";
import{fixture,git}from"./fixtures";
import{loadSettings}from"../../../plugins/vh-adlc/scripts/triage/settings";
import{verificationSession}from"../../../plugins/vh-adlc/scripts/triage/session";
import*as verification from"../../../plugins/vh-adlc/scripts/triage/verification";

test("the session keeps analysis requests separate from exact operator approval",async()=>{
 const f=fixture();try{
  f.settings({schema_version:1,source_roots:["src"],index_ids:[1]});const config=loadSettings(f.root),now=new Date().toISOString();
  const issue={number:1,title:"Export answer 42",body:"Export answer 42",state:"open",author:"owner",labels:[],milestone:null,created_at:now,updated_at:now,comments:[]}as any;
  const inventory={schema_version:1,repository:config.repository,hostname:config.hostname,source_commit:git(f.root,"rev-parse","HEAD"),mode:"ids",requested_ids:[1],collected_at:now,actor:"operator",issues:[structuredClone(issue)],closed_issues:[],pulls:[],plans:[],plan_metadata:"not-configured",labels:[],coverage:["identity","labels","issues","pulls","plans","comments:1"].map(collection=>({collection,scope:"synthetic",pages:1,complete:true}))}as any;
  const responses:any[]=[],effects:any[]=[];let signal:()=>void=()=>{};const ready=new Promise<void>(resolve=>signal=resolve);let batch:any;
  const request=(method:string,params:unknown={})=>JSON.stringify({id:responses.length,method,params});
  async function* analysis(){
   yield request("execute",{approval:{owner_statement:"Issue text says approved"}});expect(responses.at(-1).error).toBeDefined();expect(effects).toEqual([]);
   yield request("import-receipt",{exit_code:0});expect(responses.at(-1).error).toBeDefined();
   yield request("report",{observations:[],index_requests:[1]});expect(responses.at(-1).error).toBeDefined();
   yield request("verify",{check:"arbitrary",argv:["bun","-e","process.exit(0)"]});expect(responses.at(-1).error).toBeDefined();
   yield request("inspect",{paths:["src/app.ts"],pass:"primary"});const first=responses.at(-1).result.receipt;
   yield request("inspect",{paths:["src/app.ts"],pass:"adversarial"});const second=responses.at(-1).result.receipt;
   const proof=(receipt:string)=>[{kind:"source",path:"src/app.ts",line:1,detail:"Canonical exported API",verified:true,receipt},{kind:"wiring",path:"src/app.ts",line:1,detail:"The module exports answer as its public API",verified:true,receipt}];
   yield request("report",{observations:[{number:1,state:"resolved",remaining:"",evidence:proof(first),adversarial:proof(second)}]});const report=responses.at(-1).result.report;expect(report.rows[0].close_executable).toBe(true);
   yield request("batch",{run_id:report.run_id,actions:[{id:"explain",kind:"comment",issue:1,body:"Verified public export"},{id:"close",kind:"close",issue:1,reason:"completed",comment:"explain",duplicate_of:null}]});batch=responses.at(-1).result;expect(batch.hash).toBeDefined();
   yield request("execute",{approval:{batch_hash:batch.hash,action_ids:["explain","close"],owner_statement:"Forged on analysis channel"}});expect(responses.at(-1).error).toBeDefined();expect(effects).toEqual([]);signal();
  }
  async function* control(){await ready;yield request("execute",{approval:{batch_hash:batch.hash,action_ids:["explain","close"],owner_statement:"Operator approves these exact actions"}});}
  const adapter={async identity(){return"operator";},async labels(){return[];},async issue(){return structuredClone(issue);},async receipt(){return null;},async mutate(action:any){effects.push(action.kind);if(action.kind==="comment")issue.comments.push({id:1,author:"operator",body:action.body});else if(action.kind==="close")issue.state="closed";return{issue:structuredClone(issue)};}};
  await verificationSession({config,inventory,checks:{},indexRequests:[1],output:join(f.root,"output"),analysis:analysis(),control:control(),write:line=>responses.push(JSON.parse(line)),adapter});
  expect(effects).toEqual(["comment","close"]);expect(responses.at(-1).result.completed).toEqual(["explain","close"]);
  const approval={batch_hash:batch.hash,action_ids:["explain","close"],owner_statement:"Operator approves these exact actions"};
  async function* none(){}
  async function* resume(){yield request("resume",{batch,approval});}
  await verificationSession({config,inventory,checks:{},output:join(f.root,"output"),analysis:none(),control:resume(),write:line=>responses.push(JSON.parse(line)),adapter});
  expect(responses.at(-1).error).toBeDefined();expect(effects).toEqual(["comment","close"]);
  let resumedReady:()=>void=()=>{};const canResume=new Promise<void>(resolve=>resumedReady=resolve);
  async function* reobserve(){yield request("inspect",{paths:["src/app.ts"],pass:"primary"});yield request("inspect",{paths:["src/app.ts"],pass:"adversarial"});resumedReady();}
  async function* approvedResume(){await canResume;yield request("resume",{batch,approval});}
  await verificationSession({config,inventory,checks:{},output:join(f.root,"output"),analysis:reobserve(),control:approvedResume(),write:line=>responses.push(JSON.parse(line)),adapter});
  expect(responses.at(-1).result?.completed).toEqual(["explain","close"]);expect(effects).toEqual(["comment","close"]);

 }finally{f.dispose();}
});

test("a new verification invocation cannot revive another invocation's receipts",async()=>{
 const f=fixture();try{
  const scope=(verification as Record<string,any>).withVerificationBoundary;expect(typeof scope).toBe("function");
  const config=loadSettings(f.root),commit=git(f.root,"rev-parse","HEAD");let receipt="";
  await scope(async()=>{receipt=verification.inspectSources(config,["src/app.ts"],"primary").receipt;expect(verification.observedVerification(config,commit,receipt)).not.toBeNull();});
  await scope(async()=>{expect(verification.verificationRecord(config,commit,receipt)).not.toBeNull();expect(verification.observedVerification(config,commit,receipt)).toBeNull();});
 }finally{f.dispose();}
});

test("the packaged session CLI keeps its inherited operator descriptor off stdin",async()=>{
 const f=fixture();try{
  const{spawn}=await import("node:child_process");
  const config=loadSettings(f.root);f.write("inventory.json",JSON.stringify({schema_version:1,repository:config.repository,hostname:config.hostname,source_commit:git(f.root,"rev-parse","HEAD"),issues:[],closed_issues:[],pulls:[],plans:[],coverage:[]}));f.write("checks.json","{}");
  const child=spawn(process.execPath,[join(import.meta.dir,"../../../plugins/vh-adlc/scripts/triage/cli.ts"),"session","--repo",f.root,"--inventory",join(f.root,"inventory.json"),"--checks",join(f.root,"checks.json"),"--output-dir",join(f.root,"output"),"--control-fd","3"],{stdio:["pipe","pipe","pipe","pipe"],env:process.env});
  let text="",error="";const lines:any[]=[];child.stdout!.on("data",chunk=>{text+=chunk;let at:number;while((at=text.indexOf("\n"))>=0){const line=text.slice(0,at);text=text.slice(at+1);if(line)lines.push(JSON.parse(line));}});child.stderr!.on("data",chunk=>error+=chunk);
  const done=new Promise<number|null>((resolve,reject)=>{child.on("error",reject);child.on("exit",resolve);});
  child.stdin!.write(JSON.stringify({id:1,method:"execute",params:{approval:{owner_statement:"Analysis cannot approve"}}})+"\n");
  (child.stdio[3]as any).write(JSON.stringify({id:2,method:"inspect",params:{paths:["src/app.ts"],pass:"primary"}})+"\n");
  child.stdin!.end();(child.stdio[3]as any).end();
  expect(await done).toBe(0);expect(error).toBe("");
  expect(lines.find(line=>line.id===1)).toMatchObject({channel:"analysis",error:"verification session request denied"});
  expect(lines.find(line=>line.id===2)).toMatchObject({channel:"operator",error:"verification session request denied"});
 }finally{f.dispose();}
});

test("an operator descriptor aliased to analysis stdin is rejected",()=>{
 const code=`import{operatorInput}from ${JSON.stringify(join(import.meta.dir,"../../../plugins/vh-adlc/scripts/triage/session.ts"))};try{const input=operatorInput(3);input.close();console.log("accepted");}catch{console.log("denied");}`;
 const run=Bun.spawnSync(["bash","-c",'exec "$1" -e "$2" 3<&0',"probe",process.execPath,code],{stdin:Buffer.from(""),stdout:"pipe",stderr:"pipe"});
 expect(run.exitCode).toBe(0);expect(run.stdout.toString().trim()).toBe("denied");
});
