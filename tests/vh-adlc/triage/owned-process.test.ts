import{test,expect}from"bun:test";
import{existsSync,mkdtempSync,readFileSync,rmSync}from"node:fs";
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


test("shared client memory capture is bounded and never writes raw output files", async () => {
  const root = mkdtempSync("/tmp/triage-owned-memory-");
  try {
    const stdout = join(root, "stdout"), stderr = join(root, "stderr");
    const result = await runOwnedClient([process.execPath, "-e", 'process.stdout.write("body-canary"); process.stderr.write("header-canary");'],
      { cwd: root, env: { PATH: process.env.PATH ?? "/usr/bin" }, stdout, stderr, capture: "memory", maxOutputBytes: 1024 },
      { timeout_ms: 2000, grace_ms: 50, reap_ms: 1000 });
    expect(existsSync(stdout)).toBe(false);
    expect(existsSync(stderr)).toBe(false);
    expect(Buffer.from(result.captured!.stdout).toString()).toBe("body-canary");
    expect(Buffer.from(result.captured!.stderr).toString()).toBe("header-canary");
    expect(result).toMatchObject({ exit_code: 0, confirmed: true, output_limit: false, cancelled: null });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("shared client startup cancellation returns a confirmed cancelled result", async () => {
  const root = mkdtempSync("/tmp/triage-owned-startup-cancel-"), began = Date.now();
  try {
    const result = await runOwnedClient(["/bin/sleep", "10"],
      { cwd: root, env: { PATH: "/usr/bin:/bin" }, stdout: join(root, "stdout"), stderr: join(root, "stderr"), started: () => false },
      { timeout_ms: 4000, grace_ms: 50, reap_ms: 1000 });
    expect(result).toMatchObject({ cancelled: "startup-capture", timed_out: false, confirmed: true });
    expect(Date.now() - began).toBeLessThan(2000);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("shared memory capture bounds the combined streams", async () => {
  const root = mkdtempSync("/tmp/triage-owned-overflow-");
  try {
    const stdout = join(root, "stdout"), stderr = join(root, "stderr");
    const result = await runOwnedClient([process.execPath, "-e", 'process.stdout.write("a".repeat(768)); process.stderr.write("b".repeat(768));'],
      { cwd: root, env: { PATH: "/usr/bin:/bin" }, stdout, stderr, capture: "memory", maxOutputBytes: 1024 },
      { timeout_ms: 2000, grace_ms: 50, reap_ms: 1000 });
    expect(result).toMatchObject({ output_limit: true, reaped: true, confirmed: true });
    expect((result.captured?.stdout.byteLength ?? 0) + (result.captured?.stderr.byteLength ?? 0)).toBeLessThanOrEqual(1024);
    expect(existsSync(stdout) || existsSync(stderr)).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("shared output monitoring stops an overflowing watched file before timeout", async () => {
  const root = mkdtempSync("/tmp/triage-owned-watched-");
  try {
    const result = await runOwnedClient([process.execPath, "-e", 'require("node:fs").writeFileSync("watched", "x".repeat(4096)); setInterval(() => {}, 1000);'],
      { cwd: root, env: { PATH: "/usr/bin:/bin" }, stdout: join(root, "stdout"), stderr: join(root, "stderr"),
        watchedOutputs: [join(root, "watched")], maxOutputBytes: 1024 },
      { timeout_ms: 4000, grace_ms: 50, reap_ms: 1000 });
    expect(result).toMatchObject({ output_limit: true, timed_out: false, reaped: true, confirmed: true });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("shared cancellation stops the owned process and its future output", async () => {
  const root = mkdtempSync("/tmp/triage-owned-aborted-"), cancellation = new AbortController();
  try {
    const result = await runOwnedClient([process.execPath, "-e", 'setTimeout(() => require("node:fs").writeFileSync("late", "late"), 500); setInterval(() => {}, 1000);'],
      { cwd: root, env: { PATH: "/usr/bin:/bin" }, stdout: join(root, "stdout"), stderr: join(root, "stderr"),
        signal: cancellation.signal, started: () => cancellation.abort("SIGTERM") },
      { timeout_ms: 4000, grace_ms: 50, reap_ms: 1000 });
    expect(result).toMatchObject({ cancelled: "SIGTERM", timed_out: false, confirmed: true });
    await Bun.sleep(600);
    expect(existsSync(join(root, "late"))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("completion requires the expected exit and complete cleanup observations", async () => {
  const { ownedClientCompleted } = await import("../../../plugins/vh-adlc/scripts/triage/owned-process");
  const complete = { exit_code: 0, reaped: true, timed_out: false, cancelled: null, output_limit: false,
    confirmed: true, group_absent: true, survivors: [], boundary: "marker" };
  expect(ownedClientCompleted(complete)).toBe(true);
  expect(ownedClientCompleted({ ...complete, exit_code: 1 }, 1)).toBe(true);
  for (const invalid of [null, [], {}]) expect(ownedClientCompleted(invalid)).toBe(false);
  for (const changed of [{ exit_code: 1 }, { reaped: false }, { timed_out: true }, { cancelled: "SIGINT" },
    { output_limit: true }, { confirmed: false }, { group_absent: false }, { survivors: [123] }, { boundary: "unknown" }]) {
    expect(ownedClientCompleted({ ...complete, ...changed })).toBe(false);
  }
});
