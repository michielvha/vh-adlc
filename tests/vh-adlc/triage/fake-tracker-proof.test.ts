import{test,expect}from"bun:test";
import{mkdtempSync,mkdirSync,writeFileSync,chmodSync,rmSync}from"node:fs";
import{join}from"node:path";
import{tmpdir}from"node:os";
import{captureFakeExecutable,fakeTrackerProof}from"./fake-tracker-proof";

test("fake tracker proof measures actual executable resolution and invocation bytes",()=>{
 const root=mkdtempSync(join(tmpdir(),"triage-fake-proof-"));try{
  const tools=join(root,"tools");mkdirSync(tools);const executable=join(tools,"gh");
  writeFileSync(executable,'#!/usr/bin/env bun\nimport{readFileSync,realpathSync}from"node:fs";import{createHash}from"node:crypto";console.log(JSON.stringify({executable:realpathSync(import.meta.path),sha256:createHash("sha256").update(readFileSync(import.meta.path)).digest("hex")}));\n');chmodSync(executable,0o700);
  const path=tools+":"+process.env.PATH,before=captureFakeExecutable(path),run=Bun.spawnSync(["gh"],{env:{...process.env,PATH:path},stdout:"pipe",stderr:"pipe"});expect(run.exitCode).toBe(0);
  const trace=[JSON.parse(run.stdout.toString())],proof=fakeTrackerProof(executable,before,captureFakeExecutable(path),trace);expect(proof.pass).toBe(true);expect(proof.recorded_invocations).toBe(1);expect(proof.scope).toContain("not a host-wide network measurement");expect(proof).not.toHaveProperty("real_tracker_calls");
  expect(fakeTrackerProof(executable,before,before,[]).pass).toBe(false);
  expect(fakeTrackerProof(executable,before,before,[{...trace[0],sha256:"a".repeat(64)}]).pass).toBe(false);
  expect(fakeTrackerProof(executable,{...before,path:join(root,"other-gh")},before,trace).pass).toBe(false);
  writeFileSync(executable,"changed executable");expect(fakeTrackerProof(executable,before,captureFakeExecutable(path),trace).pass).toBe(false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
