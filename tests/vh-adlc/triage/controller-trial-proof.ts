export function controllerTrialPass(trial:any){
 const final=trial.final,first=trial.first;
 if(!["normal","recover","uncertain"].includes(trial.scenario))return false;
 if(!trial.preserved||!trial.component_unchanged||!trial.gh_proof||!trial.prepared||!trial.issue_closed||!final||final.exit!==0||final.stage!=="finished"||!final.grade||JSON.stringify(final.completed)!==JSON.stringify(["explain","close"])||final.failed?.length||final.blocked?.length)return false;
 if(trial.scenario==="uncertain"&&(!first?.interrupted||!first.grade||first.completed?.length||JSON.stringify(first.failed)!==JSON.stringify(["explain"])||first.blocked?.length))return false;
 if(trial.scenario==="recover"&&(!first?.interrupted||!first.grade||JSON.stringify(first.completed)!==JSON.stringify(["explain"])||first.failed?.length||first.blocked?.length))return false;
 return JSON.stringify(trial.effects)===JSON.stringify([{method:"POST",endpoint:"repos/example/project/issues/1/comments",payload:{body:trial.approved_comment}},{method:"PATCH",endpoint:"repos/example/project/issues/1",payload:{state:"closed",state_reason:"completed"}}]);
}
