import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]();
let browser:any,agent:any;
let stage='input';
const check=(ok:unknown)=>{if(!ok)throw Error('verification failed')};
try{
 const {session,proxy,module,chromiumPath}=JSON.parse((await lines.next()).value!);
 const {chromium}=createRequire(import.meta.url)(module);
 const find=async(b:any)=>{for(const p of b.contexts()[0].pages())if(await p.title()===session.marker)return p;throw Error('marker absent')};
 stage='marker';agent=await chromium.connectOverCDP(session.local_cdp);let marker=await find(agent);await marker.bringToFront();await marker.getByLabel('Connection check').fill('');await marker.getByLabel('Connection check').focus();await agent.close();agent=undefined;
 stage='ssh-viewer';browser=await chromium.launch({executablePath:chromiumPath,headless:true,chromiumSandbox:true,proxy:{server:proxy},args:['--disable-gpu','--proxy-bypass-list=<-loopback>']});
 const context=await browser.newContext({httpCredentials:{username:'viewer',password:session.access_code,origin:new URL(session.url).origin}}).catch(()=>{throw Error('fresh context unavailable')});
 const page=await context.newPage();await page.goto(session.url);await page.getByRole('link',{name:'Open session'}).click();await page.locator('#status').filter({hasText:'Shared browser connected'}).waitFor({timeout:15000});const canvas=page.locator('canvas');await canvas.waitFor({state:'visible'});await canvas.focus();await page.keyboard.type('ssh-proof',{delay:35});
 stage='reattach';agent=await chromium.connectOverCDP(session.local_cdp);marker=await find(agent);check(await marker.getByLabel('Connection check').inputValue()==='ssh-proof');await marker.getByLabel('Connection check').fill('');await agent.close();agent=undefined;
 console.log(JSON.stringify({stage:'viewer-verified'}));await lines.next();
 stage='bypass-check';let blocked=false;try{await page.goto(session.url+'?after-tunnel-stop=1',{timeout:5000})}catch{blocked=true};check(blocked);
 console.log(JSON.stringify({result:'passed',ssh_viewer:true,same_browser:true,tunnel_required:true}));
}catch{console.log(JSON.stringify({result:'failed',stage}));process.exitCode=1}
finally{if(agent)await agent.close();if(browser)await browser.close();process.exit()}
