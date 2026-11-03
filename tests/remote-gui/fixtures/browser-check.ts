import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {X509Certificate,createHash} from 'node:crypto';
import {join} from 'node:path';

// Fixture-only adapter: a real fresh browser checks the real packaged proxy.
// It never exports its internal enrollment code or browser credential.
const settings=JSON.parse(readFileSync(join(import.meta.dir,'capabilities.json'),'utf8'));
const id=process.argv[2];
let browser:any;
let stage='capability';
const runtime=async(...args:string[])=>{
 const child=Bun.spawn(['/usr/bin/bash',settings.helper,...args],{stdout:'pipe',stderr:'pipe',env:process.env});
 const [exit,out]=await Promise.all([child.exited,new Response(child.stdout).text()]);
 if(exit!==0)throw Error('runtime command unavailable');return JSON.parse(out);
};
try{
 if(settings.scenario==='browser-unavailable')throw Error('verification unavailable');
 stage='access';
 const access=await runtime('access',id,'--reveal');
 stage='browser';
 const {chromium}=createRequire(import.meta.url)(settings.playwright);
 const cert=new X509Certificate(readFileSync(settings.cert));
 const spki=createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
 browser=await chromium.launch({executablePath:settings.chromium,headless:true,chromiumSandbox:true,env:{...process.env,XDG_CACHE_HOME:join(import.meta.dir,'cache')},args:['--disable-gpu','--ignore-certificate-errors-spki-list='+spki]});
 const context=await browser.newContext({httpCredentials:{username:'viewer',password:access.access_code,origin:new URL(access.url).origin}}).catch(()=>{throw Error('verification unavailable')});
 const page=await context.newPage();let failedAsset=false;
 page.on('response',(response:any)=>{if(new URL(response.url()).pathname.startsWith('/assets/')&&response.status()!==200)failedAsset=true});
 stage='authentication';
 await page.goto(access.url);await page.getByRole('link',{name:'Open session'}).click();
 await page.getByRole('heading',{name:'Disposable app'}).waitFor({timeout:5000});
 stage='redirect-cookie';
 await page.locator('#jar').filter({hasText:'jar-ok'}).waitFor({timeout:5000});
 stage='origin';
 await page.locator('#origin').filter({hasText:'origin-ok'}).waitFor({timeout:5000});
 stage='websocket';
 await page.locator('#ws').filter({hasText:'echo-ok'}).waitFor({timeout:5000});
 stage='assets';
 if(failedAsset)throw Error('required asset failed');
 writeFileSync(join(import.meta.dir,'browser-result.json'),JSON.stringify({result:'passed',id,assets:true,redirect:true,cookies:true,websocket:true}));
 console.log(JSON.stringify({result:'passed',id,assets:true,redirect:true,cookies:true,websocket:true,scope:'host fixture only'}));
}catch{
 writeFileSync(join(import.meta.dir,'browser-result.json'),JSON.stringify({result:'compatibility-blocked',id,stage}));
 console.log(JSON.stringify({result:'compatibility-blocked',id,stage,reason:settings.scenario==='browser-unavailable'?'browser verification unavailable':'required app browser check failed'}));
 // A completed verification capability returns its observed result. The
 // controller grades it; a nonzero tool exit can hide structured stdout.
}finally{if(browser)await browser.close()}
