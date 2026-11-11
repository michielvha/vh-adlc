import{randomUUID}from"node:crypto";
import{test}from"./boundary-test";
import{expect}from"bun:test";
import{readFileSync,existsSync,chmodSync}from"node:fs";
import{join}from"node:path";
import{fixture,git}from"./fixtures";
import{loadSettings}from"../../../plugins/vh-adlc/scripts/triage/settings";
import{inspectSources,verificationRecord,verifyCommand}from"../../../plugins/vh-adlc/scripts/triage/verification";

test("verification observes failure and source mutation without changing the caller checkout or index",()=>{
  const f=fixture();try{
    const config=loadSettings(f.root),head=git(f.root,"rev-parse","HEAD"),before=readFileSync(join(f.root,"src/app.ts")),index=readFileSync(join(f.root,".git/index"));
    const failed=verifyCommand(config,["bun","-e","process.exit(7)"],"primary");
    expect(failed.verified).toBe(false);expect(failed.exit_code).toBe(7);expect(verificationRecord(config,head,failed.receipt)).toBeNull();
    const changed=verifyCommand(config,["bun","-e",'await Bun.write("src/app.ts","Changed source\\n");'],"adversarial");
    expect(changed.verified).toBe(false);expect(verificationRecord(config,head,changed.receipt)).toBeNull();
    expect(readFileSync(join(f.root,"src/app.ts"))).toEqual(before);expect(readFileSync(join(f.root,".git/index"))).toEqual(index);
    const inspected=inspectSources(config,["src/app.ts"],"primary");expect(verificationRecord(config,head,inspected.receipt)?.reads[0].path).toBe("src/app.ts");
    expect(verificationRecord(config,"0".repeat(40),inspected.receipt)).toBeNull();
  }finally{f.dispose();}
});

test("an owned verification command cannot leave its spawned process group running",()=>{
  if(process.platform!=="linux")return;
  const f=fixture();try{
    const marker="triage-owned-child-"+randomUUID(),code=`Bun.spawn(["bun","-e",${JSON.stringify('setTimeout(()=>{},2500); // '+marker)}],{stdout:"ignore",stderr:"ignore"});process.exit(0);`;
    const result=verifyCommand(loadSettings(f.root),["bun","-e",code],"primary");expect(result.verified).toBe(true);
    // Read-only observation by a unique marker: never kill processes by name.
    // The PID namespace also prevents a check from reporting host process IDs.
    const observed=Bun.spawnSync(["pgrep","-f",marker],{stdout:"pipe",stderr:"pipe"});expect(observed.exitCode).toBe(1);
  }finally{f.dispose();}
});

test("ordinary helper calls outside a boundary remain attestations",()=>{
 const f=fixture();try{
  const code=`import{loadSettings}from ${JSON.stringify(join(import.meta.dir,"../../../plugins/vh-adlc/scripts/triage/settings.ts"))};import{inspectSources,observedVerification}from ${JSON.stringify(join(import.meta.dir,"../../../plugins/vh-adlc/scripts/triage/verification.ts"))};const config=loadSettings(${JSON.stringify(f.root)}),receipt=inspectSources(config,["src/app.ts"],"primary").receipt;console.log(Boolean(observedVerification(config,${JSON.stringify(git(f.root,"rev-parse","HEAD"))},receipt)));`;
  const run=Bun.spawnSync(["bun","-e",code],{stdout:"pipe",stderr:"pipe"});expect(run.exitCode).toBe(0);expect(run.stdout.toString().trim()).toBe("false");
 }finally{f.dispose();}
});

test("repository checks receive a temporary home and no controller environment canary",()=>{
 const f=fixture(),previous=process.env.TRIAGE_CONTROLLER_CANARY;
 try{
  process.env.TRIAGE_CONTROLLER_CANARY="NON_SECRET_CONTROLLER_CANARY";
  const code=`if(process.env.TRIAGE_CONTROLLER_CANARY||process.env.HOME===${JSON.stringify(process.env.HOME)})process.exit(9);`;
  expect(verifyCommand(loadSettings(f.root),["bun","-e",code],"primary").verified).toBe(true);
 }finally{if(previous===undefined)delete process.env.TRIAGE_CONTROLLER_CANARY;else process.env.TRIAGE_CONTROLLER_CANARY=previous;f.dispose();}
});


test("fixed-source checks cannot read a host file outside their declared checkout",()=>{
 const f=fixture();try{
  const canary=join(f.root,"outside-input-canary");f.write("outside-input-canary","NON_SECRET_OUTSIDE_INPUT_CANARY");
  const code=`import{readFileSync}from"node:fs";import{answer}from"./src/app.ts";if(answer!==42)process.exit(3);try{readFileSync(${JSON.stringify(canary)});process.exit(19);}catch(error){if(!["ENOENT","EACCES","EPERM"].includes(error.code))process.exit(20);}`;
  expect(verifyCommand(loadSettings(f.root),["bun","-e",code],"primary").verified).toBe(true);
 }finally{f.dispose();}
});

test("fixed-source checks cannot reach the controller host network",()=>{
 const f=fixture(),server=Bun.listen({hostname:"127.0.0.1",port:0,socket:{data(){}}});
 try{
  const code=`import{answer}from"./src/app.ts";if(answer!==42)process.exit(3);setTimeout(()=>process.exit(0),500);Bun.connect({hostname:"127.0.0.1",port:${server.port},socket:{open(socket){socket.end();process.exit(19);},data(){},error(){process.exit(0);}}}).catch(()=>process.exit(0));`;
  expect(verifyCommand(loadSettings(f.root),["bun","-e",code],"primary").verified).toBe(true);
 }finally{server.stop(true);f.dispose();}
});

test("a fixed-source check receives only the selected commit, not unrelated ancestor blobs",()=>{
 const f=fixture();try{
  f.write("src/retired.ts","NON_SECRET_OLD_COMMIT_CANARY");git(f.root,"add","src/retired.ts");git(f.root,"commit","-qm","test: seed historical canary");const before=git(f.root,"rev-parse","HEAD");
  git(f.root,"rm","src/retired.ts");git(f.root,"commit","-qm","test: remove historical canary");
  const code=`import{answer}from"./src/app.ts";if(answer!==42)process.exit(3);const result=Bun.spawnSync(["git","show",${JSON.stringify(before+":src/retired.ts")}],{stdout:"pipe",stderr:"pipe"});if(result.exitCode===0)process.exit(19);`;
  expect(verifyCommand(loadSettings(f.root),["bun","-e",code],"primary").verified).toBe(true);
 }finally{f.dispose();}
});


test("a check cannot plant a Git hook for a later host-side metadata read",()=>{
 const f=fixture();try{
  const canary=join(f.root,"host-only-canary"),marker=join(f.root,"host-only-marker"),hook=join(f.root,"host-fsmonitor");f.write("host-only-canary","NON_SECRET_HOST_GIT_CANARY");
  f.write("host-fsmonitor",`#!/usr/bin/env bun\nimport{readFileSync,writeFileSync}from"node:fs";writeFileSync(${JSON.stringify(marker)},readFileSync(${JSON.stringify(canary)}));process.stdout.write("token\\0/\\0");\n`);chmodSync(hook,0o700);
  const code=`import{appendFileSync}from"node:fs";appendFileSync(".git/config",${JSON.stringify("\n[core]\n fsmonitor = "+JSON.stringify(hook)+"\n")});`;
  let result;try{result=verifyCommand(loadSettings(f.root),["bun","-e",code],"primary");}catch{}
  expect(existsSync(marker)).toBe(false);expect(result?.verified).not.toBe(true);
 }finally{f.dispose();}
});

test("a new untracked source file cannot become fixed-commit check proof",()=>{
 for(const ignored of [false,true]){const f=fixture();try{
  if(ignored){f.write(".gitignore","src/injected.ts\n");git(f.root,"add",".gitignore");git(f.root,"commit","-qm","test: ignore generated source");}
  const result=verifyCommand(loadSettings(f.root),["bun","-e",'import{writeFileSync}from"node:fs";writeFileSync("src/injected.ts","export const injected=true;\\n");'],"primary");
  expect(result.verified).toBe(false);expect(existsSync(join(f.root,"src/injected.ts"))).toBe(false);
 }finally{f.dispose();}}
});


test("a check cannot unmount its read-only Git metadata",()=>{
 const f=fixture();try{
  const code='import{appendFileSync}from"node:fs";const unmount=Bun.spawnSync(["umount","/work/.git"],{stdout:"pipe",stderr:"pipe"});if(unmount.exitCode===0)process.exit(9);try{appendFileSync(".git/config","\\n[core]\\n fsmonitor=true\\n");process.exit(10);}catch(error){if(error.code!=="EROFS")process.exit(11);}';
  expect(verifyCommand(loadSettings(f.root),["bun","-e",code],"primary").verified).toBe(true);
 }finally{f.dispose();}
});
