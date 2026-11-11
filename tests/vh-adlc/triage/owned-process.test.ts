import{test,expect}from"bun:test";
import{mkdtempSync,readFileSync,rmSync}from"node:fs";
import{join}from"node:path";
import{runOwnedClient}from"../../../plugins/vh-adlc/scripts/triage/owned-process";

test("a client ignoring termination is killed within the controller cap",async()=>{
 const root=mkdtempSync("/tmp/triage-owned-timeout-");
 try{
  const result=await runOwnedClient([process.execPath,"-e",'process.on("SIGTERM",()=>{});setInterval(()=>{},1000);'],{cwd:root,env:{PATH:process.env.PATH??"/usr/bin"},stdout:join(root,"out"),stderr:join(root,"error")},{timeout_ms:150,grace_ms:50,reap_ms:1000});
  expect(result.timed_out).toBe(true);expect(result.reaped).toBe(true);expect(result.signals).toContainEqual({signal:"SIGKILL",accepted:true});expect(result.exit_code).not.toBe(0);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("normal client exit also kills stubborn descendants in its owned group",async()=>{
 const root=mkdtempSync("/tmp/triage-owned-descendant-"),ready=join(root,"ready"),pid=join(root,"pid");
 const grandchild=`import{writeFileSync}from"node:fs";process.on("SIGTERM",()=>{});writeFileSync(${JSON.stringify(ready)},"ready");setInterval(()=>{},1000);`;
 const parent=`import{spawn}from"node:child_process";import{writeFileSync,existsSync}from"node:fs";const child=spawn(process.execPath,["-e",${JSON.stringify(grandchild)}],{stdio:"ignore"});child.unref();writeFileSync(${JSON.stringify(pid)},String(child.pid));const timer=setInterval(()=>{if(existsSync(${JSON.stringify(ready)})){clearInterval(timer);process.exit(0);}},5);`;
 try{
  const result=await runOwnedClient([process.execPath,"-e",parent],{cwd:root,env:{PATH:process.env.PATH??"/usr/bin"},stdout:join(root,"out"),stderr:join(root,"error")},{timeout_ms:2000,grace_ms:50,reap_ms:1000});
  expect(result.timed_out).toBe(false);expect(result.exit_code).toBe(0);expect(result.signals).toContainEqual({signal:"SIGKILL",accepted:true});
  const child=Number(readFileSync(pid,"utf8"));let running=false;
  for(let attempt=0;attempt<30;attempt++){try{running=readFileSync(`/proc/${child}/stat`,"utf8").split(") ")[1][0]!=="Z";}catch{running=false;}if(!running)break;await Bun.sleep(10);}
  expect(running).toBe(false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
