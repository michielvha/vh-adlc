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
  check(result.exitCode === 0, 'runtime command failed: ' + args[0]);
  return JSON.parse(result.stdout.toString());
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
  const revokedAccount = agent.contexts()[0].pages().find((candidate: any) => candidate.url() === fixture.url.href + 'account');
  check(revokedAccount, 'original account tab absent after revocation');
  const denied = await revokedAccount.reload({waitUntil: 'domcontentloaded'});
  check(denied.status() === 401, 'revoked provider session was treated as authenticated');
 } finally {
  if (agent) await agent.close();
  if (viewer) await viewer.close();
  fixture.stop(true);
  if (session) {
   const stopped = cli('stop', session.id);
   check(stopped.state === 'stopped' || stopped.state === 'failed', 'owned browser cleanup pending; private records retained');
   check(!existsSync(join(root, session.id, 'profile')), 'owned browser profile survived cleanup');
  }
  rmSync(root, {recursive: true, force: true});
 }
}, 180000);
