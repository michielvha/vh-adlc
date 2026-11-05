import {test} from 'bun:test';
import {join} from 'node:path';

test.skipIf(process.env.REMOTE_GUI_SSH_E2E!=='1')('loopback browser input and reattachment work through an authenticated SSH tunnel',async()=>{
 const child=Bun.spawn(['python3',join(import.meta.dir,'fixtures/ssh-tunnel.py')],{env:{...process.env,REMOTE_GUI_BUN:process.execPath},stdout:'pipe',stderr:'pipe'});
 const timer=setTimeout(()=>child.kill('SIGTERM'),90000);
 try{
  const [exit,out]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
  if(exit!==0)throw Error('disposable SSH verification failed; no credentials printed');
  const result=JSON.parse(out);
  if(result.result!=='passed'||!result.ssh_viewer||!result.same_browser||!result.tunnel_required||!result.private_host_key_verified||!result.real_host_ssh_config_untouched||result.authenticated_ssh_channels<1)throw Error('SSH tunnel verification incomplete');
 }finally{clearTimeout(timer)}
},120000);
