import{test,expect}from"bun:test";
import{mkdirSync,writeFileSync,readFileSync}from"node:fs";
import{createHash}from"node:crypto";
import{join}from"node:path";
import{fixture}from"./fixtures";
import{captureControllerCheckout,controllerArtifactProof}from"./controller-artifacts";
import{loadSettings}from"../../../plugins/vh-adlc/scripts/triage/settings";
import{persistVerification,withVerificationBoundary,verificationDirectory,type VerificationRecord}from"../../../plugins/vh-adlc/scripts/triage/verification";
const sha=(bytes:string)=>createHash("sha256").update(bytes).digest("hex");
test("controller regrade recomputes preservation and preparation from durable artifacts",()=>{
 const f=fixture(),source=fixture();try{
  const root=join(f.root,"artifacts");mkdirSync(root);const before=captureControllerCheckout(source.root),config=loadSettings(source.root);
  writeFileSync(join(root,"checkout-before.json"),JSON.stringify(before));writeFileSync(join(root,"checkout-after.json"),JSON.stringify(before));
  const checks={"answer-check":["bun","check.ts"]},removals=[{path:"src/retired.ts",before_commit:"a".repeat(40)}];
  writeFileSync(join(root,"checks.json"),JSON.stringify(checks));writeFileSync(join(root,"removals.json"),JSON.stringify(removals));
  const input=join(root,"run/input"),cache=join(root,"run/analysis/verification-cache");mkdirSync(input,{recursive:true});
  const save=(operations:any[])=>{const bytes=JSON.stringify({schema_version:1,complete:true,selection:{checks,removals},operations});writeFileSync(join(input,"verification.json"),bytes);writeFileSync(join(input,"manifest.json"),JSON.stringify({verification_hash:sha(bytes)}));};
  const absent=["primary","adversarial"].flatMap(pass=>[{kind:"check",name:"answer-check",pass,result:{verified:true,exit_code:0,command:JSON.stringify(checks["answer-check"]),receipt:"b".repeat(64),stdout:"",stderr:""}},{kind:"removal",name:"src/retired.ts",pass,result:{path:removals[0].path,before_commit:removals[0].before_commit,source_commit:before.head,before_content:"retired",receipt:"c".repeat(64)}}]);save(absent);
  expect(controllerArtifactProof(root,source.root,["run"]).prepared).toBe(false);
  const operations:any[]=[],records:{path:string;bytes:string}[]=[];
  withVerificationBoundary(()=>{
   for(const pass of["primary","adversarial"]as const){
    const base:VerificationRecord={schema_version:1,kind:"command",hostname:config.hostname,repository:config.repository,source_commit:before.head,pass,argv:checks["answer-check"],exit_code:0,stdout_sha256:sha(""),stderr_sha256:sha(""),source_unchanged:true,nonce:"unit-regrade-only",started_at:"2026-10-25T12:00:00Z",finished_at:"2026-10-25T12:00:00Z",reads:[]};
    const command=persistVerification(config,base),removal={...base,kind:"removal"as const,argv:[],removal:{...removals[0],sha256:sha("retired")}},retired=persistVerification(config,removal);
    operations.push({kind:"check",name:"answer-check",pass,result:{verified:true,exit_code:0,command:JSON.stringify(checks["answer-check"]),receipt:command,stdout:"",stderr:""}},{kind:"removal",name:removals[0].path,pass,result:{...removals[0],source_commit:before.head,before_content:"retired",receipt:retired}});
    records.push({path:join(verificationDirectory(config),command+".json"),bytes:JSON.stringify(base)});
   }
  },{cacheRoot:cache});save(operations);
  expect(controllerArtifactProof(root,source.root,["run"])).toMatchObject({pass:true,preserved:true,prepared:true});
  writeFileSync(records[0].path,JSON.stringify({...JSON.parse(records[0].bytes),exit_code:1}));expect(controllerArtifactProof(root,source.root,["run"]).prepared).toBe(false);writeFileSync(records[0].path,records[0].bytes);
  save(operations.slice(1));expect(controllerArtifactProof(root,source.root,["run"]).prepared).toBe(false);save(operations);
  source.write("src/new.ts","untracked\n");expect(controllerArtifactProof(root,source.root,["run"]).preserved).toBe(false);
  const changed=captureControllerCheckout(source.root);writeFileSync(join(root,"checkout-after.json"),JSON.stringify(changed));expect(controllerArtifactProof(root,source.root,["run"]).preserved).toBe(false);
  writeFileSync(join(root,"checkout-before.json"),JSON.stringify(changed));expect(controllerArtifactProof(root,source.root,["run"]).preserved).toBe(true);
  const bytes=readFileSync(join(source.root,".git/index"));writeFileSync(join(source.root,".git/index"),Buffer.concat([bytes,Buffer.from("changed")]));expect(controllerArtifactProof(root,source.root,["run"]).preserved).toBe(false);
 }finally{source.dispose();f.dispose();}
});
