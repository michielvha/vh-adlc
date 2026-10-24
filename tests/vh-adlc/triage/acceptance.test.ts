import { afterEach, expect, test } from "bun:test";
import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { boundaryCommand, exportInputs, gradeTrial, verifyInputs } from "./native";
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
