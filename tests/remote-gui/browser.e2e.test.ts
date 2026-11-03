import {test} from 'bun:test';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';

const enabled=process.env.REMOTE_GUI_VIEWER_E2E==='1';
const check=(condition:unknown,message:string)=>{if(!condition)throw Error(message)};

test.skipIf(!enabled)('real noVNC keyboard input survives exact-browser reattachment',async()=>{
 const require=createRequire(import.meta.url);
 const {chromium}=require(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE!);
 const root=mkdtempSync(join(tmpdir(),'rg-viewer-'));
 const binary=process.env.REMOTE_GUI_TEST_BINARY!;
 const sessions:any[]=[];
 let viewer:any;
 let agent:any;
 const cli=(...args:string[])=>{
  const result=Bun.spawnSync([binary,...args,'--home',root,'--transport','loopback'],{env:process.env});
  check(result.exitCode===0,'runtime command failed: '+args[0]);
  return JSON.parse(result.stdout.toString());
 };
 try{
  const first=cli('start','--ttl','2m');sessions.push(first);
  const second=cli('start','--ttl','2m');sessions.push(second);
  check(first.id!==second.id && first.url!==second.url && first.local_cdp!==second.local_cdp,'browser sessions reused identity');
  agent=await chromium.connectOverCDP(first.local_cdp,{timeout:10000});
  const marker=(await Promise.all(agent.contexts()[0].pages().map(async(p:any)=>({p,title:await p.title()})))).find((x:any)=>x.title===first.marker)?.p;
  check(marker,'agent could not find original marker');
  await marker.bringToFront();
  await marker.getByLabel('Connection check').focus();
  await agent.close();agent=undefined;
  viewer=await chromium.launch({executablePath:process.env.REMOTE_GUI_CHROMIUM,headless:true,chromiumSandbox:true,args:['--disable-gpu']});
  const access=cli('access',first.id,'--reveal');
  const context=await viewer.newContext({viewport:{width:1500,height:1000},httpCredentials:{username:'viewer',password:access.access_code,origin:new URL(first.url).origin}}).catch(()=>{throw Error('fresh native-auth browser context unavailable')});
  const page=await context.newPage();
  const failedAssets:string[]=[];
  page.on('response',(response:any)=>{const path=new URL(response.url()).pathname;if(response.status()>=400)failedAssets.push(path+':'+response.status())});
  await page.goto(first.url,{waitUntil:'domcontentloaded'});
  await page.getByRole('link',{name:'Open session'}).click();
  try{await page.locator('#status').filter({hasText:'Shared browser connected'}).waitFor({timeout:15000})}catch{throw Error('viewer connection failed: '+(await page.locator('#status').count()?await page.locator('#status').textContent():await page.locator('body').innerText())+'; routes '+failedAssets.join(','))}
  const canvas=page.locator('canvas');await canvas.waitFor({state:'visible'});
  check(await canvas.evaluate((node:HTMLCanvasElement)=>node.width>0&&node.height>0),'viewer did not render a canvas');
  await canvas.focus();
  const input='viewer-'+crypto.randomUUID();
  await page.keyboard.type(input,{delay:40});
  agent=await chromium.connectOverCDP(first.local_cdp,{timeout:10000});
  const resumed=(await Promise.all(agent.contexts()[0].pages().map(async(p:any)=>({p,title:await p.title()})))).find((x:any)=>x.title===first.marker)?.p;
  check(resumed,'original marker absent after reattachment');
  check(await resumed.getByLabel('Connection check').inputValue()===input,'viewer input did not reach exact browser');
  await agent.close();agent=undefined;
  cli('stop',second.id);
  check(!existsSync(join(root,second.id,'profile')),'stopped browser profile survived');
  check(cli('status',first.id).state==='ready','stopping another browser broke this session');
  agent=await chromium.connectOverCDP(first.local_cdp,{timeout:10000});
  check((await Promise.all(agent.contexts()[0].pages().map((p:any)=>p.title()))).includes(first.marker),'surviving session marker lost');
 }finally{
  if(agent)await agent.close();if(viewer)await viewer.close();
  let safe=true;
  for(const session of sessions){try{const stopped=cli('stop',session.id);if(stopped.state==='cleanup-pending')safe=false}catch{safe=false}}
  if(safe)rmSync(root,{recursive:true,force:true});
  else throw Error('owned browser cleanup pending; private test records retained');
 }
},120000);
