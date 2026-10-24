// Kernel locks release when their owning process exits, including SIGKILL. Keep
// the inode in place: unlinking a lock can let two writers lock different files.
export async function executionLock(path:string){
 const executable=Bun.which("flock");if(!executable)throw Error("execution locking unavailable: install flock before applying a batch");
 const child=Bun.spawn([executable,"--exclusive","--nonblock","--conflict-exit-code","75","--no-fork",path,process.execPath,"-e",'process.stdout.write("locked\\n");await Bun.stdin.text();'],{stdin:"pipe",stdout:"pipe",stderr:"pipe"});
 const reader=child.stdout.getReader();let ready="";
 try{
  while(!ready.includes("\n")&&ready.length<64){const next=await reader.read();if(next.done)break;ready+=new TextDecoder().decode(next.value);}
  if(ready!=="locked\n"){
   const exit=await child.exited;throw Error(exit===75?"triage execution journal is locked":"execution locking unavailable");
  }
 }catch(error){child.stdin.end();child.kill();await child.exited;throw error;}
 finally{reader.releaseLock();}
 return async()=>{child.stdin.end();const exit=await child.exited;if(exit!==0)throw Error("execution lock keeper failed");};
}
