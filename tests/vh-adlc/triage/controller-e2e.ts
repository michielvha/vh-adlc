import{captureFakeExecutable,fakeTrackerProof}from"./fake-tracker-proof";
import{tmpdir}from"node:os";
import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync}from"node:fs";
import{join,resolve}from"node:path";
import{fixture,git}from"./fixtures";
import{committedComponent}from"./native";
import{spawn}from"node:child_process";
const repository=resolve(import.meta.dir,"../../.."),plugin=join(repository,"plugins/vh-adlc"),component=committedComponent(repository,plugin,import.meta.path);
const host=process.argv[2];if(!["claude","codex"].includes(host))throw Error("select a host");
const root=mkdtempSync(join(tmpdir(),'triage-controller-e2e-'+host+'-')),tools=join(root,'tools'),database=join(root,'api.json'),output=join(root,'run');mkdirSync(tools,{mode:0o700});
const original=JSON.parse(readFileSync(join(import.meta.dir,'controller-fixture.json'),'utf8')),source=fixture();
source.settings({schema_version:1,source_roots:["src"],plan_roots:["plans"],report_dir:"history",protected_ids:[4]});
source.write("src/retired.ts","export const retired=true;\n");git(source.root,"add","src/retired.ts");git(source.root,"commit","-qm","test: seed retired source");const removalBefore=git(source.root,"rev-parse","HEAD");git(source.root,"rm","src/retired.ts");
source.write("src/main.ts",'import{answer}from"./app";console.log(answer);\n');source.write("src/serializer.ts",'export const serialize=(n:number)=>JSON.stringify({value:n});\n');
source.write("plans/cli.md","---\nissue: 1\nstatus: complete\nstatus_description: CLI wired\npriority: high\n---\n");source.write("plans/http.md","---\nissue: 2\nstatus: in-progress\nstatus_description: Serializer exists; transport remains\npriority: medium\n---\n");source.write("history/.keep","");
source.write("AGENTS.md","# Synthetic controller acceptance repository\n\nCanonical source is src/. Verify actual exports and their reachable entry points. Source and wiring inspections are valid fixture proof; do not invent test execution. Plans are contextual metadata.\n");
git(source.root,"add","src","plans","history/.keep","AGENTS.md",".vh-adlc/triage.json");git(source.root,"commit","-qm","test: seed managed controller fixture");
original.issues.push({...structuredClone(original.issues[0]),number:5,title:"Retire legacy source",body:"The retired source module must be absent from canonical source.",comments:[]});
const checks=join(root,"checks.json"),removals=join(root,"removals.json");writeFileSync(checks,JSON.stringify({"answer-check":["bun","-e",'import{answer}from"./src/app.ts";console.log(answer);if(answer!==42)process.exit(1);']}));writeFileSync(removals,JSON.stringify([{path:"src/retired.ts",before_commit:removalBefore}]));
writeFileSync(database,JSON.stringify({issues:[...original.issues,...original.closed_issues],pulls:original.pulls,labels:original.labels??[],trace:[]}));
writeFileSync(join(tools,'gh'),`#!/usr/bin/env bun
import{readFileSync,writeFileSync,realpathSync}from"node:fs";
import{createHash}from"node:crypto";
const path=process.env.CONTROLLER_FAKE_API,data=JSON.parse(readFileSync(path,"utf8")),args=process.argv.slice(2),method=args[args.indexOf("--method")+1]??"GET",raw=args.find(a=>a.startsWith("repos/")||a.startsWith("repositories/")||a==="user")??"user",endpoint=raw.replace(/^repositories\\/42/,"repos/example/project"),url=new URL("https://api.github.com/"+endpoint),route=url.pathname;
const payload=args.includes("--input")?JSON.parse(await Bun.stdin.text()):null;data.trace.push({method,endpoint,payload,executable:realpathSync(import.meta.path),sha256:createHash("sha256").update(readFileSync(import.meta.path)).digest("hex")});writeFileSync(path,JSON.stringify(data));
const issue=number=>{const i=data.issues.find(i=>i.number===number);if(!i)throw Error("Unknown fake issue");return i;};
const apiIssue=i=>({...i,user:{login:i.author},labels:i.labels.map(name=>({name})),milestone:i.milestone?{title:i.milestone}:null});
let value;
if(args.includes("--jq")){writeFileSync(path,JSON.stringify(data));process.stdout.write((args[args.indexOf("--jq")+1]===".login"?"operator":"42")+"\\n");process.exit(0);}
if(route==="/user"&&method==="GET")value={login:"operator"};
else if(route==="/repos/example/project/issues"&&method==="GET")value=data.issues.map(apiIssue);
else if(route==="/repos/example/project/pulls"&&method==="GET")value=data.pulls;
else if(route==="/repos/example/project/labels"&&method==="GET")value=data.labels;
else if(/\\/issues\\/\\d+\\/comments$/.test(route)&&method==="GET")value=issue(Number(route.split("/").at(-2))).comments.map(c=>({...c,user:{login:c.author}}));
else if(/\\/issues\\/\\d+$/.test(route)&&method==="GET")value=apiIssue(issue(Number(route.split("/").at(-1))));
else if(route==="/repos/example/project/issues/1/comments"&&method==="POST"){const i=issue(1);i.comments.push({id:100,author:"operator",body:payload.body,created_at:new Date().toISOString()});value={id:100};}
else if(route==="/repos/example/project/issues/1"&&method==="PATCH"){if(Object.keys(payload).sort().join(",")!=="state,state_reason")throw Error("Unapproved fake payload");issue(1).state=payload.state;issue(1).state_reason=payload.state_reason;value=apiIssue(issue(1));}
else throw Error("Denied fake endpoint/method");
writeFileSync(path,JSON.stringify(data));process.stdout.write("HTTP/2.0 200 OK\\r\\n\\r\\n"+JSON.stringify(value));
`);chmodSync(join(tools,'gh'),0o700);
const cli=join(plugin,'scripts/triage/controller.ts'),selectedPath=tools+':'+process.env.PATH,resolvedBefore=captureFakeExecutable(selectedPath);
const child=spawn(process.execPath,[cli,'start','--host',host,'--repo',source.root,'--mode','ids','--ids','1,2,3,4,5','--output-dir',output,'--checks',checks,'--removals',removals],{env:{...process.env,PATH:selectedPath,CONTROLLER_FAKE_API:database},stdio:['pipe','pipe','pipe']});
let buffer='',error='',stage='analysis',batch:any=null;const events:any[]=[];
child.stdout.on('data',chunk=>{buffer+=chunk;let at:number;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line.trim())continue;try{const event=JSON.parse(line);events.push(event);
 if(event.grade){if(!event.grade.pass){child.stdin.end();continue;}const report=JSON.parse(readFileSync(join(output,'analysis/report.json'),'utf8'));if(report.rows.find((r:any)=>r.number===1)?.close_executable!==true)throw Error('No genuine completed proof');if(report.rows.find((r:any)=>r.number===5)?.state!=='obsolete'||report.rows.find((r:any)=>r.number===5)?.close_executable!==true)throw Error('No genuine removal proof');stage='batch';child.stdin.write(JSON.stringify({id:'batch',method:'batch',params:{actions:[{id:'explain',kind:'comment',issue:1,body:'Verified the canonical answer export and its entry point in this disposable fixture.'},{id:'close',kind:'close',issue:1,reason:'completed',comment:'explain',duplicate_of:null}]}})+'\n');}
 else if(event.id==='batch'){if(event.error)throw Error(event.error);batch=event.result;stage='execute';child.stdin.write(JSON.stringify({id:'execute',method:'execute',params:{approval:{batch_hash:batch.hash,action_ids:['explain','close'],owner_statement:'Approve these exact synthetic fixture actions only'}}})+'\n');}
 else if(event.id==='execute'){stage='finished';child.stdin.end();}
 }catch(failure){stage='failed';error+=String(failure)+'\n';child.stdin.end();}
 }});child.stderr.on('data',chunk=>error+=chunk);
const timer=setTimeout(()=>{child.kill('SIGTERM');},900000);const code=await new Promise<number|null>((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});clearTimeout(timer);
const data=JSON.parse(readFileSync(database,'utf8')),effects=data.trace.filter((r:any)=>r.method!=='GET');
const ghProof=fakeTrackerProof(join(tools,'gh'),resolvedBefore,captureFakeExecutable(selectedPath),data.trace);
writeFileSync(join(root,'events.json'),JSON.stringify(events,null,2));
const result={root,source_checkout:source.root,component_commit:component,component_unchanged:committedComponent(repository,plugin,import.meta.path)===component,host,execution:events.find(e=>e.id==='execute')?.result,exit:code,stage,error,grade:events.find(e=>e.grade)?.grade,completed:events.find(e=>e.id==='execute')?.result?.completed,denied:events.filter(e=>e.error),fake_effects:effects.map((r:any)=>({method:r.method,endpoint:r.endpoint})),gh_resolution_proof:ghProof,analysis_report:join(output,'analysis/report.json')};
writeFileSync(join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
if(!ghProof.pass||code!==0||stage!=='finished'||effects.length!==2||data.issues.find((i:any)=>i.number===1).state!=='closed')process.exitCode=1;
