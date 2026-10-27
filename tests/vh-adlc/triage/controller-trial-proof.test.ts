import{test,expect}from"bun:test";
import{controllerTrialPass}from"./controller-trial-proof";
const valid=()=>({scenario:"recover",preserved:true,component_unchanged:true,gh_proof:true,prepared:true,first:{grade:true,interrupted:true,completed:["explain"],failed:[],blocked:[]},final:{stage:"finished",exit:0,grade:true,completed:["explain","close"],failed:[],blocked:[]},effects:[{method:"POST",endpoint:"repos/example/project/issues/1/comments",payload:{body:"Approved"}},{method:"PATCH",endpoint:"repos/example/project/issues/1",payload:{state:"closed",state_reason:"completed"}}],approved_comment:"Approved",issue_closed:true});
test("managed native acceptance requires exact effects, original recovery and preserved inputs",()=>{
 expect(controllerTrialPass(valid())).toBe(true);
 for(const change of ["source","duplicate","failed","recovery","prepared","payload","first-grade"]){
  const trial=valid();if(change==="source")trial.preserved=false;if(change==="duplicate")trial.effects.unshift(trial.effects[0]);if(change==="failed")trial.final.failed=["close"];if(change==="recovery")trial.first.interrupted=false;if(change==="prepared")trial.prepared=false;if(change==="payload")trial.effects[0].payload.body="Changed";
  if(change==="first-grade")trial.first.grade=false;expect(controllerTrialPass(trial)).toBe(false);
 }
});

test("an uncertain native attempt needs original receipt reconciliation, never another comment",()=>{
 const trial=valid();trial.scenario="uncertain";trial.first.completed=[];trial.first.failed=["explain"];
 expect(controllerTrialPass(trial)).toBe(true);trial.effects.unshift(trial.effects[0]);expect(controllerTrialPass(trial)).toBe(false);
});

test("native outcomes come from captured exits, controller responses and fake effects",async()=>{
 const artifacts=await import("./controller-artifacts"),facts=(artifacts as Record<string,any>).controllerOutcomeFacts;expect(typeof facts).toBe("function");
 const execution={completed:["explain"],failed:[],blocked:[]},recovery={completed:["explain","close"],failed:[],blocked:[]};
 const events={first:[{grade:{pass:true}},{id:"batch",result:{actions:[{id:"explain",body:"Approved"}]}},{id:"execute",result:execution},{kind:"owned-controller-exit",pid:101,code:null,signal:"SIGKILL"}],final:[{grade:{pass:true}},{recovery},{kind:"owned-controller-exit",pid:102,code:0,signal:null}]},api={issues:[{number:1,state:"closed"}],trace:valid().effects};
 const derived=facts(events,api);expect(derived.first.interrupted).toBe(true);expect(derived.final.completed).toEqual(recovery.completed);expect(derived.final.stage).toBe("finished");expect(derived.effects).toEqual(api.trace);expect(derived.issue_closed).toBe(true);
 const changed=structuredClone(events);changed.first[3]={kind:"owned-controller-exit",pid:101,code:0,signal:null};expect(facts(changed,api).first.interrupted).toBe(false);
 expect(()=>facts({...events,final:events.final.slice(0,-1)},api)).toThrow("owned controller exit unavailable");
});
