import { afterEach, expect, test } from "bun:test";
import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { boundaryCommand, engineeringInputs, exportInputs, gradeTrial, verifyInputs } from "./native";
import { fixture, git } from "./fixtures";
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
  writeFileSync(canary,"Non-secret host canary\n");
  const routes=["file","environment","helper","keyring","socket","tools","egress","mutation"];
  const requests=[{jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"unit-boundary-client",version:"1"}}},
    {jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"read",arguments:{path:"plugin/skills/vh-adlc-triage/SKILL.md"}}},
    ...routes.map((route,at)=>({jsonrpc:"2.0",id:at+3,method:"tools/call",params:{name:"probe",arguments:{route,run_id:manifest.run_id}}})),
    {jsonrpc:"2.0",id:20,method:"tools/call",params:{name:"read",arguments:{path:canary}}}];
  const {resolve4}=await import("node:dns/promises"); const [ip]=await resolve4("api.github.com");
  const child=Bun.spawnSync(["bun",resolve(import.meta.dir,"native.ts"),"launch","--input",f.output,"--trace",trace,"--canary",canary,"--egress-ip",ip],
    {stdin:Buffer.from(requests.map(request=>JSON.stringify(request)).join("\n")+"\n"),stdout:"pipe",stderr:"pipe",timeout:10_000,env:{...process.env,GH_TOKEN:"non-secret-probe-canary"}});
  expect({exit:child.exitCode,error:child.stderr.toString()}).toEqual({exit:0,error:""});
  const replies=child.stdout.toString().trim().split("\n").map(line=>JSON.parse(line));
  expect(replies.find(reply=>reply.id===2).result.content[0].text).toContain("vh-adlc-triage");
  expect(replies.find(reply=>reply.id===20).error.message).toContain("denied");
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
  const grade=(raw=nativeEvents,record=events)=>gradeTrial({input:f.output,checkout:f.root,plugin,host:"claude-cli",raw:raw.map(event=>JSON.stringify(event)).join("\n"),trace:record,installed:plugin,exit_code:0});
  expect(grade().pass).toBe(true);
  expect(grade(nativeEvents,events.map(event=>({...event,namespaces:event.host_namespaces}))).pass).toBe(false);
  expect(grade(nativeEvents,events.map(event=>({...event,run_id:"other-run"}))).pass).toBe(false);
  expect(grade([{...nativeEvents[0],tools:[...toolNames,"Bash"]},...nativeEvents.slice(1)]).pass).toBe(false);
},15_000);


test("native knowledge input uses the released binary's answered contract and verified pages",async()=>{
  const f=setup();f.export();await engineeringInputs(f.output,f.root,plugin);
  const record=JSON.parse(readFileSync(join(f.output,"knowledge.json"),"utf8"));
  expect(record.result.command).toBe("knowledge");expect(record.result.result).toBe("answered");
  expect(record.revision).toMatch(/^[a-f0-9]{40}$/);
  expect(readFileSync(join(f.output,"engineering/guides/humanize-prose.md"),"utf8")).toContain("prose");
  expect(verifyInputs(f.output,{checkout:f.root,plugin}).pass).toBe(true);
},15_000);
