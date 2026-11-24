import {existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

// A separate private display is needed for browser UI zoom accelerators. It never
// shares the remote browser's Xauthority, display or profile.
export async function startViewerDisplay(root:string){
 const authority=join(root,'viewer-Xauthority');writeFileSync(authority,'',{mode:0o600});
 for(let attempt=0;attempt<32;attempt++){
  const number=51000+(process.pid+attempt*17)%1000;
  if(existsSync('/tmp/.X'+number+'-lock')||existsSync('/tmp/.X11-unix/X'+number))continue;
  const cookie=crypto.randomUUID().replaceAll('-','');
  const auth=Bun.spawnSync([process.env.REMOTE_GUI_XAUTH||'xauth','-f',authority],{stdin:Buffer.from('add :'+number+' . '+cookie+'\n'),env:process.env});
  if(auth.exitCode!==0)throw Error('private viewer display authority unavailable');
  const child=Bun.spawn([process.env.REMOTE_GUI_XVFB||'Xvfb',':'+number,'-screen','0','1440x1200x24','-nolisten','tcp','-auth',authority],{stdout:'ignore',stderr:'ignore',env:process.env});
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)break;
   if(existsSync('/tmp/.X11-unix/X'+number))return {
    env:{...process.env,DISPLAY:':'+number,XAUTHORITY:authority},
    async stop(){if(child.exitCode===null)child.kill('SIGTERM');await child.exited},
   };
   await Bun.sleep(20);
  }
  if(child.exitCode===null)child.kill('SIGTERM');await child.exited;
 }
 throw Error('private viewer display unavailable');
}
