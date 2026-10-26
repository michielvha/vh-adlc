import{test as trustedTest}from"./boundary-test";
import { afterEach, expect, test } from "bun:test";
import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as native from "./native";
import { boundaryCommand, commandWorkspace, committedComponent, engineeringInputs, exportInputs, gradeTrial, verifyInputs, prepareVerification } from "./native";
import { fixture, git } from "./fixtures";
import{verificationRecord}from"../../../plugins/vh-adlc/scripts/triage/verification";
const projects: ReturnType<typeof fixture>[]=[];
afterEach(()=>{for(const f of projects.splice(0)) f.dispose();});
const plugin=resolve(import.meta.dir,"../../../plugins/vh-adlc");
function setup() {
  const f=fixture(); projects.push(f);
  f.write("docs/history/README.md","# Complete history\n");f.write("docs/history/nested/old.md","# Earlier report\n");
  f.settings({schema_version:1,source_roots:["src"],report_dir:"docs/history"});
  f.write("src/also-required.ts","export const other=1;\n");f.write(".gitattributes","src/also-required.ts export-ignore\n");
  git(f.root,"add","src/also-required.ts",".gitattributes");git(f.root,"commit","-qm","test: seed complete export");
  const snapshot={schema_version:1,repository:"example/project",hostname:"github.com",source_commit:git(f.root,"rev-parse","HEAD"),mode:"sweep",requested_ids:[],collected_at:"2026-10-24T10:00:00Z",issues:[],closed_issues:[],pulls:[],plans:[],plan_metadata:"not-configured",coverage:["issues","pulls","plans"].map(collection=>({collection,scope:collection==="issues"?"all-states":collection==="pulls"?"all-closed-pulls":"not-configured",pages:collection==="plans"?0:1,complete:true}))};
  f.write("snapshot.json",JSON.stringify(snapshot));
  const output=join(f.root,"export");
  return {...f,snapshot,output,export:()=>exportInputs({checkout:f.root,plugin,snapshot:join(f.root,"snapshot.json"),output})};
}

test("native preflight rejects uncommitted or ignored extra component input before launching a client",()=>{
  const f=fixture();projects.push(f);
  expect(committedComponent(f.root,join(f.root,"src"),join(f.root,"src/app.ts"))).toBe(git(f.root,"rev-parse","HEAD"));
  f.write("src/app.ts","export const answer=0;\n");
  expect(()=>committedComponent(f.root,join(f.root,"src"),join(f.root,"src/app.ts"))).toThrow();
  git(f.root,"add","src/app.ts");f.write(".gitignore","src/ignored.env\n");git(f.root,"add",".gitignore");git(f.root,"commit","-qm","test: seed ignored canary rule");
  f.write("src/ignored.env","NON_SECRET_CANARY=excluded\n");expect(git(f.root,"status","--porcelain")).toBe("");
  expect(()=>committedComponent(f.root,join(f.root,"src"),join(f.root,"src/app.ts"))).toThrow();
});

test("input export contains the fixed complete source, full nested history, plugin and hashed coverage",()=>{
  const f=setup(),manifest=f.export();
  expect(manifest.source_commit).toBe(f.snapshot.source_commit);
  expect(manifest.source.some(entry=>entry.path==="src/also-required.ts")).toBe(true);
  expect(readFileSync(join(f.output,"source/src/also-required.ts"),"utf8")).toContain("other=1");
  expect(manifest.history.map(entry=>entry.path)).toEqual(["README.md","nested/old.md"]);
  expect(manifest.snapshot.coverage_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(manifest.plugin_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(readFileSync(join(f.output,"snapshot.json"),"utf8").split("\n").length).toBeGreaterThan(10);
  expect(readFileSync(join(f.output,"manifest.json"),"utf8").split("\n").length).toBeGreaterThan(10);
  expect(verifyInputs(f.output,{checkout:f.root,plugin}).pass).toBe(true);
});

test("hash checks reject tampered source, missing history and omitted canonical inputs",()=>{
  for(const change of ["source","history","manifest"] as const){
    const f=setup();f.export();
    if(change==="source")writeFileSync(join(f.output,"source/src/app.ts"),"Altered\n");
    if(change==="history")writeFileSync(join(f.output,"history/nested/old.md"),"Altered history\n");
    if(change==="manifest"){
      const path=join(f.output,"manifest.json"),data=JSON.parse(readFileSync(path,"utf8"));data.source=data.source.filter((entry:{path:string})=>entry.path!=="src/app.ts");writeFileSync(path,JSON.stringify(data));
    }
    expect(verifyInputs(f.output,{checkout:f.root,plugin}).pass).toBe(false);
  }
});

test("snapshot coverage is structurally checked and incomplete records stay incomplete",()=>{
  const f=setup();f.snapshot.coverage[0].complete=false;f.write("snapshot.json",JSON.stringify(f.snapshot));
  expect(f.export().snapshot.complete).toBe(false);
  const other=setup();other.snapshot.coverage=[];other.write("snapshot.json",JSON.stringify(other.snapshot));
  expect(()=>other.export()).toThrow();
});

test("export does not follow a history symlink to outside credentials or canaries",()=>{
  const f=setup();f.write("outside-canary","not input\n");symlinkSync(join(f.root,"outside-canary"),join(f.root,"docs/history/escape.md"));
  expect(()=>f.export()).toThrow();
});

test("boundary launch exposes only declared read-only input and runtime with no inherited credential environment",()=>{
  const f=setup();f.export();const args=boundaryCommand({input:f.output,driver:resolve(import.meta.dir,"native.ts"),bun:process.execPath});
  expect(args).toContain("--unshare-net");expect(args).toContain("--clearenv");expect(args).toContain("--ro-bind");
  expect(args).not.toContain("--share-net");expect(args.join(" ")).not.toMatch(/GH_TOKEN|GITHUB_TOKEN|SSH_AUTH_SOCK|credential.helper/);
  expect(args).not.toContain("--bind");
  for (let i=0;i<args.length;i++) if(args[i]==="--ro-bind") expect(["/","/home","/run"]).not.toContain(args[i+1]);
});

test("a prose-only discovery claim and unit-only adapter trace cannot pass a native trial",()=>{
  const f=setup();f.export();
  const grade=gradeTrial({input:f.output,checkout:f.root,plugin,host:"codex-cli",raw:"I discovered triage and all probes passed",trace:[],installed:plugin,exit_code:0});
  expect(grade.pass).toBe(false);expect(grade.failures).toContain("native-invocation");expect(grade.failures).toContain("analysis-boundary-probes");
});

test("compatibility proof requires the native project command, not a slash-shaped prompt",()=>{
  const f=setup();f.export();
  const grade=gradeTrial({input:f.output,checkout:f.root,plugin,host:"claude-cli",raw:"/triage succeeded",trace:[],installed:plugin,exit_code:0,command:"triage"});
  expect(grade.failures).toContain("native-project-command");
});

test("project command trials copy exact command bytes without owner hooks or settings",()=>{
  const f=setup(),command="---\ndescription: Fixture triage\nmodel: fable\n---\nRead agents/issue-triage.md.\n";
  f.write(".claude/commands/triage.md",command);f.write(".claude/settings.json",'{"hooks":{"dangerous":"never load"}}');
  git(f.root,"add",".claude");git(f.root,"commit","-qm","test: seed isolated command discovery");f.snapshot.source_commit=git(f.root,"rev-parse","HEAD");f.write("snapshot.json",JSON.stringify(f.snapshot));f.export();
  const workspace=commandWorkspace(f.output,join(f.root,"control"),"triage");
  expect(readFileSync(join(workspace.cwd,".claude/commands/triage.md"),"utf8")).toBe(command);
  expect(()=>readFileSync(join(workspace.cwd,".claude/settings.json"))).toThrow();expect(workspace.model).toBe("fable");
});

test("the legacy analysis boundary cannot read the replacement shared implementation",()=>{
  const f=setup();f.export();const requests=[
    {jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read",arguments:{path:"source/src/app.ts"}}},
    {jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"read",arguments:{path:"plugin/scripts/triage/report.ts"}}}];
  const child=Bun.spawnSync(["bun",resolve(import.meta.dir,"native.ts"),"launch","--legacy","--input",f.output,"--trace",join(f.root,"legacy-boundary.jsonl")],{stdin:Buffer.from(requests.map(request=>JSON.stringify(request)).join("\n")+"\n"),stdout:"pipe",stderr:"pipe",timeout:10_000});
  expect({exit:child.exitCode,error:child.stderr.toString()}).toEqual({exit:0,error:""});
  const replies=child.stdout.toString().trim().split("\n").map(line=>JSON.parse(line));expect(replies[0].result.content[0].text).toContain("answer");expect(replies[1].error.message).toContain("denied");
});

test("required probe failures, a readable outside canary or live mutation trace block acceptance",()=>{
  const f=setup();f.export();
  for(const route of ["file","environment","helper","keyring","socket","tools","egress","mutation"]){
    const grade=gradeTrial({input:f.output,checkout:f.root,plugin,host:"claude-cli",raw:"",trace:[{kind:"probe",route,denied:false,session:"fixture"}],installed:plugin,exit_code:0});
    expect(grade.pass).toBe(false);expect(grade.failures).toContain("analysis-boundary-probes");
  }
  const grade=gradeTrial({input:f.output,checkout:f.root,plugin,host:"claude-cli",raw:"",trace:[{kind:"github",method:"POST",target:"live"}],installed:plugin,exit_code:0});
  expect(grade.failures).toContain("read-only-trace");
});

test("the real boundary process denies outside input, credentials, egress and mutation probes", async()=>{
  const f=setup(),manifest=f.export(),trace=join(f.root,"boundary.jsonl"),canary=join(f.root,"outside-canary");
  const verificationCache=join(f.root,"proof-cache");
  writeFileSync(canary,"Non-secret host canary\n");
  const routes=["file","environment","helper","keyring","socket","tools","egress","mutation"];
  const requests=[{jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"unit-boundary-client",version:"1"}}},
    {jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"read",arguments:{path:"plugin/skills/vh-adlc-triage/SKILL.md"}}},
    ...routes.map((route,at)=>({jsonrpc:"2.0",id:at+3,method:"tools/call",params:{name:"probe",arguments:{route,run_id:manifest.run_id}}})),
    {jsonrpc:"2.0",id:20,method:"tools/call",params:{name:"read",arguments:{path:canary}}},
    ...(["primary","adversarial"]as const).map((pass,at)=>({jsonrpc:"2.0",id:21+at,method:"tools/call",params:{name:"read",arguments:{path:"source/src/app.ts",start_line:1,limit:1,verification_pass:pass}}}))];
  const {resolve4}=await import("node:dns/promises"); const [ip]=await resolve4("api.github.com");
  const child=Bun.spawnSync(["bun",resolve(import.meta.dir,"native.ts"),"launch","--input",f.output,"--trace",trace,"--canary",canary,"--egress-ip",ip,"--verification-cache",verificationCache],
    {stdin:Buffer.from(requests.map(request=>JSON.stringify(request)).join("\n")+"\n"),stdout:"pipe",stderr:"pipe",timeout:10_000,env:{...process.env,GH_TOKEN:"non-secret-probe-canary"}});
  expect({exit:child.exitCode,error:child.stderr.toString()}).toEqual({exit:0,error:""});
  const replies=child.stdout.toString().trim().split("\n").map(line=>JSON.parse(line));
  expect(replies.find(reply=>reply.id===2).result.content[0].text).toContain("vh-adlc-triage");
  expect(replies.find(reply=>reply.id===20).error.message).toContain("denied");
  const previousCache=process.env.VH_ADLC_TRIAGE_VERIFICATION_CACHE;
  try{
    process.env.VH_ADLC_TRIAGE_VERIFICATION_CACHE=verificationCache;
    const config=(await import("../../../plugins/vh-adlc/scripts/triage/settings")).loadSettings(f.root);
    for(const[id,pass]of[[21,"primary"],[22,"adversarial"]]as const){
      const receipt=JSON.parse(replies.find(reply=>reply.id===id).result.content[0].text).verification_receipt;
      const record=verificationRecord(config,manifest.source_commit,receipt);expect(record?.pass).toBe(pass);expect(record?.reads[0]).toMatchObject({path:"src/app.ts",start_line:1,end_line:1});
    }
  }finally{process.env.VH_ADLC_TRIAGE_VERIFICATION_CACHE=previousCache;}
  const events=readFileSync(trace,"utf8").trim().split("\n").map(line=>JSON.parse(line));
  expect(events.find(event=>event.kind==="boundary-start").isolated).toBe(true);
  for(const route of routes)expect(events.find(event=>event.kind==="probe"&&event.route===route).denied).toBe(true);
  expect(events.every(event=>event.input_read_only)).toBe(true);
  expect(readFileSync(canary,"utf8")).toBe("Non-secret host canary\n");
  const toolNames=["Skill","StructuredOutput",...(["read","list","search","probe"].map(name=>`mcp__triage__${name}`))];
  // Synthetic native envelopes test the grader; only the boundary execution above is real here.
  const nativeEvents=[{type:"system",subtype:"init",session_id:"unit-native-envelope",tools:toolNames},
    {type:"assistant",message:{content:[{type:"tool_use",id:"native-skill",name:"Skill",input:{skill:"vh-adlc:vh-adlc-triage"}},
      ...routes.map(route=>({type:"tool_use",name:"mcp__triage__probe",input:{route,run_id:manifest.run_id}}))]}},
    {type:"user",message:{content:[{type:"tool_result",tool_use_id:"native-skill",content:"Launching skill: vh-adlc:vh-adlc-triage"}]}},
    {type:"result",subtype:"success",is_error:false,session_id:"unit-native-envelope",result:"Read-only fixture complete"}];
  const grade=(raw:unknown[]=nativeEvents,record=events)=>gradeTrial({input:f.output,checkout:f.root,plugin,host:"claude-cli",raw:raw.map(event=>JSON.stringify(event)).join("\n"),trace:record,installed:plugin,exit_code:0});
  expect(grade().pass).toBe(true);
  for(const type of["server_tool_use","mcp_tool_use","unknown_tool"]){
    expect(grade([...nativeEvents,{type:"assistant",message:{content:[{type,id:"unrecognized-invocation",name:"Bash",input:{command:"synthetic only"}}]}}]).failures).toContain("exclusive-read-only-tools");
  }
  expect(grade([...nativeEvents,{type:"assistant",message:{content:[{type:"text",text:"Observed source"},{type:"thinking",thinking:"Review proof"},{type:"redacted_thinking",data:"opaque non-tool block"}]}}]).pass).toBe(true);
  expect(grade([...nativeEvents,{type:"assistant",message:{content:{type:"server_tool_use",name:"Bash"}}}]).failures).toContain("exclusive-read-only-tools");
  expect(grade(nativeEvents,events.map(event=>({...event,namespaces:event.host_namespaces}))).pass).toBe(false);
  expect(grade(nativeEvents,events.map(event=>({...event,run_id:"other-run"}))).pass).toBe(false);
  expect(grade([{...nativeEvents[0],tools:[...toolNames,"Bash"]},...nativeEvents.slice(1)]).pass).toBe(false);
  for(const call of [{name:"Bash",input:{command:"synthetic only"}},{name:"Read",input:{file_path:"synthetic only"}},{name:"mcp__other__read",input:{}},{name:"Skill",input:{skill:"vh-adlc:vh-adlc-ship"}}]){
    expect(grade([...nativeEvents,{type:"assistant",message:{content:[{type:"tool_use",id:"unexpected-call",...call}]}}]).failures).toContain("exclusive-read-only-tools");
  }
},15_000);


test("native knowledge input uses the released binary's answered contract and verified pages",async()=>{
  const f=setup();f.export();await engineeringInputs(f.output,f.root,plugin);
  const record=JSON.parse(readFileSync(join(f.output,"knowledge.json"),"utf8"));
  expect(record.result.command).toBe("knowledge");expect(record.result.result).toBe("answered");
  expect(record.revision).toMatch(/^[a-f0-9]{40}$/);
  expect(readFileSync(join(f.output,"engineering/guides/humanize-prose.md"),"utf8")).toContain("prose");
  expect(verifyInputs(f.output,{checkout:f.root,plugin}).pass).toBe(true);
},15_000);

test("legacy native input carries only its frozen workflow and a neutral report contract",()=>{
  const build=(native as Record<string,any>).nativeContract;
  expect(typeof build).toBe("function");
  const legacy=build({legacy:true,mode:"sweep",routing:"Invoke the frozen project command.",installed:"/unused/plugin"});
  expect(legacy.pluginArgs).toEqual([]);expect(legacy.schema.properties.mode.enum).toEqual(["sweep"]);
  expect(Object.keys(legacy.schema.properties).sort()).toEqual(["mode","notes"]);
  expect(legacy.prompt).not.toMatch(/verification_pass|canonical_source|both proof passes|observations|leads/);
  const shared=build({legacy:false,routing:"Invoke shared triage.",installed:"/candidate/plugin"});
  expect(shared.pluginArgs).toEqual(["--plugin-dir","/candidate/plugin"]);
  expect(shared.schema.properties.observations.items.properties).toHaveProperty("leads");
});

test("the installed package ships its actual isolated controller entry",()=>{
 const controller=join(plugin,"scripts/triage/controller.ts");
 const run=Bun.spawnSync([process.execPath,controller,"capabilities"],{stdout:"pipe",stderr:"pipe"});
 expect({exit:run.exitCode,error:run.stderr.toString()}).toEqual({exit:0,error:""});
 const capabilities=JSON.parse(run.stdout.toString());
 expect(capabilities.protocol_version).toBe(1);expect(capabilities.host_adapters).toEqual(["codex","claude"]);
 expect(capabilities.analysis_writes).toBe(false);expect(capabilities.operator_approval_required).toBe(true);
});

test("the installed controller rejects source-tree output before any collector call",async()=>{
 const f=fixture();projects.push(f);
 f.write("tools/gh","#!/bin/sh\nprintf called >> \"$PROBE_CALLS\"\nexit 1\n");const{chmodSync,existsSync}=await import("node:fs");chmodSync(join(f.root,"tools/gh"),0o700);
 const marker=join(f.root,"calls");
 const run=Bun.spawnSync([process.execPath,join(plugin,"scripts/triage/controller.ts"),"start","--host","codex","--repo",f.root,"--output-dir",join(f.root,"controller-output")],{env:{...process.env,HOME:f.root,PATH:join(f.root,"tools")+":/usr/bin:/bin",PROBE_CALLS:marker},timeout:3000,stdout:"pipe",stderr:"pipe"});
 expect(run.exitCode).not.toBe(0);expect(run.stderr.toString()).toContain("outside the selected checkout");expect(existsSync(marker)).toBe(false);
});

test("managed Codex analysis rejects shell, file, web and unknown items",()=>{
 const f=setup();f.export();
 for(const type of["command_execution","file_change","web_search","future_unknown_tool"]){
  const raw=[{type:"thread.started"},{type:"item.completed",item:{type,command:"unapproved"}},{type:"turn.completed"}].map(event=>JSON.stringify(event)).join("\n");
  const grade=gradeTrial({input:f.output,checkout:f.root,plugin,host:"codex-cli",raw,trace:[],installed:plugin,exit_code:0,kind:"native-discovery"});
  expect(grade.failures).toContain("exclusive-read-only-tools");
 }
});


trustedTest("managed preparation supplies actual fixed checks and removal content before analysis",async()=>{
  const f=setup(),config=(await import("../../../plugins/vh-adlc/scripts/triage/settings")).loadSettings(f.root);
  f.write("src/retired.ts","export const retired=true;\n");git(f.root,"add","src/retired.ts");git(f.root,"commit","-qm","test: prior source");const before=git(f.root,"rev-parse","HEAD");
  git(f.root,"rm","src/retired.ts");git(f.root,"commit","-qm","test: current source");
  f.snapshot.source_commit=git(f.root,"rev-parse","HEAD");f.write("snapshot.json",JSON.stringify(f.snapshot));f.export();
  const {withVerificationBoundary,observedVerification}=await import("../../../plugins/vh-adlc/scripts/triage/verification");
  withVerificationBoundary(()=>{
    const prepared=prepareVerification(config,f.output,{checks:{behavior:["bun","-e","import {answer} from './src/app.ts'; console.log(answer); if(answer!==42)process.exit(1)"]},removals:[{path:"src/retired.ts",before_commit:before}]});
    expect(prepared.complete).toBe(true);expect(prepared.operations.map((op:any)=>op.pass)).toEqual(["primary","primary","adversarial","adversarial"]);
    for(const op of prepared.operations)expect(observedVerification(config,f.snapshot.source_commit,op.result.receipt)?.pass).toBe(op.pass);
    expect(prepared.operations[0].result.stdout.trim()).toBe("42");expect(prepared.operations[1].result.before_content).toContain("retired=true");
    expect(verifyInputs(f.output,{checkout:f.root,plugin}).pass).toBe(true);
    writeFileSync(join(f.output,"verification.json"),"{}");expect(verifyInputs(f.output,{checkout:f.root,plugin}).failures).toContain("prepared-verification-hash");
  });
});

test("a failed operator-selected check blocks report verification even when analysis omits it",async()=>{
  const f=setup(),{loadSettings}=await import("../../../plugins/vh-adlc/scripts/triage/settings"),{withVerificationBoundary}=await import("../../../plugins/vh-adlc/scripts/triage/verification"),{buildReport}=await import("../../../plugins/vh-adlc/scripts/triage/report");f.export();
  withVerificationBoundary(()=>{
    const config=loadSettings(f.root),prepared=prepareVerification(config,f.output,{checks:{required:["bun","-e","console.error('fixture-required-failure');process.exit(3)"]}});
    expect(prepared.complete).toBe(false);expect(prepared.operations[0].result).toMatchObject({exit_code:3,stderr:expect.stringContaining("fixture-required-failure")});
    const report=buildReport(config,f.snapshot as any,[]);
    expect(report.completeness.verification).toBe(false);expect(report.completeness.missing).toContain("required-verification");
  });
},15_000);


trustedTest("managed preparation selects its run cache with no inherited verification variable",async()=>{
 const f=setup(),{loadSettings}=await import("../../../plugins/vh-adlc/scripts/triage/settings"),{buildReport}=await import("../../../plugins/vh-adlc/scripts/triage/report"),preparation=await import("../../../plugins/vh-adlc/scripts/triage/controller-preparation");
 const initialize=preparation.prepareRunVerification;expect(typeof initialize).toBe("function");
 f.write("src/retired.ts","export const retired=true;\n");git(f.root,"add","src/retired.ts");git(f.root,"commit","-qm","test: prior removal scope");const before=git(f.root,"rev-parse","HEAD");git(f.root,"rm","src/retired.ts");git(f.root,"commit","-qm","test: current removal scope");
 f.snapshot.source_commit=git(f.root,"rev-parse","HEAD");const now=f.snapshot.collected_at,issue=(number:number)=>({number,title:`Fixture ${number}`,body:"Fixture scope",state:"open",author:"owner",labels:[],milestone:null,created_at:now,updated_at:now,comments:[]});Object.assign(f.snapshot,{issues:[issue(1),issue(2)],coverage:[...f.snapshot.coverage,...[1,2].map(number=>({collection:`comments:${number}`,scope:"fixture",pages:1,complete:true}))]});f.write("snapshot.json",JSON.stringify(f.snapshot));f.export();
 const prior=process.env.VH_ADLC_TRIAGE_VERIFICATION_CACHE;delete process.env.VH_ADLC_TRIAGE_VERIFICATION_CACHE;
 try{
  const config=loadSettings(f.root),run=join(f.root,"analysis"),prepared=initialize(config,f.output,run,{checks:{answer:["bun","-e",'import{answer}from"./src/app.ts";console.log(answer);if(answer!==42)process.exit(1)']},removals:[{path:"src/retired.ts",before_commit:before}]}),{inspectSources}=await import("../../../plugins/vh-adlc/scripts/triage/verification");
  expect(process.env.VH_ADLC_TRIAGE_VERIFICATION_CACHE).toBeUndefined();expect((await import("../../../plugins/vh-adlc/scripts/triage/verification")).verificationDirectory(config)).toStartWith(join(run,"verification-cache"));expect(prepared.complete).toBe(true);
  const proof=(pass:"primary"|"adversarial")=>[{kind:"source",path:"src/app.ts",line:1,detail:"Observed export",verified:true,receipt:inspectSources(config,["src/app.ts"],pass).receipt},prepared.operations.find((op:{kind:string;pass:string})=>op.kind==="check"&&op.pass===pass)!.result];
  const removed=(pass:"primary"|"adversarial")=>[{kind:"removal",path:"src/retired.ts",before_commit:before,reference:`commit:${f.snapshot.source_commit}`,detail:`Observed ancestor and absence (${pass})`,verified:true,receipt:prepared.operations.find((op:{kind:string;pass:string})=>op.kind==="removal"&&op.pass===pass)!.result.receipt}];
  const report=buildReport(config,f.snapshot as any,[{number:1,state:"resolved",remaining:"",evidence:proof("primary"),adversarial:proof("adversarial")},{number:2,state:"obsolete",remaining:"",evidence:removed("primary"),adversarial:removed("adversarial")}]);
  expect(report.completeness.verification).toBe(true);expect(report.rows.map(row=>row.close_executable)).toEqual([true,true]);
 }finally{if(prior===undefined)delete process.env.VH_ADLC_TRIAGE_VERIFICATION_CACHE;else process.env.VH_ADLC_TRIAGE_VERIFICATION_CACHE=prior;}
},15_000);

test("pre-result verification errors retain a sanitized setup cause",async()=>{
 const f=setup(),{loadSettings}=await import("../../../plugins/vh-adlc/scripts/triage/settings"),{withVerificationBoundary}=await import("../../../plugins/vh-adlc/scripts/triage/verification");f.export();
 withVerificationBoundary(()=>{
  const config={...loadSettings(f.root),root:join(f.root,"missing-repository")},prepared=prepareVerification(config,f.output,{checks:{required:["bun","-e","process.exit(0)"]}});
  expect(prepared.complete).toBe(false);expect(prepared.operations[0].result.cause).toBe("triage cannot read repository rev-parse");
 });
});


test("the actual read adapter emits source search receipts that reobserve with exact directory scope",async()=>{
 const f=setup();f.settings({schema_version:1,source_roots:["src","src-other"],report_dir:"docs/history"});f.write("src-other/answer.ts","export const answer=7;\n");git(f.root,"add","src-other/answer.ts");git(f.root,"commit","-qm","test: sibling source prefix");f.snapshot.source_commit=git(f.root,"rev-parse","HEAD");f.write("snapshot.json",JSON.stringify(f.snapshot));f.export();
 const cache=join(f.root,"search-cache"),requests=[...(["primary","adversarial"]as const).map((pass,index)=>({jsonrpc:"2.0",id:index+1,method:"tools/call",params:{name:"search",arguments:{query:"answer",prefix:"source/src",limit:1,verification_pass:pass}}})),{jsonrpc:"2.0",id:3,method:"tools/call",params:{name:"search",arguments:{query:"triage",prefix:"plugin/",verification_pass:"primary"}}}];
 const run=Bun.spawnSync([process.execPath,resolve(import.meta.dir,"native.ts"),"launch","--input",f.output,"--trace",join(f.root,"search-trace.jsonl"),"--verification-cache",cache],{stdin:Buffer.from(requests.map(request=>JSON.stringify(request)).join("\n")+"\n"),stdout:"pipe",stderr:"pipe",timeout:10_000});expect({exit:run.exitCode,error:run.stderr.toString()}).toEqual({exit:0,error:""});
 const replies=run.stdout.toString().trim().split("\n").map(line=>JSON.parse(line)),{loadSettings}=await import("../../../plugins/vh-adlc/scripts/triage/settings"),{withVerificationBoundary,inspectSearch,observedVerification}=await import("../../../plugins/vh-adlc/scripts/triage/verification"),config=loadSettings(f.root);
 withVerificationBoundary(()=>{
  for(const[index,pass]of(["primary","adversarial"]as const).entries()){
   const response=JSON.parse(replies[index].result.content[0].text),actual=inspectSearch(config,"answer",["src"],pass);expect(response.verification_receipt).toBe(actual.receipt);expect(response.canonical_scope).toEqual(["src"]);expect(response.scanned).toBe(2);expect(response.matches[0].canonical_path).toBe("src/app.ts");expect(observedVerification(config,f.snapshot.source_commit,actual.receipt)).toBeNull();
  }
 },{cacheRoot:cache});
 expect(replies[2].error).toBeDefined();
},15_000);

test("managed recovery declares hash-bound prior verdict context without granting proof",async()=>{
 const{prepareRecoveryContext,recoveryVerdicts}=await import("../../../plugins/vh-adlc/scripts/triage/recovery-context");
 const f=setup();f.export();const report:any={rows:[{number:1,state:"partial",remaining:"Wire the existing serializer into GET /answer.",ownership:"eligible",disposition:"retain",depends_on:[],duplicate_of:null,closure_reason:null}]};
 const context=prepareRecoveryContext(f.output,"a".repeat(64),report);
 const{hasManagedProofAuthority}=await import("../../../plugins/vh-adlc/scripts/triage/controller");expect(hasManagedProofAuthority()).toBe(false);
 expect(context.verdicts).toEqual(recoveryVerdicts(report));expect(context.batch_hash).toBe("a".repeat(64));expect(context.trusted_as_proof).toBe(false);
 expect(verifyInputs(f.output,{checkout:f.root,plugin}).pass).toBe(true);
 const grader={input:f.output,checkout:f.root,plugin,host:"codex-cli",raw:"",trace:[]as any[],installed:null,exit_code:1};
 expect(gradeTrial(grader).failures).toContain("required-recovery-context");
 const manifest=JSON.parse(readFileSync(join(f.output,"manifest.json"),"utf8"));grader.trace.push({kind:"read",path:"recovery-context.json",run_id:manifest.run_id,start_line:1,limit:2000});
 expect(gradeTrial(grader).failures).not.toContain("required-recovery-context");
 const changed=structuredClone(report);changed.rows[0].remaining="A differently approved scope";expect(recoveryVerdicts(changed)).not.toEqual(context.verdicts);
 writeFileSync(join(f.output,"recovery-context.json"),JSON.stringify({...context,batch_hash:"b".repeat(64)}));
 expect(verifyInputs(f.output,{checkout:f.root,plugin}).failures).toContain("recovery-context-hash");
});
