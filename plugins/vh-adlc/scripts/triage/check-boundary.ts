import{realpathSync}from"node:fs";

// Selected checks see only their fixed source copy, system tools and private tmp.
// The operator chooses argv; repository/issue text never controls this launcher.
export function checkBoundary(checkout:string,argv:string[]){
 const executable=process.platform==="linux"?Bun.which("bwrap",{PATH:"/usr/bin:/bin"}):null;
 if(!executable)throw Error("isolated verification unavailable: Linux and system Bubblewrap are required");
 const bun=realpathSync(process.execPath),command=[...argv];
 if(command[0]==="bun"||command[0]===process.execPath||command[0]===bun)command[0]="/runtime/bun";
 return[executable,"--unshare-all","--unshare-net","--new-session","--die-with-parent",
  "--ro-bind","/usr","/usr","--symlink","usr/bin","/bin","--symlink","usr/lib","/lib","--symlink","usr/lib64","/lib64",
  "--proc","/proc","--dev","/dev","--tmpfs","/tmp","--dir","/tmp/home","--dir","/tmp/config","--dir","/tmp/cache","--dir","/tmp/tmp",
  "--dir","/runtime","--ro-bind",bun,"/runtime/bun","--bind",checkout,"/work","--chdir","/work","--clearenv",
  "--setenv","PATH","/runtime:/usr/bin","--setenv","LANG","C.UTF-8","--setenv","HOME","/tmp/home",
  "--setenv","XDG_CONFIG_HOME","/tmp/config","--setenv","XDG_CACHE_HOME","/tmp/cache","--setenv","TMPDIR","/tmp/tmp",
  "--setenv","GIT_CONFIG_NOSYSTEM","1","--setenv","GIT_CONFIG_GLOBAL","/dev/null","--setenv","GIT_TERMINAL_PROMPT","0","--",...command];
}
