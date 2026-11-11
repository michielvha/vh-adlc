import{test}from"./boundary-test";
import{expect}from"bun:test";
import{mkdirSync,mkdtempSync,rmSync,readFileSync,writeFileSync,chmodSync,existsSync}from"node:fs";
import{tmpdir}from"node:os";
import{join,resolve}from"node:path";
import{fixture,git}from"./fixtures";
import{loadSettings}from"../../../plugins/vh-adlc/scripts/triage/settings";
import{inspectSources,withVerificationBoundary}from"../../../plugins/vh-adlc/scripts/triage/verification";
import{buildReport}from"../../../plugins/vh-adlc/scripts/triage/report";
import{operatorController}from"../../../plugins/vh-adlc/scripts/triage/controller-operator";
import{MutationFailure}from"../../../plugins/vh-adlc/scripts/triage/execute";
import{exportInputs}from"./native";
import{resumeController}from"../../../plugins/vh-adlc/scripts/triage/controller-recovery";
import{prepareVerification}from"../../../plugins/vh-adlc/scripts/triage/controller-preparation";

test("managed recovery reobserves the original batch and journal with one comment total",async()=>{
 const f=fixture(),control=mkdtempSync(join(tmpdir(),"triage-managed-recovery-"));try{
  f.settings({schema_version:1,source_roots:["src"]});
  const config=loadSettings(f.root),now=new Date().toISOString(),issue:any={number:1,title:"Answer export",body:"Export answer",state:"open",author:"owner",labels:[],milestone:null,created_at:now,updated_at:now,comments:[]};
  const inventory:any={schema_version:1,repository:config.repository,hostname:config.hostname,source_commit:git(f.root,"rev-parse","HEAD"),mode:"ids",requested_ids:[1],collected_at:now,actor:"operator",issues:[structuredClone(issue)],closed_issues:[],pulls:[],plans:[],plan_metadata:"not-configured",labels:[],coverage:["identity","labels","issues","pulls","plans","comments:1"].map(collection=>({collection,scope:collection==="issues"?"all-states":collection==="pulls"?"all-closed-pulls":"fixture",pages:1,complete:true}))};
  const input=join(control,"input"),analysis=join(control,"analysis"),database=join(control,"api.json"),tools=join(control,"tools"),plugin=resolve(import.meta.dir,"../../../plugins/vh-adlc");mkdirSync(analysis,{recursive:true});mkdirSync(tools);
  writeFileSync(join(control,"snapshot.json"),JSON.stringify(inventory));exportInputs({checkout:f.root,plugin,snapshot:join(control,"snapshot.json"),output:input});
  process.env.VH_ADLC_TRIAGE_VERIFICATION_CACHE=join(analysis,"verification-cache");
  const responses:any[]=[];let batch:any;
  const selection={checks:{"uncited-check":["bun","-e","process.exit(0)"]}};
  await withVerificationBoundary(async()=>{
   prepareVerification(config,input,selection);
   const proof=(pass:"primary"|"adversarial")=>{const receipt=inspectSources(config,["src/app.ts"],pass).receipt;return[{kind:"source",path:"src/app.ts",line:1,detail:"Actual export",verified:true,receipt},{kind:"wiring",path:"src/app.ts",line:1,detail:"Public module export",verified:true,receipt}];};
   const report=buildReport(config,inventory,[{number:1,state:"resolved",remaining:"",evidence:proof("primary"),adversarial:proof("adversarial")}]);
   let adapterCalls=0;
   const adapter:any={identity:async()=>{adapterCalls++;return"operator";},labels:async()=>{adapterCalls++;return[];},issue:async()=>{adapterCalls++;return structuredClone(issue);},receipt:async()=>{adapterCalls++;return null;},mutate:async(action:any)=>{adapterCalls++;if(action.kind==="close")throw new MutationFailure(false);issue.comments.push({id:1,author:"operator",body:action.body,created_at:now});return{issue:structuredClone(issue)};}};
   async function* requests(){yield JSON.stringify({id:1,method:"batch",params:{actions:[{id:"explain",kind:"comment",issue:1,body:"Observed the actual public export."},{id:"close",kind:"close",issue:1,reason:"completed",duplicate_of:null,comment:"explain"}]}});batch=responses.at(-1).result;yield JSON.stringify({id:2,method:"execute",params:{approval:{batch_hash:batch.hash,action_ids:["explain","close"],owner_statement:"Approve this exact fixture batch"}}});}
   await operatorController({config,inventory,report,output:analysis,verificationHash:JSON.parse(readFileSync(join(input,"manifest.json"),"utf8")).verification_hash,input:requests(),adapter,write:line=>responses.push(JSON.parse(line))});
   const original=join(analysis,`batch-${batch.hash}.json`),bytes=readFileSync(original,"utf8"),expectedCalls=adapterCalls,verificationHash=JSON.parse(readFileSync(join(input,"manifest.json"),"utf8")).verification_hash;
   const resume=async(hash=verificationHash)=>{
    async function* request(){yield JSON.stringify({id:"defensive-resume",method:"resume",params:{batch,approval:{batch_hash:batch.hash,action_ids:["explain","close"],owner_statement:"Resume this exact original fixture batch"}}});}
    await operatorController({config,inventory,report,output:analysis,verificationHash:hash,input:request(),adapter,write:line=>responses.push(JSON.parse(line))});
    expect(responses.at(-1).error).toBeDefined();expect(adapterCalls).toBe(expectedCalls);
   };
   rmSync(original);await resume();writeFileSync(original,bytes);
   writeFileSync(original,bytes+" ");await resume();writeFileSync(original,bytes);
   await resume("b".repeat(64));
   async function* intact(){yield JSON.stringify({id:"intact-resume",method:"resume",params:{batch,approval:{batch_hash:batch.hash,action_ids:["explain","close"],owner_statement:"Resume the exact stored fixture batch"}}});}
   await operatorController({config,inventory,report,output:analysis,verificationHash,input:intact(),adapter,write:line=>responses.push(JSON.parse(line))});
   expect(responses.at(-1).error).toBeUndefined();expect(responses.at(-1).result.completed).toEqual(["explain"]);expect(responses.at(-1).result.failed).toEqual(["close"]);expect(adapterCalls).toBeGreaterThan(expectedCalls);expect(issue.comments.length).toBe(1);


  });
  expect(responses.find(response=>response.id===2).result.completed).toEqual(["explain"]);expect(issue.comments.length).toBe(1);
  const controllerState={schema_version:1,checkout:f.root,plugin,input,verification:selection,indexRequests:[]};
  writeFileSync(join(analysis,"controller-state.json"),JSON.stringify(controllerState));
  writeFileSync(database,JSON.stringify({issue,trace:[]}));
  writeFileSync(join(tools,"gh"),`#!/usr/bin/env bun
import{readFileSync,writeFileSync}from"node:fs";
const path=process.env.TRIAGE_RECOVERY_API,data=JSON.parse(readFileSync(path,"utf8")),args=process.argv.slice(2),method=args[args.indexOf("--method")+1],endpoint=args.find(x=>x==="user"||x.startsWith("repos/")),route=endpoint?.split("?")[0];data.trace.push({method,route});
const issue=()=>({...data.issue,user:{login:data.issue.author},labels:[],milestone:null});let result;
if(args.includes("--jq")){writeFileSync(path,JSON.stringify(data));console.log("42");process.exit(0);}
if(route==="user"&&method==="GET")result={login:"operator"};
else if(route?.endsWith("/comments")&&method==="GET")result=data.issue.comments.map(c=>({...c,user:{login:c.author}}));
else if(route?.endsWith("/events")&&method==="GET")result=[];
else if(route?.endsWith("/issues/1")&&method==="GET")result=issue();
else if(route?.endsWith("/issues/1")&&method==="PATCH"){const payload=JSON.parse(await Bun.stdin.text());if(payload.state!=="closed")throw Error("Denied");data.issue.state="closed";result=issue();}
else throw Error("Unapproved route");writeFileSync(path,JSON.stringify(data));console.log("HTTP/2.0 200 OK\\r\\n\\r\\n"+JSON.stringify(result));
`);chmodSync(join(tools,"gh"),0o700);
  const approval=JSON.stringify({batch_hash:batch.hash,action_ids:["explain","close"],owner_statement:"Resume this exact approved fixture batch"}),attempt=join(control,"attempt");
  // This unit fixture mocks already validated private authority. The actual
  // child CLI still requires a fresh confined native trial; missing
  // that adapter must not turn archived files into execution authority.
  const denied=Bun.spawnSync([process.execPath,join(plugin,"scripts/triage/controller.ts"),"resume","--run-dir",analysis,"--batch-hash",batch.hash,"--output-dir",attempt],{env:{...process.env,PATH:tools+":"+process.env.PATH,TRIAGE_RECOVERY_API:database},stdin:Buffer.from(approval+"\n"),stdout:"pipe",stderr:"pipe",timeout:15_000});
  expect(denied.exitCode).toBe(1);expect(denied.stderr.toString()).toContain("configured confined native adapter");expect(JSON.parse(readFileSync(database,"utf8")).trace).toEqual([]);
  const priorPath=process.env.PATH,priorApi=process.env.TRIAGE_RECOVERY_API;process.env.PATH=tools+":"+priorPath;process.env.TRIAGE_RECOVERY_API=database;
  const nativeProbe=join(control,"unexpected-native-launch");writeFileSync(join(tools,"codex"),`#!/usr/bin/env bun\nimport{writeFileSync}from"node:fs";writeFileSync(${JSON.stringify(nativeProbe)},"unexpected native launch");process.exit(69);\n`);chmodSync(join(tools,"codex"),0o700);
  const cliDenied=(name:string,message:string)=>{
   const output=join(control,name),child=Bun.spawnSync([process.execPath,join(plugin,"scripts/triage/controller.ts"),"resume","--run-dir",analysis,"--batch-hash",batch.hash,"--output-dir",output],{env:{...process.env},stdin:Buffer.from(approval+"\n"),stdout:"pipe",stderr:"pipe",timeout:15_000});
   expect(child.exitCode).toBe(1);expect(child.stderr.toString()).toContain(message);expect(existsSync(nativeProbe)).toBe(false);expect(existsSync(output)).toBe(false);expect(JSON.parse(readFileSync(database,"utf8")).trace).toEqual([]);
  };
  let result;try{
   writeFileSync(join(analysis,"controller-state.json"),JSON.stringify({...controllerState,verification:{}}));
   await expect(resumeController(analysis,batch.hash,join(control,"tampered-attempt"),JSON.parse(approval),plugin)).rejects.toThrow("original operator verification selection changed");
   expect(JSON.parse(readFileSync(database,"utf8")).trace).toEqual([]);
   const manifestPath=join(input,"manifest.json"),manifestBytes=readFileSync(manifestPath,"utf8"),manifest=JSON.parse(manifestBytes);
   delete manifest.verification_hash;writeFileSync(manifestPath,JSON.stringify(manifest));
   writeFileSync(join(analysis,"controller-state.json"),JSON.stringify({...controllerState,host:"codex",verification:{}}));cliDenied("stripped-cli-attempt","original verification input unavailable");
   await expect(resumeController(analysis,batch.hash,join(control,"stripped-hash-attempt"),JSON.parse(approval),plugin)).rejects.toThrow("original verification input unavailable");
   expect(JSON.parse(readFileSync(database,"utf8")).trace).toEqual([]);
   const verificationPath=join(input,"verification.json"),verificationBytes=readFileSync(verificationPath,"utf8"),replacement=JSON.parse(verificationBytes);replacement.selection={checks:{},removals:[]};replacement.operations=[];
   const changed=JSON.stringify(replacement);writeFileSync(verificationPath,changed);manifest.verification_hash=Bun.CryptoHasher.hash("sha256",changed,"hex");writeFileSync(manifestPath,JSON.stringify(manifest));
   cliDenied("replaced-cli-attempt","original verification input changed");
   await expect(resumeController(analysis,batch.hash,join(control,"replaced-hash-attempt"),JSON.parse(approval),plugin)).rejects.toThrow("original verification input changed");
   expect(JSON.parse(readFileSync(database,"utf8")).trace).toEqual([]);
   writeFileSync(verificationPath,verificationBytes);writeFileSync(manifestPath,manifestBytes);
   writeFileSync(join(analysis,"controller-state.json"),JSON.stringify(controllerState));
   result=await resumeController(analysis,batch.hash,attempt,JSON.parse(approval),plugin);
  }finally{process.env.PATH=priorPath;if(priorApi===undefined)delete process.env.TRIAGE_RECOVERY_API;else process.env.TRIAGE_RECOVERY_API=priorApi;}
  expect(result.completed).toEqual(["explain","close"]);
  const state=JSON.parse(readFileSync(database,"utf8"));expect(state.issue.comments.length).toBe(1);expect(state.issue.state).toBe("closed");expect(state.trace.filter((event:any)=>event.method!=="GET")).toEqual([{method:"PATCH",route:"repos/example/project/issues/1"}]);
  expect(JSON.parse(readFileSync(join(attempt,"result.json"),"utf8")).completed).toEqual(["explain","close"]);
 }finally{f.dispose();rmSync(control,{recursive:true,force:true});}
});

test("operator distinguishes failed required verification from an unrelated batch error",async()=>{
 const f=fixture(),control=mkdtempSync(join(tmpdir(),"triage-verification-denial-"));try{
  f.settings({schema_version:1,source_roots:["src"]});const config=loadSettings(f.root),now=new Date().toISOString(),issue={number:1,title:"Answer export",body:"Export answer",state:"open",author:"owner",labels:[],milestone:null,created_at:now,updated_at:now,comments:[]};
  const inventory:any={schema_version:1,repository:config.repository,hostname:config.hostname,source_commit:git(f.root,"rev-parse","HEAD"),mode:"ids",requested_ids:[1],collected_at:now,actor:"operator",issues:[issue],closed_issues:[],pulls:[],plans:[],plan_metadata:"not-configured",labels:[],coverage:["identity","labels","issues","pulls","plans","comments:1"].map(collection=>({collection,scope:collection==="issues"?"all-states":collection==="pulls"?"all-closed-pulls":"fixture",pages:1,complete:true}))};
  writeFileSync(join(control,"snapshot.json"),JSON.stringify(inventory));
  for(const exit of[0,1])await withVerificationBoundary(async()=>{
   const input=join(control,`input-${exit}`),output=join(control,`output-${exit}`),plugin=resolve(import.meta.dir,"../../../plugins/vh-adlc");mkdirSync(output);exportInputs({checkout:f.root,plugin,snapshot:join(control,"snapshot.json"),output:input});
   const{prepareRunVerification}=await import("../../../plugins/vh-adlc/scripts/triage/controller-preparation");prepareRunVerification(config,input,output,{checks:{"required-check":["bun","-e",`process.exit(${exit})`]}});
   const proof=(pass:"primary"|"adversarial")=>{const receipt=inspectSources(config,["src/app.ts"],pass).receipt;return[{kind:"source",path:"src/app.ts",line:1,detail:"Actual public export",verified:true,receipt},{kind:"wiring",path:"src/app.ts",line:1,detail:"Export is the requested contract",verified:true,receipt}];};
   const report=buildReport(config,inventory,[{number:1,state:"resolved",remaining:"",evidence:proof("primary"),adversarial:proof("adversarial")}]),responses:any[]=[];
   async function* request(){yield JSON.stringify({id:"batch",method:"batch",params:{actions:[{id:"explain",kind:"comment",issue:1,body:"Verified the public answer export."}]}});}
   await operatorController({config,inventory,report,output,verificationHash:JSON.parse(readFileSync(join(input,"manifest.json"),"utf8")).verification_hash,input:request(),adapter:{}as any,write:line=>responses.push(JSON.parse(line))});
   if(exit===0)expect(responses[0].result.hash).toMatch(/^[a-f0-9]{64}$/);else expect(responses[0].error_code).toBe("verification-required");
  });
 }finally{f.dispose();rmSync(control,{recursive:true,force:true});}
});
