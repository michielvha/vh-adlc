import{checkSnapshot,checkUnchanged}from"./check-snapshot";
import{scanSearch,searchProof,searchScope,inSearchScope,type SearchProof}from"./search";
import{hasManagedProofAuthority}from"./controller-authority";
import{checkBoundary}from"./check-boundary";
import{AsyncLocalStorage}from"node:async_hooks";
import {createHash,randomUUID} from "node:crypto";
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {homedir,tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {git,resolveInside,sourcePath} from "./settings";
import type {Inventory,Settings} from "./types";

export type VerificationRecord={schema_version:1;kind:"command"|"inspection"|"issues"|"removal"|"search";repository:string;hostname:string;source_commit:string;pass:"primary"|"adversarial";argv:string[];exit_code:number;stdout_sha256:string;stderr_sha256:string;source_unchanged:boolean;nonce:string;started_at:string;finished_at:string;reads:{path:string;sha256:string;start_line:number;end_line:number}[];issues?:{number:number;sha256:string}[];removal?:{path:string;before_commit:string;sha256:string};search?:SearchProof};
const digest=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
// Actual operations enter this invocation map. Trust additionally requires the
// controller's private proof capability; the exported scope alone grants none.
// Disk records remain attestations, including records copied into a new scope.
const boundary=new AsyncLocalStorage<{records:Map<string,string>;failed:Set<string>;cacheRoot?:string}>();
const observed=()=>boundary.getStore()?.records;
export function selectVerificationCache(root:string){const scope=boundary.getStore();if(!scope||typeof root!=="string"||!root||root.includes("\0"))throw Error("verification cache requires an invocation scope and valid path");scope.cacheRoot=resolve(root);}
export function requiredVerificationFailed(config:Settings){boundary.getStore()?.failed.add(`${config.hostname}/${config.repository}`);}
export function hasRequiredVerificationFailure(config:Settings){return boundary.getStore()?.failed.has(`${config.hostname}/${config.repository}`)??false;}
export function withVerificationBoundary<T>(operation:()=>T,options?:{cacheRoot:string}):T{return boundary.run({records:new Map(),failed:new Set(),cacheRoot:options?.cacheRoot},operation);}
export function verificationReceipt(record:VerificationRecord){
  const{nonce:_nonce,started_at:_started,finished_at:_finished,...content}=record;
  const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  return digest(canonical(content));
}
function persistObserved(config:Settings,record:VerificationRecord){
  const receipt=persistVerification(config,record);observed()?.set(`${config.hostname}/${config.repository}/${receipt}`,JSON.stringify(record));return receipt;
}
export function observedVerification(config:Settings,commit:string,receipt:string|undefined){
  if(!hasManagedProofAuthority())return null;
  const record=verificationRecord(config,commit,receipt);
  const stored=observed()?.get(`${config.hostname}/${config.repository}/${receipt}`);
  if(!record||!stored)return null;
  const actual=JSON.parse(stored) as VerificationRecord;
  return verificationReceipt(actual)===verificationReceipt(record)?actual:null;
}
export function verificationDirectory(config:Settings){return join(boundary.getStore()?.cacheRoot??process.env.VH_ADLC_TRIAGE_VERIFICATION_CACHE??join(process.env.XDG_CACHE_HOME??join(homedir(),".cache"),"vh-adlc","triage-verification"),digest(`${config.hostname}/${config.repository}`));}
export function persistVerification(config:Settings,record:VerificationRecord){
  const bytes=JSON.stringify(record),receipt=verificationReceipt(record),directory=verificationDirectory(config);mkdirSync(directory,{recursive:true});
  try{writeFileSync(join(directory,`${receipt}.json`),bytes,{mode:0o600,flag:"wx"});}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
  return receipt;
}
export function inspectSources(config:Settings,paths:string[],pass:"primary"|"adversarial",range?:{start_line:number;limit:number}){
  if(!paths.length||!["primary","adversarial"].includes(pass))throw Error("invalid source inspection");
  const started=new Date().toISOString(),commit=git(config.root,"rev-parse","HEAD"),files=paths.map(path=>{
    resolveInside(config.root,path);if(!sourcePath(config,path))throw Error("inspection is outside canonical source");
    const read=Bun.spawnSync(["git","-C",config.root,"show",`${commit}:${path}`],{stdout:"pipe",stderr:"pipe"});
    if(read.exitCode!==0)throw Error("canonical source inspection failed");return{path,content:read.stdout.toString(),sha256:digest(read.stdout)};
  });
  if(range&&(!Number.isSafeInteger(range.start_line)||range.start_line<1||!Number.isSafeInteger(range.limit)||range.limit<1||files.some(file=>range.start_line>file.content.split("\n").length)))throw Error("invalid inspection range");
  const empty=digest("");const record:VerificationRecord={schema_version:1,kind:"inspection",repository:config.repository,hostname:config.hostname,source_commit:commit,pass,argv:[],exit_code:0,stdout_sha256:empty,stderr_sha256:empty,source_unchanged:git(config.root,"rev-parse","HEAD")===commit,nonce:randomUUID(),started_at:started,finished_at:new Date().toISOString(),reads:files.map(({path,sha256,content})=>({path,sha256,start_line:range?.start_line??1,end_line:Math.min(content.split("\n").length,range?range.start_line+range.limit-1:Infinity)}))};
  return{receipt:persistObserved(config,record),files};
}

/** Execute only an operator-selected trusted verification command, never issue text. */
export function verifyCommand(config:Settings,argv:string[],pass:"primary"|"adversarial"){
  if(!Array.isArray(argv)||!argv.length||argv.some(arg=>typeof arg!=="string"||arg.includes("\0"))||!argv[0]||!["primary","adversarial"].includes(pass))throw Error("invalid verification command or pass");
  const commit=git(config.root,"rev-parse","HEAD"),scratch=mkdtempSync(join(tmpdir(),"vh-triage-verify-")),checkout=join(scratch,"checkout");
  const home=join(scratch,"home"),temporary=join(scratch,"tmp");mkdirSync(home);mkdirSync(temporary);
  const environment={PATH:process.env.PATH??"/usr/bin:/bin",LANG:"C.UTF-8",HOME:home,XDG_CONFIG_HOME:join(home,".config"),XDG_CACHE_HOME:join(home,".cache"),TMPDIR:temporary,GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"/dev/null",GIT_TERMINAL_PROMPT:"0"};
  try{
    for(const args of [["clone","--no-local","--depth","1","--single-branch","--no-tags","--no-checkout",config.root,checkout],["-C",checkout,"-c","core.hooksPath=/dev/null","checkout","--detach",commit]]){
      const setup=Bun.spawnSync(["git",...args],{env:environment,stdout:"pipe",stderr:"pipe",timeout:60_000,detached:true});
      if(process.platform!=="win32")try{process.kill(-setup.pid,"SIGKILL");}catch{}
      if(setup.exitCode!==0)throw Error("verification checkout unavailable");
    }
    const before=checkSnapshot(checkout);
    const started=new Date().toISOString(),run=Bun.spawnSync(checkBoundary(checkout,argv),{cwd:checkout,env:environment,stdin:"ignore",stdout:"pipe",stderr:"pipe",timeout:120_000,detached:true});
    // The command owns this process group; descendants must not survive a test or timeout.
    if(process.platform!=="win32")try{process.kill(-run.pid,"SIGKILL");}catch{}
    // Never execute host Git against output controlled by repository code.
    const unchanged=checkUnchanged(checkout,before);
    const record:VerificationRecord={schema_version:1,kind:"command",repository:config.repository,hostname:config.hostname,source_commit:commit,pass,argv,
      exit_code:run.exitCode??-1,stdout_sha256:digest(run.stdout),stderr_sha256:digest(run.stderr),source_unchanged:unchanged,nonce:randomUUID(),started_at:started,finished_at:new Date().toISOString(),reads:[]};
    const receipt=persistObserved(config,record);
    if(record.exit_code!==0||!unchanged)requiredVerificationFailed(config);
    return{stdout:run.stdout.toString(),stderr:run.stderr.toString(),kind:"test",detail:unchanged?`Observed command exit ${record.exit_code} in a disposable checkout of the fixed source commit`:"Verification changed its disposable source checkout; no implementation proof",verified:record.exit_code===0&&unchanged,command:JSON.stringify(argv),exit_code:record.exit_code,receipt};
  }catch(error){requiredVerificationFailed(config);throw error;}finally{rmSync(scratch,{recursive:true,force:true});}
}

export function verificationRecord(config:Settings,sourceCommit:string,receipt:string|undefined):VerificationRecord|null{
  if(typeof receipt!=="string"||!/^[0-9a-f]{64}$/.test(receipt))return null;
  try{
    const bytes=readFileSync(join(verificationDirectory(config),`${receipt}.json`)),record=JSON.parse(bytes.toString()) as VerificationRecord;
    if(verificationReceipt(record)!==receipt||record.schema_version!==1||record.repository!==config.repository||record.hostname!==config.hostname||record.source_commit!==sourceCommit||
      !["primary","adversarial"].includes(record.pass)||!Array.isArray(record.argv)||record.argv.some(arg=>typeof arg!=="string")||record.exit_code!==0||!record.source_unchanged||
      !/^[a-f0-9]{64}$/.test(record.stdout_sha256)||!/^[a-f0-9]{64}$/.test(record.stderr_sha256)||typeof record.nonce!=="string")return null;
    if(!Number.isFinite(Date.parse(record.started_at))||!Number.isFinite(Date.parse(record.finished_at))||Date.parse(record.finished_at)<Date.parse(record.started_at))return null;
    if(record.kind==="command"&&!record.argv.length||record.kind==="inspection"&&(!Array.isArray(record.reads)||!record.reads.length)||!["command","inspection","issues","removal","search"].includes(record.kind))return null;
    if(record.kind==="inspection")for(const read of record.reads){
      if(!sourcePath(config,read.path))return null;
      const bytes=Bun.spawnSync(["git","-C",config.root,"show",`${sourceCommit}:${read.path}`],{stdout:"pipe",stderr:"pipe"});
      if(bytes.exitCode!==0||digest(bytes.stdout)!==read.sha256)return null;
      if(!Number.isSafeInteger(read.start_line)||!Number.isSafeInteger(read.end_line)||read.start_line<1||read.end_line<read.start_line||read.end_line>bytes.stdout.toString().split("\n").length)return null;
    }
    if(record.kind==="issues"&&(!record.issues?.length||record.issues.some(issue=>!Number.isSafeInteger(issue.number)||issue.number<1||!/^[a-f0-9]{64}$/.test(issue.sha256))))return null;
    if(record.kind==="removal"&&(!record.removal||!sourcePath(config,record.removal.path)||!/^[a-f0-9]{40}$/.test(record.removal.before_commit)||!/^[a-f0-9]{64}$/.test(record.removal.sha256)))return null;
    if(record.kind==="search"){
      const search=record.search;
      if(!search||typeof search.query!=="string"||!search.query||search.query.length>2000||search.query.includes("\0")||!Array.isArray(search.scope)||!search.scope.length||search.scope.some(path=>typeof path!=="string"||!sourcePath(config,path))||!Array.isArray(search.scanned)||!Array.isArray(search.skipped)||search.skipped.length||search.complete!==true||!Array.isArray(search.matches))return null;
      if(search.scanned.some(file=>!file||!sourcePath(config,file.path)||!inSearchScope(file.path,search.scope)||!/^[a-f0-9]{64}$/.test(file.sha256))||new Set(search.scanned.map(file=>file.path)).size!==search.scanned.length||search.matches.some(match=>!match||!search.scanned.some(file=>file.path===match.path)||!Number.isSafeInteger(match.line)||match.line<1))return null;
    }
    return record;
  }catch{return null;}
}

function baseRecord(config:Settings,pass:"primary"|"adversarial",kind:VerificationRecord["kind"]):VerificationRecord{
  if(!["primary","adversarial"].includes(pass))throw Error("invalid verification pass");
  const now=new Date().toISOString(),empty=digest("");
  return{schema_version:1,kind,repository:config.repository,hostname:config.hostname,source_commit:git(config.root,"rev-parse","HEAD"),pass,argv:[],exit_code:0,stdout_sha256:empty,stderr_sha256:empty,source_unchanged:true,nonce:randomUUID(),started_at:now,finished_at:now,reads:[]};
}
export function inspectIssues(config:Settings,inventory:Inventory,numbers:number[],pass:"primary"|"adversarial"){
  const record=baseRecord(config,pass,"issues");
  if(inventory.repository!==config.repository||inventory.hostname!==config.hostname||inventory.source_commit!==record.source_commit||!numbers.length||numbers.some(number=>!Number.isSafeInteger(number)||number<1))throw Error("invalid fixed issue inspection");
  const issues=numbers.map(number=>{const issue=[...inventory.issues,...inventory.closed_issues].find(issue=>issue.number===number);if(!issue)throw Error("issue is outside fixed inventory");return issue;});
  record.issues=issues.map(issue=>({number:issue.number,sha256:digest(JSON.stringify(issue))}));
  return{receipt:persistObserved(config,record),issues};
}
export function inspectRemoval(config:Settings,path:string,before:string,pass:"primary"|"adversarial"){
  const record=baseRecord(config,pass,"removal");
  resolveInside(config.root,path);if(!sourcePath(config,path)||!/^[a-f0-9]{40}$/.test(before))throw Error("invalid retirement scope");
  git(config.root,"merge-base","--is-ancestor",before,record.source_commit);
  const old=Bun.spawnSync(["git","-C",config.root,"show",`${before}:${path}`],{stdout:"pipe",stderr:"pipe"});
  if(old.exitCode!==0||git(config.root,"ls-tree","-r","--name-only",record.source_commit,"--",path))throw Error("retired source is not absent");
  record.removal={path,before_commit:before,sha256:digest(old.stdout)};
  return{receipt:persistObserved(config,record),path,before_commit:before,source_commit:record.source_commit,before_content:old.stdout.toString()};
}


/** Observe one literal search of the fixed canonical Git blobs, with bounded query text. */
export function inspectSearch(config:Settings,query:string,scope:string[],pass:"primary"|"adversarial"){
 if(!Array.isArray(scope)||!scope.length||scope.some(path=>typeof path!=="string"||!sourcePath(config,path)))throw Error("invalid canonical search scope");
 scope=searchScope(scope);const record=baseRecord(config,pass,"search");
 const tree=Bun.spawnSync(["git","-C",config.root,"ls-tree","-r","-z","--full-tree",record.source_commit],{stdout:"pipe",stderr:"pipe"});if(tree.exitCode!==0)throw Error("fixed search tree unavailable");
 const entries=tree.stdout.toString().split("\0").filter(Boolean).map(row=>{const match=row.match(/^(\d+) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/);if(!match)throw Error("unsupported canonical search entry");return{kind:match[2],oid:match[3],path:match[4]};}).filter(entry=>sourcePath(config,entry.path)&&inSearchScope(entry.path,scope));
 if(entries.some(entry=>entry.kind!=="blob"))throw Error("canonical search contains unavailable source");
 const files:{path:string;sha256:string;bytes:Buffer}[]=[];
 if(entries.length){
  // Batch object reads keep exhaustive scope verification linear in Git calls.
  const batch=Bun.spawnSync(["git","-C",config.root,"cat-file","--batch"],{stdin:Buffer.from(entries.map(entry=>entry.oid).join("\n")+"\n"),stdout:"pipe",stderr:"pipe"});if(batch.exitCode!==0)throw Error("fixed search blobs unavailable");let offset=0;
  for(const entry of entries){const end=batch.stdout.indexOf(10,offset),header=batch.stdout.subarray(offset,end).toString(),match=header.match(/^([a-f0-9]+) blob ([0-9]+)$/);if(end<0||!match||match[1]!==entry.oid)throw Error("invalid fixed search blob response");const size=Number(match[2]);offset=end+1;if(!Number.isSafeInteger(size)||size<0||offset+size>=batch.stdout.length||batch.stdout[offset+size]!==10)throw Error("incomplete fixed search blob response");const bytes=batch.stdout.subarray(offset,offset+size);files.push({path:entry.path,sha256:digest(bytes),bytes});offset+=size+1;}
  if(offset!==batch.stdout.length)throw Error("unexpected fixed search blob data");
 }
 const scan=scanSearch(query,scope,files);record.search=searchProof(scan);record.exit_code=scan.complete?0:1;record.source_unchanged=git(config.root,"rev-parse","HEAD")===record.source_commit;record.finished_at=new Date().toISOString();
 return{...scan,result:scan.matches.length?"found":"empty",receipt:persistObserved(config,record)};
}
