import {test} from 'bun:test';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {startViewportPage} from './fixtures/viewport-page';

type Runtime=typeof import('playwright-core');
type View={id:string;state:string;schema_version:number;url?:string;local_cdp?:string;access_code?:string};
function check(value:unknown,message:string):asserts value {if(!value)throw Error(message)}
function object(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value)}
const enabled=process.env.REMOTE_GUI_VIEWER_E2E==='1';
const baseline='4d7f8238ecabde6cd8693c5d16f3214f1fb142c6';

test.skipIf(!enabled)('new CLI preserves a fixed-size 0.3.0 supervisor and its record',async()=>{
 const runtime=createRequire(import.meta.url)(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE!) as Runtime;
 const root=mkdtempSync(join(tmpdir(),'rg-legacy-')),home=join(root,'sessions');
 const env={...process.env,REMOTE_GUI_BUILD_CACHE:join(root,'builds'),REMOTE_GUI_PROFILE_HOME:join(root,'profiles')};
 const current=[process.env.REMOTE_GUI_TEST_BINARY!];
 const oldSource=join(root,'source'),archive=join(root,'baseline.tar');mkdirSync(oldSource,{mode:0o700});
 const old=['/usr/bin/bash',join(oldSource,'plugins/remote-gui/scripts/remote-gui.sh')];
 const fixture=startViewportPage();
 let browser:Awaited<ReturnType<Runtime['chromium']['launch']>>|undefined;
 let agent:Awaited<ReturnType<Runtime['chromium']['connectOverCDP']>>|undefined;
 const cli=(prefix:string[],...args:string[]):View=>{
  const run=Bun.spawnSync([...prefix,...args,'--home',home,'--transport','loopback'],{env});
  const value:unknown=JSON.parse(run.stdout.toString());
  check(object(value)&&typeof value.id==='string'&&/^[a-f0-9]{32}$/.test(value.id)&&typeof value.state==='string'&&value.schema_version===1,'invalid synthetic CLI response');
  for(const key of ['url','local_cdp','access_code'])check(value[key]===undefined||typeof value[key]==='string','invalid synthetic CLI field');
  check(run.exitCode===0,'synthetic CLI '+args[0]+' failed');return value as View;
 };
 const record=(id:string):Record<string,unknown>=>{const value:unknown=JSON.parse(readFileSync(join(home,id,'state.json'),'utf8'));check(object(value)&&value.version===1,'old record schema changed');return value};
 try{
  const archived=Bun.spawnSync(['git','archive','--format=tar','--output='+archive,baseline,'plugins/remote-gui'],{cwd:resolve(import.meta.dir,'../..')});
  check(archived.exitCode===0,'immutable 0.3.0 source unavailable; fetch repository history');
  check(Bun.spawnSync(['tar','-xf',archive,'-C',oldSource]).exitCode===0,'old package extraction failed');
  check(JSON.parse(readFileSync(join(oldSource,'plugins/remote-gui/plugin.json'),'utf8')).version==='0.3.0','baseline is not the old plugin');
  const built=Bun.spawnSync([...old,'help'],{cwd:root,env});check(built.exitCode===0,'independent old package build failed');
  const legacy=cli(old,'start','--ttl','4m','--browser-mode','agent');check(legacy.local_cdp&&legacy.url,'old browser did not start');
  agent=await runtime.chromium.connectOverCDP(legacy.local_cdp);const app=await agent.contexts()[0].newPage();await app.goto(fixture.url+'?tab=a');await app.getByLabel('Saved text').fill('legacy-form');await agent.close();agent=undefined;
  const access=cli(current,'access',legacy.id,'--reveal');check(access.access_code,'new CLI cannot access old supervisor');
  const before=record(legacy.id),keys=Object.keys(before).sort().join(','),supervisor=JSON.stringify(before.supervisor);
  browser=await runtime.chromium.launch({executablePath:process.env.REMOTE_GUI_CHROMIUM,headless:true,chromiumSandbox:true,args:['--disable-gpu']});
  const context=await browser.newContext({viewport:{width:390,height:844},httpCredentials:{username:'viewer',password:access.access_code,origin:new URL(legacy.url).origin}});
  const page=await context.newPage();await page.goto(legacy.url);await page.getByRole('link',{name:'Open session'}).click();await page.waitForFunction(()=>{const c=document.querySelector('canvas');return c?.width===1440&&c.height===900});
  await page.setViewportSize({width:900,height:1000});await page.locator('canvas').focus();await page.keyboard.press('Control+a');await page.keyboard.type('through-old-viewer');
  const until=async(proof:()=>boolean,message:string)=>{const end=Date.now()+10000;while(Date.now()<end){if(proof())return;await Bun.sleep(80)}throw Error(message)};
  await until(()=>fixture.metrics.get('a')?.value==='through-old-viewer','old viewer lost exact-browser input');
  const fresh=cli(current,'start','--ttl','4m','--browser-mode','human');check(fresh.url&&!fresh.local_cdp,'new human session did not start');const freshAccess=cli(current,'access',fresh.id,'--reveal');check(freshAccess.access_code,'new viewer access unavailable');
  const freshContext=await browser.newContext({viewport:{width:900,height:1000},httpCredentials:{username:'viewer',password:freshAccess.access_code,origin:new URL(fresh.url).origin}});const freshPage=await freshContext.newPage();await freshPage.goto(fresh.url);await freshPage.getByRole('link',{name:'Open session'}).click();await freshPage.waitForFunction(()=>{const c=document.querySelector('canvas');return c?.width===900&&c.height===968});
  check(await page.locator('canvas').evaluate(c=>c instanceof HTMLCanvasElement&&c.width===1440&&c.height===900),'old supervisor changed resolution');
  check(cli(current,'status',legacy.id).state==='ready','new CLI cannot read old status');const after=record(legacy.id);check(Object.keys(after).sort().join(',')===keys&&JSON.stringify(after.supervisor)===supervisor,'new CLI migrated or restarted the old supervisor');
  await page.bringToFront();await page.locator('canvas').focus();await page.keyboard.press('Control+a');await page.keyboard.type('still-old');await until(()=>fixture.metrics.get('a')?.value==='still-old','new session disrupted the old viewer');
  check(cli(current,'stop',legacy.id).state==='stopped','new CLI cannot stop the old supervisor');
 }finally{
  if(agent)await agent.close();if(browser)await browser.close();let safe=true;
  if(existsSync(home))for(const id of readdirSync(home).filter(name=>/^[a-f0-9]{32}$/.test(name))){
   try{let view=cli(current,'stop',id);for(let i=0;i<100&&['stopping','cleanup-pending'].includes(view.state);i++){await Bun.sleep(100);view=cli(current,'status',id)}safe=safe&&['stopped','failed'].includes(view.state)}catch{safe=false}
  }
  fixture.close();if(safe)rmSync(root,{recursive:true,force:true});else throw Error('owned legacy fixture cleanup pending; records retained');
 }
},180000);
