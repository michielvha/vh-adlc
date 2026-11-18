import {test} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';

const enabled=process.env.REMOTE_GUI_VIEWER_E2E==='1';
// Playwright is an existing runtime-supplied dependency, as in the neighbouring browser fixtures.
type Runtime = typeof import('playwright-core');
const check=(condition:unknown,message:string):asserts condition=>{if(!condition)throw Error(message)};

for(const family of ['chromium','firefox'] as const)test.skipIf(!enabled||(family==='firefox'&&!process.env.REMOTE_GUI_FIREFOX))(`adaptive real noVNC viewport: ${family}`,async()=>{
 const runtime=createRequire(import.meta.url)(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE!) as Runtime;
 const root=mkdtempSync(join(tmpdir(),'rg-viewport-'));
 const cli=(...args:string[])=>{
  const result=Bun.spawnSync([process.env.REMOTE_GUI_TEST_BINARY!,...args,'--home',root,'--transport','loopback'],{env:process.env});
  const value=JSON.parse(result.stdout.toString());
  check(result.exitCode===0,'CLI '+args[0]+' failed: '+String(value.diagnostic||value.state));return value;
 };
 let session:ReturnType<typeof cli>|undefined;let browser:Awaited<ReturnType<Runtime['chromium']['launch']>>|undefined;
 try{
  session=cli('start','--ttl','8m');const access=cli('access',session.id,'--reveal');
  browser=await runtime[family].launch(family==='chromium'?{executablePath:process.env.REMOTE_GUI_CHROMIUM,headless:true,chromiumSandbox:true,args:['--disable-gpu']}:{executablePath:process.env.REMOTE_GUI_FIREFOX,headless:true});
  const context=await browser.newContext({viewport:{width:900,height:1000},httpCredentials:{username:'viewer',password:access.access_code,origin:new URL(session.url).origin}});
  const page=await context.newPage();await page.goto(session.url);await page.getByRole('link',{name:'Open session'}).click();
  await page.locator('#status').filter({hasText:'Shared browser connected'}).waitFor({timeout:15000});
  if(process.env.REMOTE_GUI_VIEWPORT_BACKEND_PROBE==='1') {
   const response=await page.evaluate(async()=>{const viewer_id=crypto.randomUUID().replaceAll('-','');for(let sequence=1;sequence<=5;sequence++){const reply=await fetch('/__remote_gui/viewport',{method:'POST',headers:{'Content-Type':'application/json','X-Remote-Gui-Viewport':'1'},body:JSON.stringify({viewer_id,sequence,claim:sequence===1,width:900,height:968})});if(reply.status!==409)return {status:reply.status,data:await reply.json()};await new Promise(resolve=>setTimeout(resolve,500))}return {status:409,data:{error:'busy'}}});
   check(response.status===200,'native resize API failed: '+JSON.stringify(response));
  }
  await page.waitForFunction(()=>{const c=document.querySelector('canvas');return c?.width===900&&c.height===968},null,{timeout:7000});
  check(cli('status',session.id).state==='ready','sizing broke browser session');
 }finally{
  if(browser)await browser.close();let safe=true;
  if(session){try{let stopped=cli('stop',session.id);for(let i=0;i<100&&['stopping','cleanup-pending'].includes(stopped.state);i++){await Bun.sleep(100);stopped=cli('status',session.id)}safe=['stopped','failed'].includes(stopped.state)}catch{safe=false}}
  if(safe)rmSync(root,{recursive:true,force:true});else throw Error('owned viewport fixture cleanup pending; records retained');
 }
},120000);
