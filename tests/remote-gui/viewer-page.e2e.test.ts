import {test} from 'bun:test';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';

// Viewer page tests: the page comes from a real proxy, while noVNC and the
// clipboard routes are stubs, so each panel behavior can be driven directly.
const enabled=process.env.REMOTE_GUI_VIEWER_E2E==='1';
const check=(condition:unknown,message:string)=>{if(!condition)throw Error(message)};

type Reply={status:number;error?:string};
type Recorded={method:string;query:string;header:string|null;site:string|null;contentType:string|null;body:string};

async function stopBrowser(cli:(...args:string[])=>Record<string,unknown>,id:string){
 let stopped=cli('stop',id);
 const deadline=Date.now()+10000;
 while(['stopping','cleanup-pending'].includes(String(stopped.state))&&Date.now()<deadline){await Bun.sleep(100);stopped=cli('status',id)}
 check(['stopped','failed'].includes(String(stopped.state)),'owned browser cleanup incomplete: '+String(stopped.state));
}

let pageSource:Promise<string>|undefined;
// Fetch the viewer page from a scratch loopback session of the built binary.
function viewerPage(){
 pageSource??=(async()=>{
  const root=mkdtempSync(join(tmpdir(),'rg-viewer-page-'));
  const cli=(...args:string[])=>{
   const result=Bun.spawnSync([process.env.REMOTE_GUI_TEST_BINARY!,...args,'--home',root,'--transport','loopback'],{env:process.env});
   check(result.exitCode===0,'runtime command failed: '+args[0]);
   return JSON.parse(result.stdout.toString()) as Record<string,unknown>;
  };
  let id='';
  try{
   const session=cli('start','--ttl','1m');id=String(session.id);
   const access=cli('access',id,'--reveal');
   const origin=new URL(String(session.url)).origin;
   const authorization='Basic '+btoa('viewer:'+String(access.access_code));
   const enrolled=await fetch(origin+'/?__remote_gui_enroll=1',{headers:{Authorization:authorization,Origin:origin},redirect:'manual'});
   const cookie=(enrolled.headers.get('set-cookie')||'').split(';')[0];
   check(enrolled.status===303&&cookie,'scratch viewer enrollment failed');
   const page=await fetch(String(session.url),{headers:{Authorization:authorization,Cookie:cookie}});
   check(page.ok,'viewer page unavailable: '+page.status);
   return await page.text();
  }finally{
   if(id){await stopBrowser(cli,id);check(!existsSync(join(root,id,'profile')),'scratch browser profile survived')}
   rmSync(root,{recursive:true,force:true});
  }
 })();
 return pageSource;
}

const rfbStub=`export default class RFB extends EventTarget{
 constructor(target){super();this.focusCalls=0;this.keys=[];
  this.canvas=document.createElement('canvas');this.canvas.tabIndex=0;this.canvas.width=20;this.canvas.height=20;
  this.canvas.addEventListener('keydown',event=>this.keys.push(event.key));
  target.appendChild(this.canvas);window.__rfb=this}
 focus(){this.focusCalls++;this.canvas.focus()}
 disconnect(){}
}`;

// Record clipboard API use, and whether each write happens while a click is being dispatched.
const clipboardRecorder=`(()=>{
 const calls=[];window.__clipboardCalls=calls;
 const stub={
  readText(){calls.push({op:'readText'});return Promise.resolve('')},
  writeText(text){calls.push({op:'writeText',text,inClick:window.event?.type==='click'});return window.__writeRejects?Promise.reject(new Error('blocked')):Promise.resolve()},
 };
 Object.defineProperty(Navigator.prototype,'clipboard',{get(){return stub},configurable:true});
})();`;

for(const family of ['chromium','firefox'] as const)test.skipIf(!enabled||(family==='firefox'&&!process.env.REMOTE_GUI_FIREFOX))(`viewer clipboard panel: ${family}`,async()=>{
 const html=await viewerPage();
 const state={mode:'human',remote:'',post:{status:200} as Reply,get:{status:200} as Reply,del:{status:200} as Reply,requests:[] as Recorded[]};
 const json=(status:number,body:Record<string,string>)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/'||url.pathname==='/vnc.html')return new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
  if(url.pathname==='/core/rfb.js')return new Response(rfbStub,{headers:{'content-type':'text/javascript'}});
  if(url.pathname==='/__remote_gui/viewer-access')return json(200,{password:'stub-password'});
  if(url.pathname!=='/__remote_gui/clipboard')return new Response('absent',{status:404});
  const body=request.method==='POST'?await request.text():'';
  state.requests.push({method:request.method,query:url.search,header:request.headers.get('x-remote-gui-clipboard'),site:request.headers.get('sec-fetch-site'),contentType:request.headers.get('content-type'),body});
  if(request.method==='GET'){
   if(state.get.status===410)return new Response('remote session stopped',{status:410});
   return state.get.status===200?json(200,{text:state.remote,browser_mode:state.mode}):json(state.get.status,{error:state.get.error||'',browser_mode:state.mode});
  }
  if(request.method==='POST')return state.post.status===200?json(200,{browser_mode:state.mode}):json(state.post.status,{error:state.post.error||'',browser_mode:state.mode});
  if(request.method==='DELETE')return state.del.status===200?json(200,{browser_mode:state.mode}):json(state.del.status,{error:state.del.error||''});
  return new Response('',{status:405});
 }});
 // The Playwright module is loaded from a path given at run time, so its API is untyped here.
 const runtime=createRequire(import.meta.url)(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE!) as Record<string,{launch:(options:Record<string,unknown>)=>Promise<any>}>;
 const browser=await runtime[family].launch(family==='chromium'?{executablePath:process.env.REMOTE_GUI_CHROMIUM,headless:true,chromiumSandbox:true,args:['--disable-gpu']}:{executablePath:process.env.REMOTE_GUI_FIREFOX,headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1200,height:800}});
  await context.addInitScript({content:clipboardRecorder});
  const page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));
  await page.goto(server.url.href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>(window as any).__rfb!==undefined);
  const rfb=(expression:string)=>page.evaluate(expression);
  await rfb(`window.__rfb.dispatchEvent(new Event('connect'))`);
  await page.locator('#status').filter({hasText:'Shared browser connected'}).waitFor();
  check(await rfb('window.__rfb.focusCalls')===1,'connect no longer focuses the canvas outside the panel');

  // Labels follow the glossary, and opening the panel fetches the remote clipboard.
  state.remote='remote-open-sentinel ✓';
  await page.getByRole('button',{name:'Clipboard',exact:true}).click();
  const field=page.getByLabel('Text for the remote browser',{exact:true});
  const remote=page.locator('#clipboard-remote');
  const message=page.locator('#clipboard-message');
  await remote.filter({hasText:'remote-open-sentinel ✓'}).waitFor();
  check(state.requests[0]?.method==='GET'&&state.requests[0].header==='1','panel open did not fetch with the clipboard header');
  check(await field.evaluate((node:HTMLTextAreaElement)=>node.tagName==='TEXTAREA'&&node.getAttribute('autocomplete')==='off'),'send field is not an autocomplete-off textarea');
  for(const name of ['Send to remote browser','Copy to this device','Refresh','Clear'])check(await page.getByRole('button',{name,exact:true}).count()===1,'missing glossary button: '+name);
  check(await page.getByText('Copied in the remote browser',{exact:true}).count()===1,'missing remote area label');
  check(await page.getByLabel('Copied in the remote browser',{exact:true}).evaluate((node:HTMLElement)=>node.id)==='clipboard-remote','remote area is not labelled');
  check(await remote.evaluate((node:HTMLElement)=>!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(node.tagName)&&!node.isContentEditable&&!node.closest('form')),'remote area is a form control');
  check((await page.locator('#clipboard-count').textContent()||'').includes(String([...'remote-open-sentinel ✓'].length)),'character count missing');

  // Human mode shows no agent warning.
  check((await page.locator('#clipboard-mode').textContent()||'').toLowerCase().includes('human'),'human mode not shown');
  check(!(await page.locator('#clipboard-warning').isVisible()),'agent warning shown in human mode');

  // Focus stays in the panel through connect and resize, and typing never reaches the RFB.
  const focusBefore=await rfb('window.__rfb.focusCalls');
  await field.focus();
  await rfb(`window.__rfb.dispatchEvent(new Event('connect'))`);
  await page.setViewportSize({width:900,height:700});
  await rfb(`window.dispatchEvent(new Event('resize'))`);
  check(await page.evaluate(()=>document.activeElement?.id)==='clipboard-send','focus left the panel on connect or resize');
  check(await rfb('window.__rfb.focusCalls')===focusBefore,'panel focus was moved to the canvas');
  await page.keyboard.type('typed-in-panel',{delay:5});
  await page.keyboard.press('Control+v');
  check((await rfb('window.__rfb.keys.length'))===0,'panel typing reached the remote browser');

  // A refused send keeps the field, shows no confirmation and refreshes the mode.
  const sendSentinel='send-sentinel-'+crypto.randomUUID()+' € ✓';
  await field.fill(sendSentinel);
  state.mode='agent';state.post={status:409,error:'clipboard-busy'};
  await page.getByRole('button',{name:'Send to remote browser',exact:true}).click();
  await message.filter({hasText:/control|switch/i}).waitFor();
  check(await field.inputValue()===sendSentinel,'failed send cleared the field');
  check(!/Ctrl\+V/.test(await message.textContent()||''),'failed send was confirmed');
  check(state.requests.at(-1)?.query==='?expected_mode=human','send did not carry the mode the panel showed');
  check((await page.locator('#clipboard-mode').textContent()||'').toLowerCase().includes('agent'),'refusal did not refresh the mode');
  check(await page.locator('#clipboard-warning').isVisible()&&/readable by the agent/i.test(await page.locator('#clipboard-warning').textContent()||''),'agent warning missing in agent mode');

  // A successful send clears the field and the remote area, and names the mode.
  state.post={status:200};
  await page.getByRole('button',{name:'Send to remote browser',exact:true}).click();
  await message.filter({hasText:'Ctrl+V'}).waitFor();
  const sent=state.requests.at(-1)!;
  check(sent.method==='POST'&&sent.query==='?expected_mode=agent'&&sent.body===sendSentinel&&(sent.contentType||'').startsWith('text/plain'),'send request malformed');
  check(/agent/i.test(await message.textContent()||''),'confirmation does not name the mode');
  check(await field.inputValue()===''&&(await remote.textContent())==='','send left text in the page');

  // Remote markup shows literally and creates no element.
  state.remote='<img src=x onerror=alert(1)><b>x</b>';
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await remote.filter({hasText:'<img src=x onerror=alert(1)>'}).waitFor();
  check(await remote.textContent()===state.remote,'remote markup changed');
  check(await page.evaluate(()=>document.querySelectorAll('#clipboard-remote *, img').length)===0,'remote markup created an element');

  // Copy writes only inside the click handler, and a rejected write selects the text.
  const copySentinel='copy-sentinel-'+crypto.randomUUID()+' ✓';
  state.remote=copySentinel;
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await remote.filter({hasText:copySentinel}).waitFor();
  await page.getByRole('button',{name:'Copy to this device',exact:true}).click();
  await page.waitForFunction(()=>(window as any).__clipboardCalls.some((call:{op:string})=>call.op==='writeText'));
  await page.evaluate('window.__writeRejects=true');
  await page.getByRole('button',{name:'Copy to this device',exact:true}).click();
  await message.filter({hasText:/shortcut/i}).waitFor();
  check(await page.evaluate(()=>window.getSelection()?.toString())===copySentinel,'rejected copy did not select the remote text');

  // Both size refusals show a message.
  state.post={status:413,error:'clipboard-too-large'};
  await field.fill('oversized-send');
  await page.getByRole('button',{name:'Send to remote browser',exact:true}).click();
  await message.filter({hasText:'64 KiB'}).waitFor();
  check(await field.inputValue()==='oversized-send','oversized send cleared the field');
  await page.evaluate(()=>{document.getElementById('clipboard-message')!.textContent=''});
  state.get={status:413,error:'clipboard-too-large'};
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await message.filter({hasText:'64 KiB'}).waitFor();
  state.get={status:200};state.post={status:200};

  // Clear empties both areas and memory, and empties the remote clipboard.
  const clearSentinel='clear-sentinel-'+crypto.randomUUID();
  state.remote=clearSentinel;
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await remote.filter({hasText:clearSentinel}).waitFor();
  await field.fill('clear-field-'+clearSentinel);
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('clipboard-remote')!.textContent==='');
  check(state.requests.at(-1)?.method==='DELETE','Clear did not empty the remote clipboard');
  check(await field.inputValue()==='','Clear left the field');
  const writesBefore=await page.evaluate(()=>(window as any).__clipboardCalls.length);
  await page.evaluate('window.__writeRejects=false');
  await page.getByRole('button',{name:'Copy to this device',exact:true}).click();
  check(await page.evaluate(()=>(window as any).__clipboardCalls.length)===writesBefore,'Clear left the remote text in memory');

  // Disconnect and a stopped session drop all clipboard text.
  for(const [name,end] of [['disconnect',async()=>{await rfb(`window.__rfb.dispatchEvent(new Event('disconnect'))`)}],['stop',async()=>{state.get={status:410};await page.getByRole('button',{name:'Refresh',exact:true}).click()}]] as const){
   const sentinel=name+'-sentinel-'+crypto.randomUUID();
   state.get={status:200};state.remote=sentinel;
   if(!(await remote.isVisible()))await page.getByRole('button',{name:'Clipboard',exact:true}).click();
   await page.getByRole('button',{name:'Refresh',exact:true}).click();
   await remote.filter({hasText:sentinel}).waitFor();
   await field.fill('field-'+sentinel);
   await end();
   await page.waitForFunction(()=>document.getElementById('clipboard-remote')!.textContent===''&&(document.getElementById('clipboard-send') as HTMLTextAreaElement).value==='');
   const before=await page.evaluate(()=>(window as any).__clipboardCalls.length);
   if(await page.getByRole('button',{name:'Copy to this device',exact:true}).isVisible())await page.getByRole('button',{name:'Copy to this device',exact:true}).click();
   check(await page.evaluate(()=>(window as any).__clipboardCalls.length)===before,name+' left the remote text in memory');
  }

  // Closing the panel returns focus to the canvas.
  state.get={status:200};
  if(await remote.isVisible()){
   const calls=await rfb('window.__rfb.focusCalls') as number;
   await page.getByRole('button',{name:'Clipboard',exact:true}).click();
   check(await rfb('window.__rfb.focusCalls')===calls+1,'closing the panel did not focus the canvas');
  }

  // Nothing reads the local clipboard, every write came from a click, and no storage holds text.
  const calls=await page.evaluate(()=>(window as any).__clipboardCalls) as {op:string;text?:string;inClick?:boolean}[];
  check(!calls.some(call=>call.op==='readText'),'the viewer read the local clipboard');
  check(calls.filter(call=>call.op==='writeText').every(call=>call.inClick===true),'the viewer wrote the clipboard outside a click');
  const stored=await page.evaluate(async()=>{
   let databases='';
   try{databases=JSON.stringify(await indexedDB.databases())}catch{databases=''}
   return JSON.stringify({...localStorage})+JSON.stringify({...sessionStorage})+document.cookie+databases;
  });
  for(const sentinel of [sendSentinel,copySentinel,clearSentinel,'remote-open-sentinel'])check(!stored.includes(sentinel),'browser storage holds clipboard text');
  check(errors.length===0,'viewer page errors: '+errors.join('; '));
 }finally{
  await browser.close();
  server.stop(true);
 }
},120000);

for(const family of ['chromium','firefox'] as const)test.skipIf(!enabled||(family==='firefox'&&!process.env.REMOTE_GUI_FIREFOX))(`viewer automatic sizing: ${family}`,async()=>{
 const html=await viewerPage();
 const state={status:200,delay:0,busy:0,requests:[] as {width:number;height:number;claim:boolean;sequence:number;at:number}[],inFlight:0,peak:0};
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){const path=new URL(request.url).pathname;
  if(path==='/')return new Response(html,{headers:{'content-type':'text/html'}});
  if(path==='/core/rfb.js')return new Response(rfbStub,{headers:{'content-type':'text/javascript'}});
  if(path==='/__remote_gui/viewer-access')return Response.json({password:'synthetic'});
  if(path==='/__remote_gui/clipboard')return Response.json({text:'',browser_mode:'human'});
  if(path!=='/__remote_gui/viewport')return new Response('',{status:404});
  const value=await request.json() as {width:number;height:number;claim:boolean;sequence:number};state.requests.push({...value,at:Date.now()});state.inFlight++;state.peak=Math.max(state.peak,state.inFlight);
  const status=state.busy>0?409:state.status;if(state.busy>0)state.busy--;if(state.delay)await Bun.sleep(state.delay);state.inFlight--;
  return Response.json(status===200?{result:'applied',width:value.width,height:value.height}:{error:status===409?'viewport-busy':'viewport-unavailable'},{status});
 }});
 const runtime=createRequire(import.meta.url)(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE!) as Record<string,{launch:(options:Record<string,unknown>)=>Promise<any>}>;
 const browser=await runtime[family].launch(family==='chromium'?{executablePath:process.env.REMOTE_GUI_CHROMIUM,headless:true,chromiumSandbox:true,args:['--disable-gpu']}:{executablePath:process.env.REMOTE_GUI_FIREFOX,headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1200,height:800},deviceScaleFactor:2,reducedMotion:'reduce'});
  await context.addInitScript(()=>{(window as any).__focused=true;(window as any).__visible=true;document.hasFocus=()=>Boolean((window as any).__focused);Object.defineProperty(document,'visibilityState',{get:()=>(window as any).__visible?'visible':'hidden',configurable:true})});
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));await page.goto(server.url.href);await page.waitForFunction(()=>(window as any).__rfb);
  await page.evaluate(()=>(window as any).__rfb.dispatchEvent(new Event('connect')));
  const waitCalls=async(n:number)=>{const end=Date.now()+7000;while(state.requests.length<n&&Date.now()<end)await Bun.sleep(20);check(state.requests.length>=n,'missing automatic size request '+n)};
  await waitCalls(1);check(state.requests[0].width===1200&&state.requests[0].height===768&&state.requests[0].claim,'initial CSS geometry/claim incorrect');
  const first=state.requests.length;for(const width of [1100,1050,1000,900])await page.setViewportSize({width,height:1000});await waitCalls(first+1);await Bun.sleep(200);check(state.requests.length===first+1&&state.requests.at(-1)?.width===900&&state.requests.at(-1)?.height===968,'resize burst was not debounced');
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await Bun.sleep(250);check(state.requests.length===first+1,'unchanged geometry repeated work');
  state.delay=450;await page.setViewportSize({width:800,height:900});await waitCalls(first+2);await page.setViewportSize({width:700,height:900});await page.setViewportSize({width:600,height:900});await waitCalls(first+3);await Bun.sleep(500);check(state.peak===1&&state.requests.at(-1)?.width===600,'in-flight requests were not coalesced');state.delay=0;
  state.status=503;await page.setViewportSize({width:500,height:900});await page.getByText('Automatic sizing unavailable; fitting the shared browser.',{exact:true}).waitFor();
  state.status=200;await page.setViewportSize({width:600,height:900});await page.locator('#viewport-status').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Clipboard',exact:true}).click();const field=page.getByLabel('Text for the remote browser',{exact:true});await field.fill('synthetic clipboard field');await page.setViewportSize({width:390,height:667});await Bun.sleep(350);check(await field.evaluate((n:HTMLElement)=>document.activeElement===n),'sizing stole clipboard focus');
  const beforeZero=state.requests.length;await page.locator('#screen').evaluate((node:HTMLElement)=>{node.style.width='0px'});await Bun.sleep(250);check(state.requests.length===beforeZero,'zero-size area sent geometry');await page.locator('#screen').evaluate((node:HTMLElement)=>{node.style.width='100%'});await Bun.sleep(250);
  const beforeLimits=state.requests.length;for(const size of [{width:200,height:200},{width:320,height:8224},{width:8192,height:272}]){await page.setViewportSize(size);await Bun.sleep(200)}check(state.requests.length===beforeLimits,'unsupported aspect ratio requested an invalid size');
  await page.setViewportSize({width:8192,height:2032});await waitCalls(beforeLimits+1);check(state.requests.at(-1)?.width===4096&&state.requests.at(-1)?.height===1000,'above-limit viewer did not preserve aspect ratio');
  await page.evaluate(()=>{(window as any).__visible=false;document.dispatchEvent(new Event('visibilitychange'))});const hidden=state.requests.length;await page.setViewportSize({width:900,height:1000});await Bun.sleep(350);check(state.requests.length===hidden,'hidden viewer sent geometry');
  await page.evaluate(()=>{(window as any).__visible=true;document.dispatchEvent(new Event('visibilitychange'))});await waitCalls(hidden+1);
  state.busy=5;const beforeBusy=state.requests.length;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await waitCalls(beforeBusy+5);await Bun.sleep(750);check(state.requests.length===beforeBusy+5,'busy retries were unbounded');const retries=state.requests.slice(beforeBusy);check(retries[0].claim&&retries.slice(1).every(r=>!r.claim),'busy retry replayed a focus claim');
  await page.setViewportSize({width:901,height:1000});await waitCalls(beforeBusy+6);await Bun.sleep(200);
  state.busy=5;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await waitCalls(beforeBusy+7);await page.evaluate(()=>{(window as any).__focused=false;window.dispatchEvent(new Event('blur'))});const blurred=state.requests.length;await Bun.sleep(750);check(state.requests.length===blurred,'blurred viewer retried sizing');state.busy=0;await page.evaluate(()=>{(window as any).__focused=true;window.dispatchEvent(new Event('focus'))});await waitCalls(blurred+1);

  await page.evaluate(()=>(window as any).__rfb.dispatchEvent(new Event('disconnect')));const disconnected=state.requests.length;await page.setViewportSize({width:902,height:1000});await Bun.sleep(250);check(state.requests.length===disconnected,'disconnected viewer sent geometry');await page.evaluate(()=>(window as any).__rfb.dispatchEvent(new Event('connect')));await waitCalls(disconnected+1);check(state.requests.at(-1)?.claim,'reconnect did not claim');
  check(errors.length===0,'viewer console errors: '+errors.join(','));await context.close();
 }finally{await browser.close();server.stop(true)}
},120000);
