import{dirname,join}from"node:path";
export async function nativeClient(host: "codex" | "claude", plugin: string, output: string, install=true) {
  const fs=await import("node:fs"),{homedir}=await import("node:os"),{resolve}=await import("node:path");
  if(fs.existsSync(output)&&fs.readdirSync(output).length)throw Error("native profile output is not empty");
  const market=join(output,"market"),profile=join(output,"control-profile"),name="vhco-triage-evaluation";
  fs.mkdirSync(profile,{recursive:true,mode:0o700});fs.mkdirSync(join(market,"plugins"),{recursive:true});
  fs.cpSync(resolve(plugin),join(market,"plugins/vh-adlc"),{recursive:true});
  fs.mkdirSync(join(market,".agents/plugins"),{recursive:true});fs.mkdirSync(join(market,".claude-plugin"),{recursive:true});
  fs.writeFileSync(join(market,".agents/plugins/marketplace.json"),JSON.stringify({name,plugins:[{name:"vh-adlc",source:{source:"local",path:"./plugins/vh-adlc"},policy:{installation:"AVAILABLE",authentication:"ON_INSTALL"},category:"Productivity"}]}));
  fs.writeFileSync(join(market,".claude-plugin/marketplace.json"),JSON.stringify({name,owner:{name:"Fixture owner"},plugins:[{name:"vh-adlc",source:"./plugins/vh-adlc"}]}));
  const env:Record<string,string>={PATH:process.env.PATH??"/usr/bin",HOME:homedir(),LANG:"C.UTF-8",TERM:"dumb",XDG_CACHE_HOME:join(output,"cache")};
  for(const name of ["HTTP_PROXY","HTTPS_PROXY","ALL_PROXY","NO_PROXY","SSL_CERT_FILE","SSL_CERT_DIR","NODE_EXTRA_CA_CERTS"])if(process.env[name])env[name]=process.env[name]!;
  if(host==="codex"){
    const executable=Bun.which("codex",{PATH:env.PATH});if(!executable)throw Error("Codex CLI is unavailable");
    const runtimeDirectory=dirname(fs.realpathSync(executable));env.PATH=`${runtimeDirectory}:${env.PATH}`;
    if(!Bun.which("codex-code-mode-host",{PATH:env.PATH}))throw Error("the installed Codex CLI's tool-routing runtime is unavailable");
    const auth=join(homedir(),".codex/auth.json");if(!fs.existsSync(auth))throw Error("existing Codex login is unavailable");
    fs.symlinkSync(auth,join(profile,"auth.json"));env.CODEX_HOME=profile;
  }else{
    env.CLAUDE_CONFIG_DIR=profile;
    const tokenPath=process.env.VH_ADLC_CLAUDE_TOKEN_FILE??join(homedir(),".config/vh-adlc/claude-token");
    if(fs.existsSync(tokenPath))env.CLAUDE_CODE_OAUTH_TOKEN=fs.readFileSync(tokenPath,"utf8").trim();
    else{
      const credentials=JSON.parse(fs.readFileSync(join(homedir(),".claude/.credentials.json"),"utf8"));
      const token=credentials.claudeAiOauth?.accessToken;
      if(typeof token!=="string"||!token)throw Error("existing Claude access token is unavailable");
      env.CLAUDE_CODE_OAUTH_TOKEN=token;
    }
    // No refresh token, MCP OAuth records, owner settings or owner plugin state is copied.
    fs.writeFileSync(join(profile,"settings.json"),JSON.stringify({includeCoAuthoredBy:false}));
  }
  const commands:{args:string[];exit_code:number;stdout:string;stderr:string}[]=[];
  const run=(args:string[])=>{
    const result=Bun.spawnSync(args,{cwd:output,env,stdout:"pipe",stderr:"pipe",timeout:60_000});
    commands.push({args,exit_code:result.exitCode??-1,stdout:result.stdout.toString(),stderr:result.stderr.toString()});
    if(result.exitCode!==0)throw Error(`native ${host} installation failed; inspect its local command log`);
    return result.stdout.toString();
  };
  let installed:string|null=null;
  try{
    run([host,"--version"]);
    if(!install){ /* Legacy baseline: no replacement plugin is installed or registered. */ }
    else if(host==="codex"){
      run(["codex","plugin","marketplace","add",market,"--json"]);
      installed=JSON.parse(run(["codex","plugin","add",`vh-adlc@${name}`,"--json"])).installedPath;
    }else{
      run(["claude","plugin","marketplace","add",market]);
      run(["claude","plugin","install",`vh-adlc@${name}`,"--json"]);
      const registry=JSON.parse(fs.readFileSync(join(profile,"plugins/installed_plugins.json"),"utf8"));
      const entry=registry.plugins?.[`vh-adlc@${name}`]?.[0];
      if(typeof entry?.installPath!=="string")throw Error("Claude installed payload identity is unavailable");
      installed=entry.installPath;
    }
    fs.writeFileSync(join(output,"installation.json"),JSON.stringify({host,installed,commands},null,2)+"\n");
  }catch(error){fs.writeFileSync(join(output,"installation.json"),JSON.stringify({host,commands},null,2)+"\n");throw error;}
  return {host,env,profile,market,installed,commands};
}
