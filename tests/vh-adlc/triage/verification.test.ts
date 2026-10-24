import{test}from"./boundary-test";
import{expect}from"bun:test";
import{readFileSync,existsSync}from"node:fs";
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
    const pidFile=join(f.root,"owned-child.pid"),code=`const child=Bun.spawn(["/usr/bin/sleep","60"],{stdout:"ignore",stderr:"ignore"});await Bun.write(${JSON.stringify(pidFile)},String(child.pid));process.exit(0);`;
    const result=verifyCommand(loadSettings(f.root),["bun","-e",code],"primary");expect(result.verified).toBe(true);
    const pid=Number(readFileSync(pidFile,"utf8")),stat=`/proc/${pid}/stat`;
    // A dead descendant can briefly remain as an init-owned zombie before reaping.
    expect(!existsSync(stat)||readFileSync(stat,"utf8").split(" ")[2]==="Z").toBe(true);
  }finally{f.dispose();}
});

test("ordinary helper calls outside a boundary remain attestations",()=>{
 const f=fixture();try{
  const code=`import{loadSettings}from ${JSON.stringify(join(import.meta.dir,"../../../plugins/vh-adlc/scripts/triage/settings.ts"))};import{inspectSources,observedVerification}from ${JSON.stringify(join(import.meta.dir,"../../../plugins/vh-adlc/scripts/triage/verification.ts"))};const config=loadSettings(${JSON.stringify(f.root)}),receipt=inspectSources(config,["src/app.ts"],"primary").receipt;console.log(Boolean(observedVerification(config,${JSON.stringify(git(f.root,"rev-parse","HEAD"))},receipt)));`;
  const run=Bun.spawnSync(["bun","-e",code],{stdout:"pipe",stderr:"pipe"});expect(run.exitCode).toBe(0);expect(run.stdout.toString().trim()).toBe("false");
 }finally{f.dispose();}
});
