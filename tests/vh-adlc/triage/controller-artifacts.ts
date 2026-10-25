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
 const failures:string[]=[];let preserved=false,prepared=false;
 const read=(path:string)=>JSON.parse(readFileSync(join(root,path),"utf8"));
 try{
  const before=read("checkout-before.json"),after=read("checkout-after.json"),current=captureControllerCheckout(checkout);
  const valid=(snapshot:any)=>snapshot.schema_version===1&&snapshot.checkout===realpathSync(checkout)&&snapshot.index?.sha256===sha(Buffer.from(snapshot.index.base64,"base64"));
  preserved=valid(before)&&valid(after)&&JSON.stringify(before)===JSON.stringify(after)&&JSON.stringify(after)===JSON.stringify(current);
  const checks=read("checks.json"),removals=read("removals.json");
  prepared=phases.length>0&&phases.every(phase=>{
   const verification=read(phase+"/input/verification.json");
   return verification.complete===true&&Array.isArray(verification.operations)&&["primary","adversarial"].every(pass=>
    Object.entries(checks).every(([name,argv])=>verification.operations.some((entry:any)=>entry.kind==="check"&&entry.name===name&&entry.pass===pass&&entry.result?.verified===true&&entry.result.exit_code===0&&entry.result.command===JSON.stringify(argv)&&/^[a-f0-9]{64}$/.test(entry.result.receipt)))&&
    removals.every((removal:any)=>verification.operations.some((entry:any)=>entry.kind==="removal"&&entry.name===removal.path&&entry.pass===pass&&entry.result?.path===removal.path&&entry.result.before_commit===removal.before_commit&&entry.result.source_commit===before.head&&/^[a-f0-9]{64}$/.test(entry.result.receipt))));
  });
 }catch{failures.push("missing-or-invalid-controller-artifact");}
 if(!preserved)failures.push("checkout-or-index-not-preserved");if(!prepared)failures.push("required-preparation-not-observed");
 return{pass:failures.length===0,preserved,prepared,failures};
}
