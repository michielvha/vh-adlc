import {createHash,randomUUID} from "node:crypto";
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {homedir,tmpdir} from "node:os";
import {join} from "node:path";
import {git,resolveInside,sourcePath} from "./settings";
import type {Settings} from "./types";

export type VerificationRecord={schema_version:1;kind:"command"|"inspection";repository:string;hostname:string;source_commit:string;pass:"primary"|"adversarial";argv:string[];exit_code:number;stdout_sha256:string;stderr_sha256:string;source_unchanged:boolean;nonce:string;started_at:string;finished_at:string;reads:{path:string;sha256:string;start_line:number;end_line:number}[]};
const digest=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
export function verificationDirectory(config:Settings){return join(process.env.VH_ADLC_TRIAGE_VERIFICATION_CACHE??join(process.env.XDG_CACHE_HOME??join(homedir(),".cache"),"vh-adlc","triage-verification"),digest(`${config.hostname}/${config.repository}`));}
export function persistVerification(config:Settings,record:VerificationRecord){
  const bytes=JSON.stringify(record),receipt=digest(bytes),directory=verificationDirectory(config);mkdirSync(directory,{recursive:true});
  try{writeFileSync(join(directory,`${receipt}.json`),bytes,{mode:0o600,flag:"wx"});}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
  return receipt;
}
export function inspectSources(config:Settings,paths:string[],pass:"primary"|"adversarial"){
  if(!paths.length||!["primary","adversarial"].includes(pass))throw Error("invalid source inspection");
  const started=new Date().toISOString(),commit=git(config.root,"rev-parse","HEAD"),files=paths.map(path=>{
    resolveInside(config.root,path);if(!sourcePath(config,path))throw Error("inspection is outside canonical source");
    const read=Bun.spawnSync(["git","-C",config.root,"show",`${commit}:${path}`],{stdout:"pipe",stderr:"pipe"});
    if(read.exitCode!==0)throw Error("canonical source inspection failed");return{path,content:read.stdout.toString(),sha256:digest(read.stdout)};
  });
  const empty=digest("");const record:VerificationRecord={schema_version:1,kind:"inspection",repository:config.repository,hostname:config.hostname,source_commit:commit,pass,argv:[],exit_code:0,stdout_sha256:empty,stderr_sha256:empty,source_unchanged:git(config.root,"rev-parse","HEAD")===commit,nonce:randomUUID(),started_at:started,finished_at:new Date().toISOString(),reads:files.map(({path,sha256,content})=>({path,sha256,start_line:1,end_line:content.split("\n").length}))};
  return{receipt:persistVerification(config,record),files};
}

/** Execute only an operator-selected trusted verification command, never issue text. */
export function verifyCommand(config:Settings,argv:string[],pass:"primary"|"adversarial"){
  if(!Array.isArray(argv)||!argv.length||argv.some(arg=>typeof arg!=="string"||arg.includes("\0"))||!argv[0]||!["primary","adversarial"].includes(pass))throw Error("invalid verification command or pass");
  const commit=git(config.root,"rev-parse","HEAD"),scratch=mkdtempSync(join(tmpdir(),"vh-triage-verify-")),checkout=join(scratch,"checkout");
  const environment={...process.env,GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"/dev/null"};
  try{
    for(const args of [["clone","--no-hardlinks","--no-checkout",config.root,checkout],["-C",checkout,"-c","core.hooksPath=/dev/null","checkout","--detach",commit]]){
      const setup=Bun.spawnSync(["git",...args],{env:environment,stdout:"pipe",stderr:"pipe",timeout:60_000});
      if(setup.exitCode!==0)throw Error("verification checkout unavailable");
    }
    const started=new Date().toISOString(),run=Bun.spawnSync(argv,{cwd:checkout,env:environment,stdout:"pipe",stderr:"pipe",timeout:120_000,detached:true});
    // The command owns this process group; descendants must not survive a test or timeout.
    if(process.platform!=="win32")try{process.kill(-run.pid,"SIGKILL");}catch{}
    const unchanged=git(checkout,"rev-parse","HEAD")===commit&&!git(checkout,"diff","HEAD","--name-only");
    const record:VerificationRecord={schema_version:1,kind:"command",repository:config.repository,hostname:config.hostname,source_commit:commit,pass,argv,
      exit_code:run.exitCode??-1,stdout_sha256:digest(run.stdout),stderr_sha256:digest(run.stderr),source_unchanged:unchanged,nonce:randomUUID(),started_at:started,finished_at:new Date().toISOString(),reads:[]};
    const receipt=persistVerification(config,record);
    return{kind:"test",detail:unchanged?`Observed command exit ${record.exit_code} in a disposable checkout of the fixed source commit`:"Verification changed its disposable source checkout; no implementation proof",verified:record.exit_code===0&&unchanged,command:JSON.stringify(argv),exit_code:record.exit_code,receipt};
  }finally{rmSync(scratch,{recursive:true,force:true});}
}

export function verificationRecord(config:Settings,sourceCommit:string,receipt:string|undefined):VerificationRecord|null{
  if(typeof receipt!=="string"||!/^[0-9a-f]{64}$/.test(receipt))return null;
  try{
    const bytes=readFileSync(join(verificationDirectory(config),`${receipt}.json`)),record=JSON.parse(bytes.toString()) as VerificationRecord;
    if(digest(bytes)!==receipt||record.schema_version!==1||record.repository!==config.repository||record.hostname!==config.hostname||record.source_commit!==sourceCommit||
      !["primary","adversarial"].includes(record.pass)||!Array.isArray(record.argv)||record.argv.some(arg=>typeof arg!=="string")||record.exit_code!==0||!record.source_unchanged||
      !/^[a-f0-9]{64}$/.test(record.stdout_sha256)||!/^[a-f0-9]{64}$/.test(record.stderr_sha256)||typeof record.nonce!=="string")return null;
    if(!Number.isFinite(Date.parse(record.started_at))||!Number.isFinite(Date.parse(record.finished_at))||Date.parse(record.finished_at)<Date.parse(record.started_at))return null;
    if(record.kind==="command"&&!record.argv.length||record.kind==="inspection"&&(!Array.isArray(record.reads)||!record.reads.length)||!["command","inspection"].includes(record.kind))return null;
    if(record.kind==="inspection")for(const read of record.reads){
      if(!sourcePath(config,read.path))return null;
      const bytes=Bun.spawnSync(["git","-C",config.root,"show",`${sourceCommit}:${read.path}`],{stdout:"pipe",stderr:"pipe"});
      if(bytes.exitCode!==0||digest(bytes.stdout)!==read.sha256)return null;
      if(!Number.isSafeInteger(read.start_line)||!Number.isSafeInteger(read.end_line)||read.start_line<1||read.end_line<read.start_line||read.end_line>bytes.stdout.toString().split("\n").length)return null;
    }
    return record;
  }catch{return null;}
}
