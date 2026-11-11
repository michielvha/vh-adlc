import {test} from 'bun:test';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';

const check=(condition:unknown,message:string)=>{if(!condition)throw Error(message)};

test.skipIf(process.env.REMOTE_GUI_VIEWER_E2E!=='1')('browser verifies shared app assets, redirects, cookies and WebSocket isolation',async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE!);
 const home=mkdtempSync(join(tmpdir(),'rg-service-browser-'));
 const shares:any[]=[];const apps:any[]=[];
 let browser:any;let leaked=false;
 const cli=async(...args:string[])=>{
  const child=Bun.spawn([process.env.REMOTE_GUI_TEST_BINARY!,...args,'--home',home,'--transport','loopback'],{stdout:'pipe',stderr:'pipe',env:process.env});
  const [exit,stdout]=await Promise.all([child.exited,new Response(child.stdout).text()]);
  check(exit===0,'runtime command failed: '+args[0]);return JSON.parse(stdout);
 };
 const app=(name:string)=>Bun.serve({hostname:'127.0.0.1',port:0,
  fetch(request,server){
   const path=new URL(request.url).pathname;const cookie=request.headers.get('cookie')||'';
   if(cookie.includes('__remote_gui_')||cookie.includes('browser_raw_canary')||request.headers.has('authorization'))leaked=true;
   if(path==='/ws'){check(cookie===`app=${name}`,'WebSocket app jar missing or mixed');if(server.upgrade(request))return;return new Response(null,{status:400})}
   if(path==='/set')return new Response('set',{headers:{'set-cookie':`app=${name}; Path=/; HttpOnly`}});
   if(path==='/redirect')return new Response(null,{status:303,headers:{location:`http://127.0.0.1:${server.port}/read`}});
   if(path==='/read')return new Response(cookie===`app=${name}`?'jar-ok':'jar-missing');
   if(path==='/assets/style.css')return new Response('body{font-family:system-ui}',{headers:{'content-type':'text/css'}});
   if(path==='/assets/app.js')return new Response(`await fetch('/set');document.getElementById('cookie').textContent=await (await fetch('/redirect')).text();const socket=new WebSocket('ws://'+location.host+'/ws');socket.onopen=()=>socket.send('harmless-echo');socket.onmessage=event=>document.getElementById('ws').textContent=event.data;`,{headers:{'content-type':'application/javascript'}});
   if(path==='/__remote_gui/login'||path==='/json/version')return new Response('absent',{status:404});
   return new Response('<!doctype html><title>Disposable shared app</title><link rel="stylesheet" href="/assets/style.css"><p id="cookie"></p><p id="ws"></p><script type="module" src="/assets/app.js"></script>',{headers:{'content-type':'text/html'}});
  },websocket:{message(socket,message){socket.send(message)}}});
 try{
  apps.push(app('one'),app('two'));
  for(const source of apps)shares.push(await cli('share',`http://127.0.0.1:${source.port}/nested?private=synthetic-query`,'--ttl','2m'));
  browser=await chromium.launch({executablePath:process.env.REMOTE_GUI_CHROMIUM,headless:true,chromiumSandbox:true,args:['--disable-gpu']});
  for(const share of shares){
   check(share.local_cdp===undefined&&!existsSync(join(home,share.id,'profile')),'service share started GUI resources');
   const access=await cli('access',share.id,'--reveal');
   const context=await browser.newContext({httpCredentials:{username:'viewer',password:access.access_code,origin:new URL(share.url).origin}}).catch(()=>{throw Error('fresh native-auth browser context unavailable')});
   await context.addCookies([{name:'browser_raw_canary',value:'synthetic',url:share.url}]);
   const page=await context.newPage();
   await page.goto(access.url);await page.getByRole('link',{name:'Open session'}).click();
   await page.locator('#cookie').filter({hasText:'jar-ok'}).waitFor({timeout:10000});
   await page.locator('#ws').filter({hasText:'harmless-echo'}).waitFor({timeout:10000});
   check(await page.evaluate(()=>!document.cookie.includes('app=')),'upstream cookie leaked into browser scope');
   await page.close();
  }
  check(!leaked,'raw browser or proxy cookies reached upstream');
  await cli('stop',shares[0].id);
  check((await cli('status',shares[1].id)).state==='ready','another share was stopped');
  for(const source of apps){const response=await fetch(`http://127.0.0.1:${source.port}/nested`);check(response.ok,'stopping share stopped the app')}
 }finally{
  if(browser)await browser.close();let safe=true;
  for(const share of shares){try{if((await cli('stop',share.id)).state==='cleanup-pending')safe=false}catch{safe=false}}
  for(const source of apps)source.stop(true);
  if(safe)rmSync(home,{recursive:true,force:true});else throw Error('private service cleanup records retained');
 }
},90000);
