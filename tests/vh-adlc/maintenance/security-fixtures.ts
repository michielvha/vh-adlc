import { canonicalJSON, digest } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { evidenceBinding } from "../../../plugins/vh-adlc/scripts/maintenance/security";
import type { SecurityInput, Decision, Evidence, Target } from "../../../plugins/vh-adlc/scripts/maintenance/security";
export function securityInput(): SecurityInput {
  return { schema_version:1, run_id:"12345678-1234-4234-8234-123456789abc", hostname:"github.com", repository:"example/project", source_commit:"a".repeat(40),
    evaluated_at:"2026-11-05T12:00:00Z", collected_at:"2026-11-05T10:00:00Z", collection_revision:1, inventory_digest:"a".repeat(64), scope:{repositories:["example/project"],filters:["dependabot"],exclusions:[]},
    policy:[{path:"security.md",digest:"b".repeat(64)}], policy_assessment:{ reviewer:"operator", reference:"local:policy-check", assessed_at:"2026-11-05T11:00:00Z" },
    coverage:[{hostname:"github.com",repository:"example/project",surface:"dependabot",status:"complete",count:1,reason:null,handoff:null,synthetic:false}],
    observations:[{id:"github.com/example/project/dependabot:1",hostname:"github.com",repository:"example/project",surface:"dependabot",provider_id:"1",provider_state:"open",target:{kind:"source",reference:"a".repeat(40) as string|null,platform:"unknown"},
      package:"widget",ecosystem:"npm",version:"1.0",location:"package-lock.json",severity:"high",advisory_ids:["CVE-2026-1234"],affected_range:"<1.1",fixed_versions:["1.1"],relationship:"transitive",dependency_scope:"runtime",rule:null as string|null,
      observed_at:"2026-11-05T10:00:00Z",raw_digest:"c".repeat(64),raw_reference:"local:raw",complete:true,synthetic:false,reactivated:false}],
    evidence:[],decisions:[],groups:[] };
}
export function decision(input:SecurityInput): Decision {
  return {id:input.observations[0].id,change:"unknown",outcome:"open",follow_up:{reference:"local:task",owner:null,assignment_handoff:"local:assignment",next_action:"investigate parent range"},delivery_required:false,delivery_evidence:[],exception:null,successor:null};
}
export function proof(input:SecurityInput,kind:Evidence["kind"],result:string,target:Target=input.observations[0].target): Evidence {
  return {id:kind,kind,result,occurrence_id:input.observations[0].id,target:structuredClone(target),binding:evidenceBinding(input.source_commit,input.policy,input.scope,target),reference:"local:proof",digest:digest(canonicalJSON({kind,result})),observed_at:"2026-11-05T11:00:00Z",complete:true,synthetic:false};
}
