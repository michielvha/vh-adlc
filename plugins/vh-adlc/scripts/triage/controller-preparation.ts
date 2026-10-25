import{readFileSync,writeFileSync}from"node:fs";
import{join}from"node:path";
import{createHash}from"node:crypto";
import type{Settings}from"./types";
import{inspectRemoval,verifyCommand,requiredVerificationFailed,selectVerificationCache}from"./verification";

export type VerificationSelection={checks?:Record<string,string[]>;removals?:{path:string;before_commit:string}[]};
function normalizedSelection(selection:VerificationSelection={}){
 if(!selection||typeof selection!=="object"||Array.isArray(selection))throw Error("invalid operator verification selection");
 const checks=selection.checks??{},removals=selection.removals??[];
 if(!checks||typeof checks!=="object"||Array.isArray(checks)||Object.entries(checks).some(([name,argv])=>!/^[-a-zA-Z0-9_]{1,100}$/.test(name)||!Array.isArray(argv)||!argv.length||argv.some(arg=>typeof arg!=="string"||arg.includes("\0")))||!Array.isArray(removals)||removals.some(item=>!item||typeof item.path!=="string"||typeof item.before_commit!=="string"))throw Error("invalid operator verification selection");
 return{checks:Object.fromEntries(Object.entries(checks).sort(([a],[b])=>a.localeCompare(b)).map(([name,argv])=>[name,[...argv]])),removals:removals.map(({path,before_commit})=>({path,before_commit}))};
}
// Ordinary selection data, never proof authority. Resume compares the editable
// state with the complete selection in the original hash-bound fixed input.
export function originalVerificationSelection(input:string,state:VerificationSelection={}){
 const manifest=JSON.parse(readFileSync(join(input,"manifest.json"),"utf8"));let original=normalizedSelection();
 if(manifest.verification_hash!==undefined){
  const bytes=readFileSync(join(input,"verification.json"));
  if(!/^[a-f0-9]{64}$/.test(manifest.verification_hash)||createHash("sha256").update(bytes).digest("hex")!==manifest.verification_hash)throw Error("original verification input changed");
  const prepared=JSON.parse(bytes.toString());if(prepared.schema_version!==1||!prepared.selection)throw Error("original operator verification selection unavailable");
  original=normalizedSelection(prepared.selection);
 }
 if(JSON.stringify(original)!==JSON.stringify(normalizedSelection(state)))throw Error("original operator verification selection changed");
 return original;
}
function sanitizedCause(error:unknown){
 const message=error instanceof Error?error.message:"";
 if(["invalid verification command or pass","verification checkout unavailable","invalid retirement scope","retired source is not absent","isolated verification unavailable: Linux and system Bubblewrap are required"].includes(message)||/^triage cannot read repository [a-z-]+$/.test(message))return message;
 const code=(error as NodeJS.ErrnoException|null)?.code;
 return typeof code==="string"&&/^[A-Z][A-Z0-9_]{1,31}$/.test(code)?`verification unavailable before a result (${code})`:"verification unavailable before a result";
}
// The run's observation scope owns this path; inherited environment variables
// cannot redirect prepared receipts into another run's cache.
export function prepareRunVerification(config:Settings,input:string,output:string,selection:VerificationSelection={}){
 selectVerificationCache(join(output,"verification-cache"));return prepareVerification(config,input,selection);
}
// Selection comes only from startup's trusted operator files, never a model tool.
export function prepareVerification(config:Settings,input:string,selection:VerificationSelection={}){
 const selected=normalizedSelection(selection),{checks,removals}=selected;
 const operations:{name:string;pass:"primary"|"adversarial";kind:"check"|"removal";result:any}[]=[];
 let complete=true;
 for(const pass of ["primary","adversarial"]as const){
  for(const[name,argv]of Object.entries(checks)){
   let result;try{result=verifyCommand(config,argv,pass);}catch(error){result={verified:false,error:"selected check unavailable",cause:sanitizedCause(error)};requiredVerificationFailed(config);}
   if(!result.verified)complete=false;operations.push({name,pass,kind:"check",result});
  }
  for(const item of removals){
   let result;try{result=inspectRemoval(config,item.path,item.before_commit,pass);}catch(error){result={error:"selected removal inspection unavailable",cause:sanitizedCause(error)};requiredVerificationFailed(config);complete=false;}
   operations.push({name:item.path,pass,kind:"removal",result});
  }
 }
 const prepared={schema_version:1,complete,selection:selected,operations},bytes=JSON.stringify(prepared,null,2)+"\n";
 writeFileSync(join(input,"verification.json"),bytes,{flag:"wx",mode:0o600});
 const path=join(input,"manifest.json"),manifest=JSON.parse(readFileSync(path,"utf8"));manifest.verification_hash=createHash("sha256").update(bytes).digest("hex");writeFileSync(path,JSON.stringify(manifest,null,2)+"\n");
 return prepared;
}
