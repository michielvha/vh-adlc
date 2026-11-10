import {test} from 'bun:test';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {startClipboardPage} from './fixtures/clipboard-page';

const enabled=process.env.REMOTE_GUI_VIEWER_E2E==='1';
const check=(condition:unknown,message:string)=>{if(!condition)throw Error(message)};

function runtimeResult(result: ReturnType<typeof Bun.spawnSync>, command: string) {
 let output: any;
 try {
  output = JSON.parse(result.stdout.toString());
 } catch {
  throw Error('runtime returned invalid JSON: ' + command);
 }
 const diagnostic = {
  result: output.result,
  state: output.state,
  diagnostic: output.diagnostic,
  cleanup_diagnostic: output.cleanup_diagnostic,
 };
 check(result.exitCode === 0, 'runtime command failed: ' + command + ' ' + JSON.stringify(diagnostic));
 return output;
}

async function stopBrowser(cli: (...args: string[]) => any, id: string) {
 let stopped = cli('stop', id);
 const deadline = Date.now() + 10000;
 while (['stopping', 'cleanup-pending'].includes(stopped.state) && Date.now() < deadline) {
  await Bun.sleep(100);
  stopped = cli('status', id);
 }
 check(['stopped', 'failed'].includes(stopped.state), 'owned browser cleanup incomplete: ' + stopped.state + ' ' + (stopped.cleanup_diagnostic || stopped.diagnostic || ''));
 return stopped;
}

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
  return runtimeResult(result, args[0]);
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
  await stopBrowser(cli, second.id);
  check(!existsSync(join(root,second.id,'profile')),'stopped browser profile survived');
  check(cli('status',first.id).state==='ready','stopping another browser broke this session');
  agent=await chromium.connectOverCDP(first.local_cdp,{timeout:10000});
  check((await Promise.all(agent.contexts()[0].pages().map((p:any)=>p.title()))).includes(first.marker),'surviving session marker lost');
 }finally{
  if(agent)await agent.close();if(viewer)await viewer.close();
  let safe=true;
  for(const session of sessions){try{await stopBrowser(cli,session.id)}catch{safe=false}}
  if(safe)rmSync(root,{recursive:true,force:true});
  else throw Error('owned browser cleanup pending; private test records retained');
 }
},120000);

test.skipIf(!enabled)('human sign-in retains session cookies and tab state through both handoffs', async () => {
 const require = createRequire(import.meta.url);
 const {chromium} = require(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE!);
 const root = mkdtempSync(join(tmpdir(), 'rg-human-'));
 const binary = process.env.REMOTE_GUI_TEST_BINARY!;
 let session: any;
 let viewer: any;
 let agent: any;
 let proofs = 0;
 let revoked = false;
 let memoryVisits = 0;
 const memoryProofs: boolean[] = [];
 const fixtureRequests: {path: string; signedIn: boolean; retained: string | null}[] = [];
 const fixture = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(request) {
   const url = new URL(request.url);
   const signedIn = !revoked && request.headers.get('cookie')?.includes('fixture-session=accepted');
   fixtureRequests.push({path: url.pathname, signedIn: signedIn === true, retained: url.searchParams.get('retained')});
   if (url.pathname === '/login') {
    return new Response(`<script>sessionStorage.setItem('fixture-state','retained');location.replace('/account')</script>`, {
     headers: {'Content-Type': 'text/html', 'Cache-Control': 'no-store', 'Set-Cookie': 'fixture-session=accepted; HttpOnly; SameSite=Lax; Path=/'},
    });
   }
   if (url.pathname === '/account' && signedIn) {
    return new Response(`<p>Authenticated fixture</p><script>fetch('/proof?retained='+(sessionStorage.getItem('fixture-state')==='retained'),{method:'POST'})</script>`, {
     headers: {'Content-Type': 'text/html', 'Cache-Control': 'no-store'},
    });
   }
   if (request.method === 'POST' && url.pathname === '/proof' && signedIn && url.searchParams.get('retained') === 'true') {
    proofs++;
    return new Response('ok', {headers: {'Cache-Control': 'no-store'}});
   }
   if (url.pathname === '/memory') {
    memoryVisits++;
    const initialize = memoryVisits === 1 ? 'window.fixtureEphemeral=true;' : '';
    return new Response(`<script>${initialize}fetch('/memory-proof?present='+(window.fixtureEphemeral===true),{method:'POST'})</script>`, {
     headers: {'Content-Type': 'text/html', 'Cache-Control': 'no-store'},
    });
   }
   if (request.method === 'POST' && url.pathname === '/memory-proof') {
    memoryProofs.push(url.searchParams.get('present') === 'true');
    return new Response('ok', {headers: {'Cache-Control': 'no-store'}});
   }
   return new Response('Sign-in required', {status: 401});
  },
 });
 const cli = (...args: string[]) => {
  const result = Bun.spawnSync([binary, ...args, '--home', root, '--transport', 'loopback'], {env: process.env});
  return runtimeResult(result, args[0]);
 };
 const waitFor = async (condition: () => boolean | Promise<boolean>, message: string) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
   if (await condition()) return;
   await Bun.sleep(100);
  }
  throw Error(message + '; fixture requests ' + JSON.stringify(fixtureRequests));
 };
 try {
  session = cli('start', '--browser-mode', 'human', '--ttl', '4m');
  check(session.browser_mode === 'human' && !session.local_cdp, 'human browser exposed debugging');
  check(session.marker_url, 'owned connection-page URL missing');
  viewer = await chromium.launch({
   executablePath: process.env.REMOTE_GUI_CHROMIUM,
   headless: true,
   chromiumSandbox: true,
   args: ['--disable-gpu'],
  });
  const access = cli('access', session.id, '--reveal');
  const context = await viewer.newContext({
   serviceWorkers: 'block',
   viewport: {width: 1500, height: 1000},
   httpCredentials: {username: 'viewer', password: access.access_code, origin: new URL(session.url).origin},
  });
  const page = await context.newPage();
  await page.goto(session.url, {waitUntil: 'domcontentloaded'});
  await page.getByRole('link', {name: 'Open session'}).click();
  await page.locator('#status').filter({hasText: 'Shared browser connected'}).waitFor({timeout: 15000});
  const canvas = page.locator('canvas');
  await canvas.waitFor({state: 'visible'});
  await canvas.focus();
  await page.keyboard.type(session.marker, {delay: 15});
  await waitFor(async () => {
   const probe = await fetch(session.marker_url + 'check').then(response => response.json()) as any;
   return probe.input_verified === true;
  }, 'viewer input missed the owned human browser');
  await page.keyboard.press('Control+t');
  await page.keyboard.type(fixture.url.href + 'login');
  await page.keyboard.press('Enter');
  await waitFor(() => proofs >= 1, 'fixture owner sign-in failed');
  await page.keyboard.press('Control+t');
  await page.keyboard.type(fixture.url.href + 'memory');
  await page.keyboard.press('Enter');
  await waitFor(() => memoryProofs.includes(true), 'in-memory-only fixture did not initialize');
  await page.keyboard.press('Control+2');

  // The fixture owner has finished sign-in before this explicit hand-back.
  const returned = cli('handoff', session.id, '--browser-mode', 'agent');
  check(returned.browser_mode === 'agent' && returned.local_cdp, 'agent hand-back did not establish control');
  check(returned.url === session.url && returned.expires_at === session.expires_at, 'handoff changed viewer or lifetime');
  agent = await chromium.connectOverCDP(returned.local_cdp, {timeout: 10000});
  check(agent.contexts()[0].pages().length === 3, 'handoff added tabs instead of restoring the original three');
  check(agent.contexts()[0].pages().filter((candidate: any) => candidate.url() === session.marker_url).length === 1, 'handoff duplicated the connection tab');
  const account = agent.contexts()[0].pages().find((candidate: any) => candidate.url() === fixture.url.href + 'account');
  check(account, 'original fixture tab was not restored');
  await account.bringToFront();
  await account.getByText('Authenticated fixture').waitFor({timeout: 15000});
  check(await account.evaluate(() => sessionStorage.getItem('fixture-state')) === 'retained', 'tab storage lost during hand-back');
  await waitFor(() => proofs >= 2, 'session cookie or tab state lost during hand-back');
  check((await Promise.all(agent.contexts()[0].pages().map((candidate: any) => candidate.title()))).includes(session.marker), 'original connection tab was not restored');
  const memory = agent.contexts()[0].pages().find((candidate: any) => candidate.url() === fixture.url.href + 'memory');
  check(memory, 'additional tab was not restored');
  await memory.bringToFront();
  await waitFor(() => memoryProofs.includes(false), 'in-memory-only fixture was incorrectly reported as retained');
  await agent.close();
  agent = undefined;

  const human = cli('handoff', session.id, '--browser-mode', 'human');
  check(human.browser_mode === 'human' && !human.local_cdp, 'human return retained debugging');
  check(human.url === session.url && human.expires_at === session.expires_at, 'return changed viewer or lifetime');
  await canvas.focus();
  await page.keyboard.press('Control+2');
  await waitFor(() => proofs >= 3, 'session cookie or tab state lost on return to the owner');

  // A provider can revoke a session independently of transport and browser mode.
  revoked = true;
  const lostLogin = cli('handoff', session.id, '--browser-mode', 'agent');
  check(lostLogin.state === 'ready' && lostLogin.readiness_scope === 'host-transport-only' && lostLogin.app_verification === 'not-attested', 'transport readiness claimed provider authentication');
  agent = await chromium.connectOverCDP(lostLogin.local_cdp, {timeout: 10000});
  check(agent.contexts()[0].pages().length === 3, 'repeated handoffs changed the original tab count');
  check(agent.contexts()[0].pages().filter((candidate: any) => candidate.url() === session.marker_url).length === 1, 'repeated handoffs duplicated the connection tab');
  const revokedAccount = agent.contexts()[0].pages().find((candidate: any) => candidate.url() === fixture.url.href + 'account');
  check(revokedAccount, 'original account tab absent after revocation');
  const denied = await revokedAccount.reload({waitUntil: 'domcontentloaded'});
  check(denied.status() === 401, 'revoked provider session was treated as authenticated');
 } finally {
  if (agent) await agent.close();
  if (viewer) await viewer.close();
  fixture.stop(true);
  if (session) {
   await stopBrowser(cli, session.id);
   check(!existsSync(join(root, session.id, 'profile')), 'owned browser profile survived cleanup');
  }
  rmSync(root, {recursive: true, force: true});
 }
}, 180000);

// Clipboard fixture helpers. Sentinels are synthetic and differ from the session marker.
const sentinel=(label:string)=>'clip-'+label+'-'+crypto.randomUUID().slice(0,8)+' € ✓';

function launchViewer(runtime:any,family:'chromium'|'firefox',options:Record<string,unknown>={}){
 return family==='chromium'
  ?runtime.chromium.launch({executablePath:process.env.REMOTE_GUI_CHROMIUM,headless:true,chromiumSandbox:true,args:['--disable-gpu'],...options})
  :runtime.firefox.launch({executablePath:process.env.REMOTE_GUI_FIREFOX,headless:true,...options});
}

async function openViewer(context:any,url:string){
 const page=await context.newPage();
 const clipboardReplies:string[]=[];
 page.on('response',(response:any)=>{if(new URL(response.url()).pathname==='/__remote_gui/clipboard')clipboardReplies.push(response.request().method()+':'+response.status())});
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.getByRole('link',{name:'Open session'}).click();
 await page.locator('#status').filter({hasText:'Shared browser connected'}).waitFor({timeout:15000});
 await page.locator('canvas').waitFor({state:'visible'});
 return {page,clipboardReplies};
}

async function fixturePage(agent:any,url:string){
 const pages=agent.contexts()[0].pages();
 const found=pages.find((candidate:any)=>candidate.url()===url);
 check(found,'remote clipboard fixture tab missing');
 return found;
}

// The owner's paste gesture: copy natively on a local page, then paste into the send field.
async function pasteIntoField(context:any,page:any,field:any,text:string){
 const local=await context.newPage();
 await local.setContent('<textarea id="source" aria-label="Local source"></textarea>');
 await local.locator('#source').fill(text);
 await local.locator('#source').selectText();
 await local.keyboard.press('Control+c');
 await local.close();
 await page.bringToFront();
 await field.fill('');
 await field.focus();
 await page.keyboard.press('Control+v');
 check(await field.inputValue()===text,'native paste into the send field failed');
}

const pastedValues=async(page:any)=>JSON.parse(await page.evaluate(()=>sessionStorage.getItem('pasted')||'[]')) as string[];

for(const family of ['chromium','firefox'] as const)test.skipIf(!enabled||(family==='firefox'&&!process.env.REMOTE_GUI_FIREFOX))(`viewer clipboard round trip in both browser modes: ${family}`,async()=>{
 const runtime=createRequire(import.meta.url)(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE!);
 const {chromium}=runtime;
 const root=mkdtempSync(join(tmpdir(),'rg-clipboard-'));
 const binary=process.env.REMOTE_GUI_TEST_BINARY!;
 const remotePage=startClipboardPage();
 let session:any;let viewer:any;let agent:any;
 const cli=(...args:string[])=>runtimeResult(Bun.spawnSync([binary,...args,'--home',root,'--transport','loopback'],{env:process.env}),args[0]);
 const waitFor=async(condition:()=>boolean|Promise<boolean>,message:string)=>{
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){if(await condition())return;await Bun.sleep(100)}
  throw Error(message);
 };
 try{
  session=cli('start','--ttl','4m');
  agent=await chromium.connectOverCDP(session.local_cdp,{timeout:10000});
  const opened=await agent.contexts()[0].newPage();
  await opened.goto(remotePage.url);
  await opened.bringToFront();
  await opened.locator('#paste').focus();
  viewer=await launchViewer(runtime,family);
  const access=cli('access',session.id,'--reveal');
  const context=await viewer.newContext({viewport:{width:1500,height:1000},httpCredentials:{username:'viewer',password:access.access_code,origin:new URL(session.url).origin}});
  const {page,clipboardReplies}=await openViewer(context,session.url);
  const toggle=page.getByRole('button',{name:'Clipboard',exact:true});
  const field=page.getByLabel('Text for the remote browser',{exact:true});
  const remote=page.locator('#clipboard-remote');
  const message=page.locator('#clipboard-message');
  await toggle.click();
  await page.locator('#clipboard-mode').filter({hasText:'agent'}).waitFor();
  check(await page.locator('#clipboard-warning').isVisible(),'agent warning missing in agent mode');

  // Typing in the panel reaches no remote page.
  const keysBefore=await opened.evaluate(()=>sessionStorage.getItem('keys'));
  await field.click();
  await page.keyboard.type('panel-only-typing',{delay:10});
  await Bun.sleep(500);
  check(await opened.evaluate(()=>sessionStorage.getItem('keys'))===keysBefore,'panel typing reached the remote page');
  await field.fill('');

  // Agent mode: paste into the panel, send, read the held text back, and paste with Ctrl+V through the canvas.
  const agentSend=sentinel('agent-send');
  check(agentSend!==session.marker,'sentinel matches the marker');
  await pasteIntoField(context,page,field,agentSend);
  check(await opened.evaluate(()=>sessionStorage.getItem('keys'))===keysBefore,'pasting in the panel reached the remote page');
  await page.getByRole('button',{name:'Send to remote browser',exact:true}).click();
  await message.filter({hasText:'Ctrl+V'}).waitFor();
  check(/agent/.test(await message.textContent()||''),'agent-mode confirmation does not name the mode');
  const refreshed=Date.now();
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await remote.filter({hasText:agentSend}).waitFor({timeout:2500});
  check(Date.now()-refreshed<2500,'held text took too long to return');
  await toggle.click();
  await page.keyboard.press('Control+v');
  await waitFor(async()=>(await pastedValues(opened)).includes(agentSend),'agent-mode paste did not reach the remote page');

  // Text copied in the remote browser reaches the viewer device on a click.
  const remoteCopy=sentinel('remote-copy');
  await opened.locator('#source').fill(remoteCopy);
  await opened.locator('#source').focus();
  await opened.locator('#source').selectText();
  const cdp=await opened.context().newCDPSession(opened);
  await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'c',code:'KeyC',windowsVirtualKeyCode:67,commands:['copy']});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'c',code:'KeyC',windowsVirtualKeyCode:67});
  await cdp.detach();
  await toggle.click();
  await remote.filter({hasText:remoteCopy}).waitFor();
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await remote.filter({hasText:remoteCopy}).waitFor();
  await page.getByRole('button',{name:'Copy to this device',exact:true}).click();
  await message.filter({hasText:'Copied to this device.'}).waitFor();
  const local=await context.newPage();
  await local.setContent('<textarea id="local" aria-label="Local paste"></textarea>');
  await local.locator('#local').focus();
  await local.keyboard.press('Control+v');
  check(await local.locator('#local').inputValue()===remoteCopy,'copied text did not reach the viewer device clipboard');
  await local.close();
  await page.bringToFront();
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await message.filter({hasText:'Cleared'}).waitFor();
  await agent.close();agent=undefined;

  // Human mode: the shown mode changes after a handoff and a Refresh, then a send pastes in the fixture tab.
  const human=cli('handoff',session.id,'--browser-mode','human');
  check(human.browser_mode==='human','handoff to human failed');
  check(await page.locator('#status').textContent()==='Shared browser connected','viewer disconnected during handoff');
  check((await page.locator('#clipboard-mode').textContent()||'').includes('agent'),'mode changed without a request');
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.locator('#clipboard-mode').filter({hasText:'human'}).waitFor();
  check(!(await page.locator('#clipboard-warning').isVisible()),'agent warning shown in human mode');
  const humanSend=sentinel('human-send');
  await pasteIntoField(context,page,field,humanSend);
  await page.getByRole('button',{name:'Send to remote browser',exact:true}).click();
  await message.filter({hasText:'Ctrl+V'}).waitFor();
  check(/human/.test(await message.textContent()||''),'human-mode confirmation does not name the mode');
  await toggle.click();
  await page.keyboard.press('Control+2');
  await Bun.sleep(700);
  await page.keyboard.press('Control+v');
  await Bun.sleep(700);
  const returned=cli('handoff',session.id,'--browser-mode','agent');
  agent=await chromium.connectOverCDP(returned.local_cdp,{timeout:10000});
  const restored=await fixturePage(agent,remotePage.url);
  await waitFor(async()=>(await pastedValues(restored)).includes(humanSend),'human-mode paste did not reach the remote page');
  for(const method of ['GET','POST','DELETE'])check(clipboardReplies.includes(method+':200'),'panel '+method+' did not succeed: '+clipboardReplies.join(','));
 }finally{
  if(agent)await agent.close();
  if(viewer)await viewer.close();
  remotePage.stop();
  if(session)await stopBrowser(cli,session.id);
  rmSync(root,{recursive:true,force:true});
 }
},240000);
