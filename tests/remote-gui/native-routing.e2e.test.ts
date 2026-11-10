import {test} from 'bun:test';
import {cpSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,chmodSync,existsSync,readdirSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';

const enabled=process.env.REMOTE_GUI_ROUTING_E2E==='1';
const repo=resolve(import.meta.dir,'../..');
const plugin=join(repo,'plugins/remote-gui');
const allCases=['first-link','reuse','asset-failure','redirect-failure','origin-failure','ws-failure','browser-unavailable','transport-failure','external','internal','ssh','configured-sso','owned-challenge','unknown-login','nonlogin','provider-rejected','unconfirmed-login','navigation-transient','navigation-failure','identity-chromium','identity-firefox','profile-named','profile-unnamed','profile-unapproved','profile-approved','profile-challenge'];
const cases=process.env.REMOTE_GUI_ROUTING_CASES?.split(',')||allCases;
const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message)};
const digest=(directory:string)=>{
 const hash=createHash('sha256');
 const visit=(base:string)=>{for(const entry of readdirSync(join(directory,base),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const relative=join(base,entry.name);if(entry.isDirectory())visit(relative);else if(entry.isFile()){hash.update(relative+'\0');hash.update(readFileSync(join(directory,relative)))}}};
 visit('');return hash.digest('hex');
};
for(const scenario of cases)test.skipIf(!enabled)(`native real-runtime routing: ${scenario}`,async()=>{
 check(allCases.includes(scenario),'unknown routing scenario');
 const root=mkdtempSync(join(tmpdir(),'rg-routing-'));
 const build=process.env.REMOTE_GUI_ROUTING_BUILD_CACHE||join(tmpdir(),'remote-gui-routing-build-cache');
 mkdirSync(build,{recursive:true,mode:0o700});chmodSync(build,0o700);
 try{
  for(const dir of ['tmp','cache','n','go-cache'])mkdirSync(join(root,dir),{mode:0o700});
  cpSync(plugin,join(root,'plugin'),{recursive:true,filter:path=>path!==join(plugin,'remote-gui')&&!/^core(?:\.[0-9]+)?$/.test(basename(path))});
  cpSync(join(import.meta.dir,'fixtures/browser-check.ts'),join(root,'browser-check.ts'));
  const installedDigest=digest(join(root,'plugin'));
  const cert=join(root,'cert.pem'),key=join(root,'key.pem'),ca=join(root,'ca.pem'),caKey=join(root,'ca-key.pem');
  const csr=join(root,'leaf.csr'),extensions=join(root,'leaf.ext');
  writeFileSync(extensions,'subjectAltName=DNS:remote-gui.test\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  for(const args of [
   ['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=Remote GUI Fixture CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign','-keyout',caKey,'-out',ca],
   ['req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=remote-gui.test','-keyout',key,'-out',csr],
   ['x509','-req','-in',csr,'-CA',ca,'-CAkey',caKey,'-CAcreateserial','-days','1','-extfile',extensions,'-out',cert],
  ]){
   const generated=Bun.spawnSync(['/usr/bin/openssl',...args],{stdout:'pipe',stderr:'pipe'});
   check(generated.exitCode===0,'private TLS fixture could not be created');
  }
  chmodSync(key,0o600);chmodSync(caKey,0o600);
  const trust=join(root,'trust.pem');
  const inheritedTrust=[...new Set([process.env.SSL_CERT_FILE,process.env.NODE_EXTRA_CA_CERTS,'/etc/ssl/certs/ca-certificates.crt','/etc/pki/tls/certs/ca-bundle.crt','/etc/ssl/cert.pem'].filter((path):path is string=>Boolean(path)&&existsSync(path!)))].map(path=>readFileSync(path,'utf8')).join('\n');
  writeFileSync(trust,inheritedTrust+'\n'+readFileSync(ca,'utf8'));
  writeFileSync(join(root,'hosts'),readFileSync('/etc/hosts','utf8')+'\n127.0.0.1 remote-gui.test\n');
  const activation=readFileSync(join(plugin,'README.md'),'utf8').match(/```text\n([\s\S]*?)\n```/)?.[1];
  check(activation,'persistent activation instructions missing');
  const toolchain=Bun.spawnSync(['go','env','GOROOT'],{cwd:plugin}).stdout.toString().trim();
  const settings={scenario,activation,bun:process.execPath,helper:join(root,'plugin/scripts/remote-gui.sh'),key,cert,ca,playwright:process.env.REMOTE_GUI_PLAYWRIGHT_MODULE,chromium:process.env.REMOTE_GUI_CHROMIUM,firefox:process.env.REMOTE_GUI_FIREFOX,browserType:scenario==='identity-firefox'?'firefox':'chromium',nativeCLI:process.env.REMOTE_GUI_NATIVE_CLI};
  writeFileSync(join(root,'capabilities.json'),JSON.stringify(settings));
  const child=Bun.spawn(['/usr/bin/bwrap','--unshare-pid','--new-session','--die-with-parent','--ro-bind','/','/','--proc','/proc','--dev-bind','/dev','/dev','--bind',root,root,'--bind',build,build,'--ro-bind',join(root,'hosts'),'/etc/hosts','--ro-bind','/dev/null','/run/tailscale/tailscaled.sock','--chdir',root,'--',process.execPath,join(import.meta.dir,'fixtures/native-routing.ts')],{env:{...process.env,COPILOT_HOME:join(root,'n'),TMPDIR:join(root,'tmp'),GOTMPDIR:join(root,'tmp'),REMOTE_GUI_HOME:join(root,'s'),REMOTE_GUI_PROFILE_HOME:join(root,'profiles'),REMOTE_GUI_BUILD_CACHE:build,REMOTE_GUI_GO:join(toolchain,'bin/go'),GOCACHE:join(build,'go-cache'),REMOTE_GUI_TAILSCALE_SOCKET:join(root,'api.sock'),SSL_CERT_FILE:trust,NODE_EXTRA_CA_CERTS:trust},stdout:'pipe',stderr:'pipe'});
  const timer=setTimeout(()=>child.kill('SIGTERM'),210000);
  let exit:number;
  try{[exit]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])}finally{clearTimeout(timer)}
  const result=JSON.parse(readFileSync(join(root,'result.json'),'utf8'));
  check(digest(join(root,'plugin'))===installedDigest,'native agent changed the installed plugin');
  appendFileSync(join(tmpdir(),'remote-gui-routing-results.jsonl'),JSON.stringify({...result,installed_source_sha256:installedDigest})+'\n');
  if(result.result!=='passed')writeFileSync(join(tmpdir(),'remote-gui-routing-last-failure.json'),JSON.stringify(result,null,2));
  check(exit===0&&result.result==='passed','native routing fixture failed: '+scenario);
 }finally{rmSync(root,{recursive:true,force:true})}
},230000);
