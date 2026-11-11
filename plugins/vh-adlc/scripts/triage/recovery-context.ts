import{readFileSync,writeFileSync}from"node:fs";
import{createHash}from"node:crypto";
import{join}from"node:path";
import type{Report}from"./report";
export function recoveryVerdicts(report:Report){return report.rows.map(({number,state,remaining,ownership,disposition,depends_on,duplicate_of,closure_reason})=>({number,state,remaining,ownership,disposition,depends_on,duplicate_of,closure_reason}));}
// Prior wording is context for independent comparison, never proof or authority.
export function prepareRecoveryContext(input:string,batchHash:string,report:Report){
 if(!/^[a-f0-9]{64}$/.test(batchHash))throw Error("invalid original recovery batch");
 const context={schema_version:1,batch_hash:batchHash,trusted_as_proof:false,verdicts:recoveryVerdicts(report)},bytes=JSON.stringify(context,null,2)+"\n";
 writeFileSync(join(input,"recovery-context.json"),bytes,{flag:"wx",mode:0o600});
 const path=join(input,"manifest.json"),manifest=JSON.parse(readFileSync(path,"utf8"));manifest.recovery={batch_hash:batchHash,sha256:createHash("sha256").update(bytes).digest("hex")};writeFileSync(path,JSON.stringify(manifest,null,2)+"\n");return context;
}
