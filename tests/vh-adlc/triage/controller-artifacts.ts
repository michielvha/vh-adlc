import{loadSettings}from"../../../plugins/vh-adlc/scripts/triage/settings";
import{verificationRecord,verificationReceipt,verificationDirectory,withVerificationBoundary,type VerificationRecord}from"../../../plugins/vh-adlc/scripts/triage/verification";
import{originalVerificationSelection}from"../../../plugins/vh-adlc/scripts/triage/controller-preparation";
import{createHash}from"node:crypto";
import{readFileSync,readdirSync,lstatSync,readlinkSync,realpathSync}from"node:fs";
import{join}from"node:path";
const sha=(bytes:Buffer|string)=>createHash("sha256").update(bytes).digest("hex");
export function captureControllerCheckout(root:string){
 const entries:unknown[]=[];const walk=(directory:string,prefix="")=>{for(const name of readdirSync(directory).sort()){
  if(!prefix&&name===".git")continue;const path=join(directory,name),relative=prefix+name,stat=lstatSync(path);
  if(stat.isDirectory()){entries.push([relative,"directory",stat.mode]);walk(path,relative+"/");}
  else if(stat.isSymbolicLink())entries.push([relative,"symlink",stat.mode,readlinkSync(path)]);
  else if(stat.isFile())entries.push([relative,"file",stat.mode,sha(readFileSync(path))]);
  else throw Error("unsupported source entry in native fixture");
 }};walk(root);
 const head=Bun.spawnSync(["git","-C",root,"rev-parse","HEAD"],{stdout:"pipe",stderr:"pipe"});if(head.exitCode!==0)throw Error("native fixture head unavailable");
 const index=readFileSync(join(root,".git/index"));return{schema_version:1,checkout:realpathSync(root),head:head.stdout.toString().trim(),entries,index:{sha256:sha(index),base64:index.toString("base64")}};
}
// Evidence regrade, not execution authority. Native tool/probe grades must also pass.
export function controllerArtifactProof(root:string,checkout:string,phases:string[]){
 const failures:string[]=[];let preserved=false,prepared=false,preparationIntegrity=false;
 const read=(path:string)=>JSON.parse(readFileSync(join(root,path),"utf8"));
 try{
  const before=read("checkout-before.json"),after=read("checkout-after.json"),current=captureControllerCheckout(checkout);
  const valid=(snapshot:any)=>snapshot.schema_version===1&&snapshot.checkout===realpathSync(checkout)&&snapshot.index?.sha256===sha(Buffer.from(snapshot.index.base64,"base64"));
  preserved=valid(before)&&valid(after)&&JSON.stringify(before)===JSON.stringify(after)&&JSON.stringify(after)===JSON.stringify(current);
  const checks=read("checks.json"),removals=read("removals.json"),config=loadSettings(checkout);
  preparationIntegrity=phases.length>0&&phases.every(phase=>withVerificationBoundary(()=>{
   const input=join(root,phase,"input"),verification=read(phase+"/input/verification.json");originalVerificationSelection(input,{checks,removals});
   const record=(entry:any)=>{
    const receipt=entry.result?.receipt;
    if(entry.kind!=="check"||entry.result?.verified!==false)return verificationRecord(config,before.head,receipt);
    // Failure attestations never enter the runtime's success-only proof reader.
    if(typeof receipt!=="string"||!/^[a-f0-9]{64}$/.test(receipt))return null;
    const cached=JSON.parse(readFileSync(join(verificationDirectory(config),receipt+".json"),"utf8"))as VerificationRecord;
    if(verificationReceipt(cached)!==receipt||cached.schema_version!==1||cached.kind!=="command"||cached.hostname!==config.hostname||cached.repository!==config.repository||cached.source_commit!==before.head||
     !["primary","adversarial"].includes(cached.pass)||!Array.isArray(cached.argv)||!cached.argv.length||cached.argv.some(arg=>typeof arg!=="string")||!Number.isInteger(cached.exit_code)||typeof cached.source_unchanged!=="boolean"||cached.exit_code===0&&cached.source_unchanged||
     !Array.isArray(cached.reads)||cached.reads.length||typeof cached.nonce!=="string"||!/^[a-f0-9]{64}$/.test(cached.stdout_sha256)||!/^[a-f0-9]{64}$/.test(cached.stderr_sha256)||
     !Number.isFinite(Date.parse(cached.started_at))||!Number.isFinite(Date.parse(cached.finished_at))||Date.parse(cached.finished_at)<Date.parse(cached.started_at))return null;
    return cached;
   };
   return Array.isArray(verification.operations)&&verification.complete===verification.operations.every((entry:any)=>entry.kind==="check"?entry.result.verified===true:entry.kind==="removal"&&typeof entry.result.receipt==="string")&&verification.operations.length===2*(Object.keys(checks).length+removals.length)&&["primary","adversarial"].every(pass=>
    Object.entries(checks).every(([name,argv])=>verification.operations.some((entry:any)=>{
     if(entry.kind!=="check"||entry.name!==name||entry.pass!==pass)return false;const cached=record(entry);
     return cached?.kind==="command"&&cached.pass===pass&&JSON.stringify(cached.argv)===JSON.stringify(argv)&&entry.result.verified===(cached.exit_code===0&&cached.source_unchanged)&&entry.result.exit_code===cached.exit_code&&entry.result.command===JSON.stringify(argv)&&typeof entry.result.stdout==="string"&&typeof entry.result.stderr==="string"&&sha(entry.result.stdout)===cached.stdout_sha256&&sha(entry.result.stderr)===cached.stderr_sha256;
    }))&&removals.every((removal:any)=>verification.operations.some((entry:any)=>{
     if(entry.kind!=="removal"||entry.name!==removal.path||entry.pass!==pass)return false;const cached=record(entry);
     return cached?.kind==="removal"&&cached.source_unchanged===true&&cached.pass===pass&&cached.removal?.path===removal.path&&cached.removal.before_commit===removal.before_commit&&entry.result.path===removal.path&&entry.result.before_commit===removal.before_commit&&entry.result.source_commit===before.head&&typeof entry.result.before_content==="string"&&sha(entry.result.before_content)===cached.removal.sha256&&!current.entries.some((entry:any)=>entry[0]===removal.path);
    })));
  },{cacheRoot:join(root,phase,"analysis/verification-cache")}));
  prepared=preparationIntegrity&&phases.every(phase=>read(phase+"/input/verification.json").complete===true);
 }catch{failures.push("missing-or-invalid-controller-artifact");}
 if(!preserved)failures.push("checkout-or-index-not-preserved");if(!preparationIntegrity)failures.push("required-preparation-not-observed");else if(!prepared)failures.push("required-preparation-failed");
 return{pass:failures.length===0,preserved,prepared,preparation_integrity:preparationIntegrity,failures};
}

export function controllerOutcomeFacts(events:{first:any[];final:any[]},api:any){
 const phase=(rows:any[],recovery:boolean)=>{
  const exits=rows.filter(event=>event.kind==="owned-controller-exit");if(exits.length!==1)throw Error("owned controller exit unavailable");
  const exited=exits[0],execution=recovery?rows.find(event=>event.recovery)?.recovery:rows.find(event=>event.id==="execute")?.result;
  return{exit:exited.code,signal:exited.signal,interrupted:exited.code===null&&exited.signal==="SIGKILL",stage:execution&&exited.code===0?"finished":"interrupted",grade:rows.find(event=>event.grade)?.grade?.pass===true,completed:execution?.completed,failed:execution?.failed,blocked:execution?.blocked};
 };
 return{first:phase(events.first,false),final:phase(events.final,events.final.some(event=>event.recovery)),effects:api.trace.filter((event:any)=>event.method!=="GET").map(({method,endpoint,payload}:any)=>({method,endpoint,payload})),approved_comment:events.first.find(event=>event.id==="batch")?.result?.actions.find((action:any)=>action.id==="explain")?.body,issue_closed:api.issues.find((issue:any)=>issue.number===1)?.state==="closed"};
}
