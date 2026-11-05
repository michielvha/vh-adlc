import {test} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';

const check=(condition:unknown,message:string)=>{if(!condition)throw Error(message)};
const enabled=process.env.REMOTE_GUI_VIEWER_E2E==='1';

for(const family of ['chromium','firefox'])test.skipIf(!enabled)(`native authentication stays on its origin: ${family}`,async()=>{
 const runtime=createRequire(import.meta.url)(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE!);
 const home=mkdtempSync(join(tmpdir(),'rg-origin-'));
 let browser:any;let share:any;
 let foreignBinding=false,foreignAuthorization=false,challengeReached=false,upstreamAuthorization=false;
 const cli=async(...args:string[])=>{
  const child=Bun.spawn([process.env.REMOTE_GUI_TEST_BINARY!,...args,'--home',home,'--transport','loopback'],{env:process.env,stdout:'pipe',stderr:'pipe'});
  const [exit,out]=await Promise.all([child.exited,new Response(child.stdout).text()]);
  check(exit===0,'runtime command failed: '+args[0]);return JSON.parse(out);
 };
 const app=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
  upstreamAuthorization ||= request.headers.has('authorization');
  const path=new URL(request.url).pathname;
  if(path==='/json/version'||path==='/__remote_gui/login')return new Response('absent',{status:404});
  if(path==='/worker.js')return new Response("self.addEventListener('fetch',()=>{});",{headers:{'content-type':'application/javascript','service-worker-allowed':'/'}});
  return new Response('<!doctype html><title>Origin fixture</title><h1>Authorized app</h1>',{headers:{'content-type':'text/html'}});
 }});
 const foreign=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
  foreignBinding ||= (request.headers.get('cookie')||'').includes('__remote_gui_');
  foreignAuthorization ||= request.headers.has('authorization');
  if(new URL(request.url).pathname==='/worker.js')return new Response('/* disposable worker capability check */',{headers:{'content-type':'application/javascript','service-worker-allowed':'/'}});
  if(new URL(request.url).pathname==='/challenge'){
   challengeReached=true;
   return new Response('foreign',{status:401,headers:{'www-authenticate':`Basic realm="remote-gui-${share.id}", charset="UTF-8"`}});
  }
  return new Response('unmanaged handler');
 }});
 try{
  share=await cli('share',`http://127.0.0.1:${app.port}/app`,'--ttl','1m');
  const access=await cli('access',share.id,'--reveal');
  browser=await runtime[family].launch(family==='chromium'?{executablePath:process.env.REMOTE_GUI_CHROMIUM,headless:true,chromiumSandbox:true,args:['--disable-gpu']}:{executablePath:process.env.REMOTE_GUI_FIREFOX,headless:true});
  const control=await browser.newContext();
  const controlPage=await control.newPage();
  await controlPage.goto(`http://127.0.0.1:${foreign.port}/`);
  const workersAvailable=await controlPage.evaluate(async()=>{const registration=await navigator.serviceWorker.register('/worker.js',{scope:'/'});return await registration.unregister()});
  check(workersAvailable,'browser worker capability is unavailable; cannot verify CSP enforcement');
  await control.close();
  const context=await browser.newContext({httpCredentials:{username:'viewer',password:access.access_code,origin:new URL(share.url).origin}}).catch(()=>{throw Error('fresh native-auth browser context unavailable; check the matching installed driver and browser')});
  const page=await context.newPage();
  await page.goto(share.url);
  check(await page.locator('input[type=password]').count()===0,'initial page asks for a code in page content');
  await page.getByRole('link',{name:'Open session'}).click();
  await page.getByRole('heading',{name:'Authorized app'}).waitFor();
  check(!upstreamAuthorization,'native proxy proof reached application');
  const workerBlocked=await page.evaluate(async()=>{try{await navigator.serviceWorker.register('/worker.js',{scope:'/'});return false}catch{return true}});
  check(workerBlocked,'shared app registered a persistent worker');
  const binding=(await context.cookies()).find((cookie:any)=>cookie.name==='__remote_gui_'+share.id);
  check(binding&&binding.httpOnly&&binding.sameSite==='Strict','client binding flags missing');
  await page.goto(`http://127.0.0.1:${foreign.port}/`);
  check(foreignBinding,'foreign fixture did not exercise cookie port sharing');
  check(!foreignAuthorization,'HTTP credential escaped to unmanaged port');
  try{await page.goto(`http://127.0.0.1:${foreign.port}/challenge`,{timeout:5000})}catch{}
  check(challengeReached&&!foreignAuthorization,'copied realm obtained the protected origin credential');
  const replay=await fetch(share.url,{headers:{Cookie:`${binding.name}=${binding.value}`}});
  check(replay.status===401,'binding-only replay authenticated');
  const credentialOnly=await fetch(share.url,{headers:{Authorization:'Basic '+Buffer.from('viewer:'+access.access_code).toString('base64')}});
  check(credentialOnly.status===401,'native credential alone authenticated');
  const enrollAgain=await fetch(new URL('/?__remote_gui_enroll=1',share.url),{headers:{Authorization:'Basic '+Buffer.from('viewer:'+access.access_code).toString('base64')},redirect:'manual'});
  check(enrollAgain.status===401,'redeemed code enrolled another client');
  await cli('stop',share.id);
  check((await fetch(`http://127.0.0.1:${app.port}/app`)).ok,'session stop killed upstream');
  let afterStop:Response|null=null;try{afterStop=await fetch(share.url,{headers:{Cookie:`${binding.name}=${binding.value}`,Authorization:'Basic '+Buffer.from('viewer:'+access.access_code).toString('base64')}})}catch{}
  check(!afterStop||afterStop.status!==200,'stopped proof pair still authenticated');
 }finally{
  if(browser)await browser.close();let safe=true;
  if(share){try{safe=(await cli('stop',share.id)).state!=='cleanup-pending'}catch{safe=false}}
  app.stop(true);foreign.stop(true);
  if(safe)rmSync(home,{recursive:true,force:true});else throw Error('private origin test records retained for cleanup');
 }
},90000);
