import {test} from 'bun:test';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,statSync,utimesSync,writeFileSync} from 'node:fs';
import {dirname,join,relative} from 'node:path';

// Runs the actual CLI with real GUI tools under a temporary HOME, so the
// default profile store and synthetic auth-refresh trees are both disposable.
const enabled=process.env.REMOTE_GUI_BROWSER_E2E==='1'&&Boolean(process.env.REMOTE_GUI_TEST_BINARY);
const check=(condition:unknown,message:string)=>{if(!condition)throw Error(message)};

test.skipIf(!enabled)('profile commands leave auth-refresh files unread and unchanged',async()=>{
 // A short HOME keeps the default session socket paths within the Unix limit.
 const home=mkdtempSync('/tmp/rgp');
 const env:Record<string,string|undefined>={...process.env,HOME:home};
 for(const key of ['XDG_STATE_HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','REMOTE_GUI_HOME','REMOTE_GUI_PROFILE_HOME','AUTH_REFRESH_CONFIG','AUTH_REFRESH_HOME'])delete env[key];
 const binary=process.env.REMOTE_GUI_TEST_BINARY!;
 const cli=(...args:string[])=>{
  const result=Bun.spawnSync([binary,...args],{env});
  let output:any={};
  try{output=JSON.parse(result.stdout.toString())}catch{}
  return {code:result.exitCode,output};
 };
 const ready=(...args:string[])=>{
  const {code,output}=cli('start',...args,'--transport','loopback','--ttl','3m','--browser-mode','agent','--agent-start-approved');
  check(code===0&&output.result==='ready'&&output.local_cdp,'profile start failed: '+(output.diagnostic||output.result));
  return output;
 };
 const stop=(id:string)=>{const {output}=cli('stop',id);check(output.state==='stopped','stop did not report stopped: '+output.state)};
 const configTree=join(home,'.config','auth-refresh'),stateTree=join(home,'.local','share','auth-refresh');
 const sentinels=[join(configTree,'config.yaml'),join(stateTree,'lanes','work','Default','Cookies')];
 const recorded=sentinels.map((path,index)=>{
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const content='auth-refresh sentinel '+index+'; never read';
  writeFileSync(path,content,{mode:0o600});
  const mtime=Date.now()/1000-60;
  // atime before mtime: under relatime any read updates the access time.
  // Nothing here reads the file before the final stat.
  utimesSync(path,mtime-3600,mtime);
  const stat=statSync(path);
  return {path,hash:createHash('sha256').update(content).digest('hex'),atime:stat.atimeMs,mtime:stat.mtimeMs};
 });
 const seen=new Map<string,string>();
 const fixture=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/set')return new Response('<!doctype html><title>fixture-set</title>',{headers:{'content-type':'text/html','set-cookie':'pers=1; Max-Age=86400; Path=/'}});
  if(url.pathname==='/check'){seen.set(url.searchParams.get('n')||'',request.headers.get('cookie')||'');return new Response('<!doctype html><title>fixture-check</title>',{headers:{'content-type':'text/html'}})}
  return new Response('missing',{status:404});
 }});
 const openTab=async(cdp:string,target:string,title:string)=>{
  await fetch(cdp+'/json/new?'+target,{method:'PUT'});
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
   const pages:any[]=await (await fetch(cdp+'/json/list')).json();
   if(pages.some(page=>page.url===target&&page.title===title))return;
   await Bun.sleep(50);
  }
  throw Error('fixture tab did not load');
 };
 const origin=`http://127.0.0.1:${fixture.port}`;
 try{
  const first=ready('--profile','t-reuse');
  check(first.profile==='t-reuse','session did not name its profile');
  const store=join(home,'.local','state','remote-gui','profiles');
  check(existsSync(join(store,'t-reuse','meta.json')),'default profile store was not used');
  for(const tree of [configTree,stateTree]){
   const path=relative(tree,store);
   check(path.startsWith('..'),'default profile store lies inside an auth-refresh tree');
  }
  await openTab(first.local_cdp,origin+'/set','fixture-set');
  const cookieSet=Date.now();

  const raced=await Promise.all([0,1].map(async()=>{
   const child=Bun.spawn([binary,'start','--profile','t-race','--transport','loopback','--ttl','3m'],{env,stdout:'pipe'});
   const [code,text]=await Promise.all([child.exited,new Response(child.stdout).text()]);
   let output:any={};try{output=JSON.parse(text)}catch{}
   return {code,output};
  }));
  const winner=raced.find(run=>run.code===0),loser=raced.find(run=>run.code!==0);
  check(winner&&loser&&/profile-in-use/.test(loser.output.diagnostic||''),'concurrent starts did not give one success and one profile-in-use');
  check(/holder: (starting|[0-9a-f]{32})/.test(loser.output.diagnostic),'profile-in-use did not name the holder');

  const listed=cli('profile','list');
  check(listed.code===0,'profile list failed');
  const byName=new Map((listed.output.profiles||[]).map((entry:any)=>[entry.name,entry]));
  const reuse:any=byName.get('t-reuse'),race:any=byName.get('t-race');
  check(reuse?.in_use===true&&reuse.holder_session===first.id&&reuse.transport==='loopback'&&reuse.created&&reuse.last_used,'profile list lacks the in-use profile and its holder');
  check(race?.in_use===true&&race.holder_session===winner!.output.id,'profile list lacks the raced profile holder');
  const busy=cli('profile','delete','t-reuse');
  check(busy.code!==0&&/profile-in-use/.test(busy.output.diagnostic||''),'profile delete removed a profile in use');
  stop(winner!.output.id);

  await Bun.sleep(Math.max(0,cookieSet+31000-Date.now()));
  stop(first.id);
  const second=ready('--profile','t-reuse');
  await openTab(second.local_cdp,origin+'/check?n=1','fixture-check');
  check((seen.get('1')||'').includes('pers=1'),'persistent cookie did not reach the reused profile');
  stop(second.id);

  for(const name of ['t-reuse','t-race']){
   const deleted=cli('profile','delete',name);
   check(deleted.code===0&&deleted.output.result==='deleted','profile delete failed: '+name);
   check(!existsSync(join(store,name)),'deleted profile remains: '+name);
  }
  const again=cli('profile','delete','t-reuse');
  check(again.code===0&&again.output.result==='missing','repeated delete did not report missing');

  for(const sentinel of recorded){
   const stat=statSync(sentinel.path);
   check(stat.atimeMs===sentinel.atime&&stat.mtimeMs===sentinel.mtime,'auth-refresh sentinel was read or touched');
   check(createHash('sha256').update(readFileSync(sentinel.path)).digest('hex')===sentinel.hash,'auth-refresh sentinel changed');
  }
 }finally{
  fixture.stop(true);
  const status=cli('status');
  for(const session of status.output.sessions||[])if(!['stopped','failed'].includes(session.state))cli('stop',session.id);
  rmSync(home,{recursive:true,force:true});
 }
},240000);
