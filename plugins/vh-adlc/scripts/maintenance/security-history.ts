import { canonicalJSON, digest, runID } from "./journal";
import { parseSecurityInput, validateSecuritySnapshot, evidenceBinding, type SecurityInput, type SecuritySnapshot } from "./security";
import * as v from "./security-value";

export type SecurityRevision = { schema_version:1; kind:"maintenance-security-revision-v1"; run_id:string; snapshot_revision:number;
  collection_revision:number; collection_digest:string; original_projection_digest:string|null; previous_snapshot_digest:string|null; snapshot:SecuritySnapshot; digest:string };
function retainsRun(previous:SecuritySnapshot,next:SecuritySnapshot):boolean {
  return previous.input.hostname===next.input.hostname&&previous.input.repository===next.input.repository&&canonicalJSON(previous.input.scope)===canonicalJSON(next.input.scope)&&
    previous.input.observations.every(o=>next.input.observations.some(n=>n.id===o.id));
}
export function createSecurityRevision(value:SecuritySnapshot,previous:SecurityRevision|null,projection:string|null=null):SecurityRevision {
  const snapshot=validateSecuritySnapshot(value);
  if(previous) {
    validateSecurityRevision(previous);
    if(previous.run_id!==snapshot.input.run_id || snapshot.input.collection_revision<previous.collection_revision) throw Error("snapshot run/collection revision changed");
    if(snapshot.input.collection_revision===previous.collection_revision && snapshot.input.inventory_digest!==previous.collection_digest) throw Error("collection revision has conflicting bytes");
    if(canonicalJSON(snapshot.input.scope)!==canonicalJSON(previous.snapshot.input.scope))throw Error("snapshot run scope changed; use a linked new run");
    if(!retainsRun(previous.snapshot,snapshot))throw Error("snapshot run identity or prior occurrences changed");
  }
  const row={schema_version:1 as const,kind:"maintenance-security-revision-v1" as const,run_id:snapshot.input.run_id,snapshot_revision:previous?previous.snapshot_revision+1:1,
    collection_revision:snapshot.input.collection_revision,collection_digest:snapshot.input.inventory_digest,original_projection_digest:previous?previous.original_projection_digest:projection,
    previous_snapshot_digest:previous?.digest??null,snapshot};
  return {...row,digest:digest(canonicalJSON(row))};
}
export function validateSecurityRevision(value:unknown):SecurityRevision {
  const r=v.record(value,["schema_version","kind","run_id","snapshot_revision","collection_revision","collection_digest","original_projection_digest","previous_snapshot_digest","snapshot","digest"]);
  if(r.schema_version!==1||r.kind!=="maintenance-security-revision-v1") throw Error("unsupported security snapshot revision schema");
  const snapshot=validateSecuritySnapshot(r.snapshot),revision=v.integer(r.snapshot_revision,1),previous=r.previous_snapshot_digest===null?null:v.hash(r.previous_snapshot_digest);
  const row={schema_version:1 as const,kind:"maintenance-security-revision-v1" as const,run_id:runID(r.run_id),snapshot_revision:revision,
    collection_revision:v.integer(r.collection_revision,1),collection_digest:v.hash(r.collection_digest),original_projection_digest:r.original_projection_digest===null?null:v.hash(r.original_projection_digest),previous_snapshot_digest:previous,snapshot};
  if(row.run_id!==snapshot.input.run_id||row.collection_revision!==snapshot.input.collection_revision||row.collection_digest!==snapshot.input.inventory_digest||
    (revision===1)!==(previous===null)||digest(canonicalJSON(row))!==r.digest) throw Error("security snapshot revision binding mismatch");
  return {...row,digest:v.hash(r.digest)};
}
export function readSecurityRevisions(markdown:string):SecurityRevision[] {
  const markers=[...markdown.matchAll(/^```maintenance-security-v1\s*$/gm)];
  const blocks=[...markdown.matchAll(/^```maintenance-security-v1\s*\n([\s\S]*?)\n```[ \t]*$/gm)];
  if(markers.length!==blocks.length) throw Error("malformed security snapshot block");
  return blocks.map(block=>validateSecurityRevision(JSON.parse(block[1])));
}
export function selectSecurityChain(values:SecurityRevision[]):{latest:SecurityRevision|null;gaps:string[]} {
  const rows=values.map(validateSecurityRevision).sort((a,b)=>a.snapshot_revision-b.snapshot_revision),gaps:string[]=[];
  let latest:SecurityRevision|null=null;
  const versions=new Set<number>();
  for(const row of rows) {
    if(versions.has(row.snapshot_revision)) {gaps.push("forked snapshot revision");continue;} versions.add(row.snapshot_revision);
    if((latest===null && row.snapshot_revision!==1)||(latest && (row.run_id!==latest.run_id||row.snapshot_revision!==latest.snapshot_revision+1||row.previous_snapshot_digest!==latest.digest||row.original_projection_digest!==latest.original_projection_digest||row.collection_revision<latest.collection_revision||
      row.collection_revision===latest.collection_revision && row.collection_digest!==latest.collection_digest||!retainsRun(latest.snapshot,row.snapshot)))) {gaps.push("missing or conflicting snapshot predecessor");continue;}
    latest=row;
  }
  return {latest,gaps:[...new Set(gaps)]};
}

/** Union history per occurrence; a newer narrow report never deletes another scope's pending work. */
export function mergeSecurityHistory(value:unknown,revisions:SecurityRevision[],resolutions:unknown=[]):{input:SecurityInput;gaps:string[];provenance:string[]} {
  const input=parseSecurityInput(value),byRun=new Map<string,SecurityRevision[]>(),gaps:string[]=[],provenance:string[]=[];
  for(const raw of revisions) {const row=validateSecurityRevision(raw);byRun.set(row.run_id,[...(byRun.get(row.run_id)??[]),row]);}
  const current=new Map(input.observations.map(o=>[o.id,o])),decisions=new Map(input.decisions.map(d=>[d.id,d])),proofs=new Map(input.evidence.map(e=>[e.id,e]));
  const priorStates=new Map<string,Set<string>>();
  const priorDigests=new Map<string,Set<string>>();
  for(const rows of byRun.values()) {
    const chain=selectSecurityChain(rows);gaps.push(...chain.gaps);if(!chain.latest)continue;
    const snapshot=chain.latest.snapshot,old=snapshot.input;provenance.push(chain.latest.digest);
    if(old.hostname!==input.hostname)continue;
    const comparable=canonicalJSON(old.scope.filters)===canonicalJSON(input.scope.filters)&&canonicalJSON(old.scope.exclusions)===canonicalJSON(input.scope.exclusions);
    for(const occurrence of old.observations) {
      if(!input.scope.repositories.includes(occurrence.repository)||input.scope.filters.length && !input.scope.filters.includes(occurrence.surface))continue;
      const previousState=snapshot.findings.find(f=>f.occurrence.id===occurrence.id);
      const key=digest(canonicalJSON({target:occurrence.target,remediation:previousState?.remediation,exception:previousState?.exception,target_lifecycle:previousState?.target_lifecycle}));
      const states=priorStates.get(occurrence.id)??new Set();states.add(key);priorStates.set(occurrence.id,states);
      const digests=priorDigests.get(occurrence.id)??new Set<string>();digests.add(chain.latest.digest);priorDigests.set(occurrence.id,digests);
      // Imported absence is not a new scan. Positive current verification is required to close it.
      if(!current.has(occurrence.id))current.set(occurrence.id,{...occurrence,complete:false});
      if(!comparable)gaps.push(`historical scope reassessment: ${occurrence.id}`);
      if(!decisions.has(occurrence.id)) {const d=old.decisions.find(d=>d.id===occurrence.id);if(d)decisions.set(d.id,d);}
      for(const evidence of old.evidence.filter(e=>e.occurrence_id===occurrence.id)) {
        const existing=proofs.get(evidence.id);
        if(!existing)proofs.set(evidence.id,evidence);
        else if(canonicalJSON(existing)!==canonicalJSON(evidence))gaps.push(`historical evidence conflict: ${occurrence.id}`);
      }
    }
  }
  const acknowledged=new Set<string>();
  for(const raw of v.list(resolutions)){
    const r=v.record(raw,["occurrence_id","prior_digests","evidence_id"]),id=v.text(r.occurrence_id),named=v.strings(r.prior_digests).sort(),o=current.get(id),e=input.evidence.find(e=>e.id===r.evidence_id);
    if(!o||!e||!named.length||canonicalJSON(named)!==canonicalJSON([...(priorDigests.get(id)??[])].sort())||e.kind!=="authority"||e.result!=="supersedes-history"||e.occurrence_id!==id||!e.complete||e.synthetic||
      e.binding!==evidenceBinding(input.source_commit,input.policy,input.scope,o.target)||Date.parse(e.observed_at)<Date.parse(o.observed_at)||Date.parse(e.observed_at)>Date.parse(input.evaluated_at))throw Error("historical outcome resolution evidence missing or changed");
    acknowledged.add(id);
  }
  for(const [id,states] of priorStates) if(states.size>1&&!acknowledged.has(id))gaps.push(`historical outcome conflict: ${id}`);
  input.observations=[...current.values()];input.decisions=[...decisions.values()];input.evidence=[...proofs.values()];
  input.history_gaps=[...new Set([...(input.history_gaps??[]),...gaps])].sort();
  input.history_provenance=[...new Set([...(input.history_provenance??[]),...provenance])].sort();
  return {input:parseSecurityInput(input),gaps:[...new Set(gaps)].sort(),provenance:[...new Set(provenance)].sort()};
}
