// The controller owns one detached process group. Never signal by process name.
export async function runOwnedClient(argv:string[],options:{cwd:string;env:Record<string,string>;stdout:string;stderr:string;started?:(pid:number)=>void},limits={timeout_ms:12*60_000,grace_ms:500,reap_ms:2000}){
 const child=Bun.spawn(argv,{cwd:options.cwd,env:options.env,stdout:Bun.file(options.stdout),stderr:Bun.file(options.stderr),stdin:"ignore",detached:true});
 const signals:{signal:"SIGTERM"|"SIGKILL";accepted:boolean}[]=[];
 const signal=(value:"SIGTERM"|"SIGKILL")=>{let accepted=false;try{process.kill(-child.pid,value);accepted=true;}catch{}signals.push({signal:value,accepted});return accepted;};
 async function wait(milliseconds:number){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([child.exited.then(exit=>({exit})),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),milliseconds);})]);}finally{clearTimeout(timer);}}
 try{options.started?.(child.pid);}catch(error){signal("SIGTERM");await wait(limits.grace_ms);signal("SIGKILL");await wait(limits.reap_ms);throw error;}
 const first=await wait(limits.timeout_ms),timedOut=first===null;
 // Even a successful parent can leave a driver or helper behind in its group.
 if(signal("SIGTERM")){await Bun.sleep(limits.grace_ms);signal("SIGKILL");}
 const final=first??await wait(limits.reap_ms);
 return{exit_code:final?.exit??-1,timed_out:timedOut,reaped:final!==null,signals};
}
