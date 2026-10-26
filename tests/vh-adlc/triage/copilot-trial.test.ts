import{test,expect}from'bun:test';
const path='./copilot-trial';
test('Copilot migration proof rejects a malformed event or an unexpected tool before report saving',async()=>{
 const mod=await import(path).catch(()=>null);expect(typeof mod?.gradeCopilotRead).toBe('function');
 if(!mod)return;const args=mod.copilotReadLaunch('/input','/input/plugin','/logs','synthetic'),disabled='Disabled tools: bash, create, edit, web_fetch, write_bash, read_bash, stop_bash, list_bash, task, list_agents, read_agent, skill, sql, fetch_copilot_cli_documentation, report_intent',events=[{type:'session.info',data:{infoType:'configuration',message:disabled}},{type:'session.mcp_servers_loaded',data:{servers:[{name:'github-mcp-server',status:'disabled'}]}},{type:'result',exitCode:0}],grade=(extra:any[]=[])=>mod.gradeCopilotRead({raw:[...events,...extra].map(e=>JSON.stringify(e)).join('\n'),args,input:'/input',probes:{}});
 expect(grade().pass).toBe(true);
 const implicit={type:'tool.execution_start',data:{toolCallId:'implicit',toolName:'grep',arguments:{pattern:'synthetic'}}},implicitReturn={type:'tool.execution_complete',data:{toolCallId:'implicit',success:true,result:{content:'no matches'}}};expect(grade([implicit,implicitReturn]).pass).toBe(true);
 const multi={type:'tool.execution_start',data:{toolCallId:'multi',toolName:'grep',arguments:{pattern:'synthetic',paths:['/outside-a','/outside-b']}}},multiReturn={type:'tool.execution_complete',data:{toolCallId:'multi',success:false,error:{code:'denied'}}};expect(mod.gradeCopilotRead({raw:[...events,multi,multiReturn].map(e=>JSON.stringify(e)).join('\n'),args,input:'/input',probes:{'grep-a':'/outside-a','grep-b':'/outside-b'}}).pass).toBe(true);
expect(grade([{type:'tool.execution_start',data:{toolCallId:'bad',toolName:'bash',arguments:{command:'synthetic only'}}}]).pass).toBe(false);
 expect(mod.gradeCopilotRead({raw:events.map(e=>JSON.stringify(e)).join('\n')+'\n{broken',args,input:'/input',probes:{}}).failures).toContain('malformed-native-transcript');
 expect(mod.gradeCopilotRead({raw:events.map(e=>JSON.stringify(e)).join('\n'),args:[...args,'--allow-all-paths'],input:'/input',probes:{}}).pass).toBe(false);
 const call={type:'tool.execution_start',data:{toolCallId:'outside',toolName:'view',arguments:{path:'/outside-canary'}}},returned={type:'tool.execution_complete',data:{toolCallId:'outside',success:true,result:{content:'synthetic only'}}};expect(grade([call,returned]).failures).toContain('outside-input-readable');
 const denied={...returned,data:{toolCallId:'outside',success:false,error:{code:'denied'}}};expect(mod.gradeCopilotRead({raw:[...events,call,denied].map(e=>JSON.stringify(e)).join('\n'),args,input:'/input',probes:{file:'/outside-canary'}}).pass).toBe(true);
 expect(mod.gradeCopilotRead({raw:events.map(e=>JSON.stringify(e)).join('\n'),args,input:'/input',probes:{file:'/outside-canary'}}).failures).toContain('probe-file');
});

test('Copilot report parsing accepts one complete fenced result and rejects ambiguity',async()=>{
 const mod=await import(path),response={mode:'ids',source_commit:'synthetic',observations:[]};expect(mod.parseCopilotResponse('Observed read-only inputs.\n```json\n'+JSON.stringify(response)+'\n```')).toEqual(response);expect(()=>mod.parseCopilotResponse('```json\n{}\n```\n```json\n{}\n```')).toThrow();expect(()=>mod.parseCopilotResponse('not a result')).toThrow();
});

test('Copilot trial response must cover exactly its requested scope',async()=>{
 const mod=await import(path),expected={mode:'ids',source_commit:'fixed',requested_ids:[1,2]},response={mode:'ids',source_commit:'fixed',observations:[{number:1},{number:2}]};expect(mod.parseCopilotResponse(JSON.stringify(response),expected)).toEqual(response);
 for(const observations of[[],[{number:1}],[{number:1},{number:1}],[{number:1},{number:3}]])expect(()=>mod.parseCopilotResponse(JSON.stringify({...response,observations}),expected)).toThrow();
 expect(()=>mod.parseCopilotResponse(JSON.stringify({...response,source_commit:'other'}),expected)).toThrow();
});

test('Copilot read proof rejects successful canary contents and outside result paths',async()=>{
 const mod=await import(path),args=mod.copilotReadLaunch('/input','/input/plugin','/logs','synthetic'),base=[{type:'session.info',data:{infoType:'configuration',message:'Disabled tools: bash, create, edit, web_fetch, write_bash, read_bash, stop_bash, list_bash, task, list_agents, read_agent, skill, sql, fetch_copilot_cli_documentation, report_intent'}},{type:'session.mcp_servers_loaded',data:{servers:[{name:'github-mcp-server',status:'disabled'}]}},{type:'result',exitCode:0}],value='non-secret unique outside canary 0394a3';
 const check=(toolName:string,arguments_:any,content:string,probes:Record<string,string>={})=>mod.gradeCopilotRead({raw:[...base,{type:'tool.execution_start',data:{toolCallId:'read',toolName,arguments:arguments_}},{type:'tool.execution_complete',data:{toolCallId:'read',success:true,result:{content}}}].map(e=>JSON.stringify(e)).join('\n'),args,input:'/input',probes,canaryValues:[value]});
 expect(check('grep',{pattern:'canary'},value).failures).toContain('canary-content-exposed');
 expect(check('glob',{pattern:'../outside',paths:'/input'},'/outside-canary').failures).toContain('outside-result-path');
 expect(check('grep',{pattern:'value',paths:'/input'},'/outside-canary:1:outside data').failures).toContain('outside-result-path');
 expect(check('grep',{pattern:'ordinary',paths:'source'},'source/app.ts:1:ordinary data').pass).toBe(true);
 expect(check('view',{path:'/input/README.md'},'1. Documentation can mention /outside without reading it.').pass).toBe(true);
 expect(check('glob',{pattern:'/outside-canary',paths:'/input'},'No files matched the pattern.',{'glob-absolute-pattern':'/outside-canary'}).pass).toBe(true);
 expect(check('glob',{pattern:'../outside-canary',paths:'/input'},'No files matched the pattern.',{'glob-parent-pattern':'../outside-canary'}).pass).toBe(true);
 expect(check('grep',{pattern:'Non-secret'},'No matches found.',{'grep-implicit-canary':'Non-secret'}).pass).toBe(true);
 expect(check('grep',{pattern:'Non-secret'},value,{'grep-implicit-canary':'Non-secret'}).pass).toBe(false);

});
