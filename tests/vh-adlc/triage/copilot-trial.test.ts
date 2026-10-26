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
