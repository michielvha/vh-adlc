import{test,expect}from"bun:test";
import{mkdtempSync,writeFileSync,rmSync}from"node:fs";
import{join}from"node:path";
import{tmpdir}from"node:os";
import{createHash}from"node:crypto";
import*as preparation from"../../../plugins/vh-adlc/scripts/triage/controller-preparation";
test("recovery keeps every original selected check including uncited checks",()=>{
 const root=mkdtempSync(join(tmpdir(),"triage-bound-selection-"));try{
  const read=(preparation as Record<string,any>).originalVerificationSelection;expect(typeof read).toBe("function");
  const selected={checks:{"answer-check":["bun","check.ts"],"uncited-check":["bun","uncited.ts"]},removals:[{path:"src/retired.ts",before_commit:"a".repeat(40)}]},bytes=JSON.stringify({schema_version:1,complete:true,selection:selected,operations:[]});
  writeFileSync(join(root,"verification.json"),bytes);writeFileSync(join(root,"manifest.json"),JSON.stringify({verification_hash:createHash("sha256").update(bytes).digest("hex")}));
  expect(read(root,selected)).toEqual(selected);
  expect(()=>read(root,{...selected,checks:{"answer-check":selected.checks["answer-check"]}})).toThrow("original operator verification selection changed");
  expect(()=>read(root,{...selected,checks:{...selected.checks,"uncited-check":["bun","changed.ts"]}})).toThrow("original operator verification selection changed");
  expect(()=>read(root,{...selected,removals:[{...selected.removals[0],before_commit:"b".repeat(40)}]})).toThrow("original operator verification selection changed");
  writeFileSync(join(root,"verification.json"),bytes+" ");expect(()=>read(root,selected)).toThrow("original verification input changed");
 }finally{rmSync(root,{recursive:true,force:true});}
});
