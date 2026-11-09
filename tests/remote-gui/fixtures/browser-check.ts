import {readFileSync,writeFileSync,mkdirSync,appendFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {X509Certificate,createHash} from 'node:crypto';
import {join} from 'node:path';

// Fixture-only browser capability; never exports a loopback enrollment code.
const settings=JSON.parse(readFileSync(join(import.meta.dir,'capabilities.json'),'utf8'));
const id=process.argv[2];
let browser:any;
let stage='capability';
let httpStatus:number|undefined;
const runtime=async(...args:string[])=>{
 const child=Bun.spawn(['/usr/bin/bash',settings.helper,...args],{stdout:'pipe',stderr:'pipe',env:process.env});
 const [exit,out]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
 if(exit!==0)throw Error('runtime command unavailable');return JSON.parse(out);
};
try{
 if(!/^[a-f0-9]{32}$/.test(id||'')){stage='argument';throw Error('invalid session id')}
 if(settings.scenario==='browser-unavailable')throw Error('verification unavailable');
 stage='access';
 const access=await runtime('access',id,'--reveal');
 const identity=access.auth_mode==='tailscale-identity';
 if(identity&&('access_code'in access||'enrollment_expires_at'in access))throw Error('unexpected enrollment metadata');
 stage='browser';
 const {chromium,firefox}=createRequire(import.meta.url)(settings.playwright);
 let context:any;
 if(settings.browserType==='firefox'){
  const profile=join(import.meta.dir,'cache/firefox-profile');mkdirSync(profile,{recursive:true,mode:0o700});
  for(const args of [['-N','--empty-password','-d','sql:'+profile],['-A','-n','remote-gui-fixture','-t','C,,','-i',settings.ca||settings.cert,'-d','sql:'+profile]]){
   stage=args[0]==='-N'?'nss-init':'nss-import';
   const result=Bun.spawnSync(['/usr/bin/certutil',...args],{stdout:'pipe',stderr:'pipe'});if(result.exitCode!==0)throw Error('private fixture CA unavailable');
  }
  stage='firefox-launch';
  context=await firefox.launchPersistentContext(profile,{executablePath:settings.firefox,headless:true,env:{...process.env,XDG_CACHE_HOME:join(import.meta.dir,'cache')},firefoxUserPrefs:{'browser.privatebrowsing.autostart':true}}).catch(()=>{throw Error('fresh Firefox context unavailable')});
  browser=context;
 }else{
  const cert=new X509Certificate(readFileSync(settings.cert));
  const spki=createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
  browser=await chromium.launch({executablePath:settings.chromium,headless:true,chromiumSandbox:true,env:{...process.env,XDG_CACHE_HOME:join(import.meta.dir,'cache')},args:['--disable-gpu','--ignore-certificate-errors-spki-list='+spki]});
  context=await browser.newContext(identity?{}:{httpCredentials:{username:'viewer',password:access.access_code,origin:new URL(access.url).origin}}).catch(()=>{throw Error('fresh browser context unavailable')});
 }
 const page=await context.newPage();let failedAsset=false;
 page.on('response',(response:any)=>{if(new URL(response.url()).pathname.startsWith('/assets/')&&response.status()!==200)failedAsset=true});
 stage='initial-navigation';
 if(settings.scenario==='navigation-transient'||settings.scenario==='navigation-failure'){
  const attempts=join(import.meta.dir,'browser-attempts.jsonl');
  const failures=existsSync(attempts)?readFileSync(attempts,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(attempt=>attempt.failure_code==='ERR_NETWORK_CHANGED').length:0;
  if(settings.scenario==='navigation-failure'||failures<2)throw Error('ERR_NETWORK_CHANGED');
 }
 const response=await page.goto(access.url);httpStatus=response.status();
 stage='authentication';
 if(identity){
  if(response.status()!==200||response.headers()['www-authenticate']||await page.getByRole('link',{name:'Open session'}).count())throw Error('unexpected viewer authentication');
 }else await page.getByRole('link',{name:'Open session'}).click();
 await page.getByRole('heading',{name:'Disposable app'}).waitFor({timeout:5000});
 stage='redirect-cookie';await page.locator('#jar').filter({hasText:'jar-ok'}).waitFor({timeout:5000});
 stage='origin';await page.locator('#origin').filter({hasText:'origin-ok'}).waitFor({timeout:5000});
 stage='websocket';await page.locator('#ws').filter({hasText:'echo-ok'}).waitFor({timeout:5000});
 stage='assets';if(failedAsset)throw Error('required asset failed');
 const result={result:'passed',id,assets:true,redirect:true,cookies:true,websocket:true,no_http_credentials:identity};
 writeFileSync(join(import.meta.dir,'browser-result.json'),JSON.stringify(result));
 appendFileSync(join(import.meta.dir,'browser-attempts.jsonl'),JSON.stringify({id,result:'passed'})+'\n');
 console.log(JSON.stringify({...result,scope:'host fixture only'}));
 }catch(error){
 const failureCode=String(error).match(/(?:SEC_ERROR|SSL_ERROR|NS_ERROR|MOZILLA_PKIX_ERROR|ERR)_[A-Z0-9_]+/)?.[0]||'browser-check-failed';
 const invocation=stage==='argument'||stage==='access';
 const result={result:invocation?'verification-error':'compatibility-blocked',id,stage,http_status:httpStatus,failure_code:failureCode};
 writeFileSync(join(import.meta.dir,'browser-result.json'),JSON.stringify(result));
 appendFileSync(join(import.meta.dir,'browser-attempts.jsonl'),JSON.stringify(result)+'\n');
 console.log(JSON.stringify({...result,reason:invocation?'No app verification ran. Use the exact 32-character id from status/access JSON, then retry the browser check. Do not classify an argument error as app incompatibility.':settings.scenario==='browser-unavailable'?'browser verification unavailable':'required app browser check failed'}));
}finally{if(browser)await browser.close()}
