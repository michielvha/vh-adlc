import{test,expect}from"bun:test";
import{mkdirSync,writeFileSync,readFileSync}from"node:fs";
import{join}from"node:path";
import{fixture}from"./fixtures";
import{captureControllerCheckout,controllerArtifactProof}from"./controller-artifacts";
test("controller regrade recomputes preservation and preparation from durable artifacts",()=>{
 const f=fixture();try{
  const root=join(f.root,"artifacts");mkdirSync(root);
  // Use a separate fixture so evidence output is outside the assessed tree.
  const source=fixture();try{
   const before=captureControllerCheckout(source.root);writeFileSync(join(root,"checkout-before.json"),JSON.stringify(before));writeFileSync(join(root,"checkout-after.json"),JSON.stringify(before));
   writeFileSync(join(root,"checks.json"),JSON.stringify({"answer-check":["bun","check.ts"]}));writeFileSync(join(root,"removals.json"),JSON.stringify([{path:"src/retired.ts",before_commit:"a".repeat(40)}]));
   const operations=["primary","adversarial"].flatMap(pass=>[{kind:"check",name:"answer-check",pass,result:{verified:true,exit_code:0,command:JSON.stringify(["bun","check.ts"]),receipt:"b".repeat(64)}},{kind:"removal",name:"src/retired.ts",pass,result:{path:"src/retired.ts",before_commit:"a".repeat(40),source_commit:before.head,receipt:"c".repeat(64)}}]);
   const input=join(root,"run/input");mkdirSync(input,{recursive:true});const path=join(input,"verification.json"),valid={complete:true,operations};writeFileSync(path,JSON.stringify(valid));
   expect(controllerArtifactProof(root,source.root,["run"])).toMatchObject({pass:true,preserved:true,prepared:true});
   writeFileSync(path,JSON.stringify({...valid,operations:operations.slice(1)}));expect(controllerArtifactProof(root,source.root,["run"]).prepared).toBe(false);writeFileSync(path,JSON.stringify(valid));
   source.write("src/new.ts","untracked\n");expect(controllerArtifactProof(root,source.root,["run"]).preserved).toBe(false);
   const changed=captureControllerCheckout(source.root);writeFileSync(join(root,"checkout-after.json"),JSON.stringify(changed));expect(controllerArtifactProof(root,source.root,["run"]).preserved).toBe(false);
   writeFileSync(join(root,"checkout-before.json"),JSON.stringify(changed));expect(controllerArtifactProof(root,source.root,["run"]).preserved).toBe(true);
   const bytes=readFileSync(join(source.root,".git/index"));writeFileSync(join(source.root,".git/index"),Buffer.concat([bytes,Buffer.from("changed")]));expect(controllerArtifactProof(root,source.root,["run"]).preserved).toBe(false);
  }finally{source.dispose();}
 }finally{f.dispose();}
});
