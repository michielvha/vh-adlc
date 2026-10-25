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
