import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { resolveInside, git } from "../triage/settings";
import { canonicalJSON, digest, readRun } from "./journal";
import { alertContext, isSecurityPull, type Inventory } from "./collect";
import { parseObservation, readHistory } from "./history";
import { reconcileSecurity, parseSecurityInput, evidenceBinding, type Occurrence, type PolicyBinding, type SecurityCoverage, type SecurityInput, type SecuritySnapshot } from "./security";
import { createSecurityRevision, mergeSecurityHistory, readSecurityRevisions, selectSecurityChain, type SecurityRevision } from "./security-history";
import { verifyScannerEvidence } from "./scanner-evidence";
import type { Settings } from "./types";
import * as v from "./security-value";

type FileReference = { path:string;sha256:string };
export type SecurityResult = { revision:SecurityRevision; validation:{packet_path:string;packet_digest:string} };
function physicalFile(path:string):Buffer {
  let part=resolve(path);
  if(!lstatSync(part).isFile()||lstatSync(part).isSymbolicLink())throw Error("security evidence is not a physical file");
  while(dirname(part)!==part){part=dirname(part);if(lstatSync(part).isSymbolicLink())throw Error("security evidence has symlink ancestor");}
  return readFileSync(path);
}
function reference(base:string,value:unknown):{entry:FileReference;path:string;bytes:Buffer} {
  const row=v.record(value,["path","sha256"]),path=v.text(row.path);
  if(isAbsolute(path)||path.includes("\\")||path.split("/").some(p=>!p||p==="."||p===".."))throw Error("security packet path must be contained");
  const absolute=join(base,path),bytes=physicalFile(absolute),sha256=v.hash(row.sha256);
  if(digest(bytes)!==sha256)throw Error("security evidence file digest changed");
  return{entry:{path,sha256},path:absolute,bytes};
}
export function currentSecurityPolicy(config:Settings):PolicyBinding[]{
  const paths=[...(existsSync(join(config.root,"AGENTS.md"))?["AGENTS.md"]:[]),...(config.configured?[config.settings_path]:[]),
    config.security_policy,config.project_procedure,...config.source_references,...config.backlog_references,...config.repositories.map(r=>r.sync_workflow)].filter((p):p is string=>p!==undefined);
  return [...new Set(paths)].sort((a,b)=>a.localeCompare(b)).map(path=>({path,digest:digest(physicalFile(resolveInside(config.root,path)))}));
}
export function inventorySecurityInput(config:Settings,id:string,inventory:Inventory,analysis:unknown):SecurityInput {
  const run=readRun(config,id),a=v.record(analysis,["evaluated_at","collection_revision","policy_assessment","decisions","evidence","groups","coverage_handoffs","required_surfaces"]);
  if(inventory.schema_version!==1||inventory.hostname!==config.hostname||inventory.repository!==config.repository||
    inventory.source_commit!==git(config.root,"rev-parse","HEAD")||canonicalJSON(inventory.scope)!==canonicalJSON(run.header.scope)||run.settings_changed)throw Error("security collection source/scope/settings changed");
  const expected=[...run.header.scope.repositories].sort();
  if(canonicalJSON(inventory.repositories.map(r=>r.repository).sort())!==canonicalJSON(expected))throw Error("security collection missing or duplicate repository");
  const observations:Occurrence[]=[],coverage:SecurityCoverage[]=[];
  for(const repo of inventory.repositories) for(const surface of ["dependabot","code_scanning"] as const){
    const input=repo[surface];
    if(input.coverage.status==="complete" && (!input.alerts||input.coverage.count!==input.alerts.length))throw Error("security inventory count mismatch");
    if(input.coverage.status!=="complete" && input.coverage.count!==null)throw Error("security inventory incomplete total must be null");
    coverage.push({hostname:config.hostname,repository:repo.repository,surface,status:input.coverage.status,count:input.coverage.count,reason:input.coverage.reason??null,handoff:null,synthetic:false});
    for(const alert of input.alerts??[]){
      const old=alert.context,context=old?alertContext(old.raw,config.hostname,repo.repository,surface):null;
      if(context && (canonicalJSON(context)!==canonicalJSON(old)||context.identity!==`${config.hostname}/${repo.repository}/${surface}:${alert.number}`))throw Error("security raw response/context mismatch");
      if(old){
        const raw=v.record(old.raw);if(raw.number!==alert.number||raw.state!=="open")throw Error("security raw alert identity mismatch");
        if(surface==="dependabot"){
          const dep=v.record(raw.dependency),pkg=v.record(dep.package),adv=v.record(raw.security_advisory);
          if(pkg.name!==alert.package||dep.manifest_path!==alert.manifest||adv.severity!==alert.severity)throw Error("security raw package/location/severity mismatch");
        }
      }
      observations.push({id:`${config.hostname}/${repo.repository}/${surface}:${alert.number}`,hostname:config.hostname,repository:repo.repository,surface,provider_id:String(alert.number),provider_state:"open",
        target:{kind:"source",reference:repo.repository===config.repository?inventory.source_commit:null,platform:"unknown"},package:alert.package,ecosystem:context?.ecosystem??null,version:context?.installed_version??null,
        location:alert.manifest,severity:alert.severity,advisory_ids:context?.advisory_ids??[],affected_range:context?.affected_range??null,fixed_versions:context?.fixed_versions??[],relationship:context?.relationship??null,dependency_scope:context?.scope??null,rule:alert.rule??null,
        observed_at:inventory.collected_at,raw_digest:context?.raw_digest??digest(canonicalJSON(alert)),raw_reference:`inventory:${digest(canonicalJSON(inventory))}/${repo.repository}/${surface}/${alert.number}`,
        complete:input.coverage.status==="complete"&&context!==null,synthetic:false,reactivated:false});
    }
  }
  for(const repo of inventory.repositories){
    const candidates=repo.pulls.filter(isSecurityPull);
    coverage.push({hostname:config.hostname,repository:repo.repository,surface:"security-pr",status:repo.coverage.pulls.status,count:repo.coverage.pulls.status==="complete"?candidates.length:null,reason:repo.coverage.pulls.reason??null,handoff:null,synthetic:false});
    for(const pull of candidates)observations.push({id:`${config.hostname}/${repo.repository}/security-pr:${pull.number}`,hostname:config.hostname,repository:repo.repository,surface:"security-pr",provider_id:String(pull.number),provider_state:"open",
      target:{kind:"source",reference:pull.head,platform:"unknown"},package:null,ecosystem:null,version:null,location:null,severity:"unknown",advisory_ids:[],affected_range:null,fixed_versions:[],relationship:null,dependency_scope:null,rule:"security-update-pr",
      observed_at:inventory.collected_at,raw_digest:digest(canonicalJSON(pull)),raw_reference:`inventory:${digest(canonicalJSON(inventory))}/${repo.repository}/pull/${pull.number}`,complete:pull.evidence.status==="complete",synthetic:false,reactivated:false});
  }
  for(const item of a.required_surfaces===undefined?[]:v.list(a.required_surfaces)){
    const required=v.record(item,["repository","surface","reason"]),repository=v.text(required.repository),surface=v.text(required.surface);
    if(!run.header.scope.repositories.includes(repository))throw Error("required security surface outside scope");
    if(!coverage.some(c=>c.repository===repository&&(c.surface===surface||c.surface.startsWith(surface+"/"))))coverage.push({hostname:config.hostname,repository,surface,status:"incomplete",count:null,reason:v.text(required.reason),handoff:null,synthetic:false});
  }
  const handoffs=v.list(a.coverage_handoffs);
  for(const item of handoffs){const h=v.record(item,["repository","surface","handoff"]),row=coverage.find(c=>c.repository===h.repository&&c.surface===h.surface);if(!row)throw Error("coverage handoff outside scope");row.handoff=h.handoff as SecurityCoverage["handoff"];}
  return parseSecurityInput({schema_version:1,run_id:id,hostname:config.hostname,repository:config.repository,source_commit:inventory.source_commit,
    evaluated_at:a.evaluated_at,collected_at:inventory.collected_at,collection_revision:a.collection_revision,inventory_digest:digest(canonicalJSON(inventory)),scope:{repositories:run.header.scope.repositories,filters:[],exclusions:[]},
    policy:currentSecurityPolicy(config),policy_assessment:a.policy_assessment,coverage,observations,evidence:a.evidence,decisions:a.decisions,groups:a.groups});
}

export function reconcileSecurityPacket(config:Settings,id:string,packetPath:string,options:{before?:number}={}):SecurityResult {
  const absolute=resolve(packetPath),packetBytes=physicalFile(absolute),base=dirname(absolute),packet=v.record(JSON.parse(packetBytes.toString()),["schema_version","synthetic_input","inventory","analysis","scanner_packets","history","evidence_files","history_resolutions"]);
  if(packet.schema_version!==1)throw Error("unsupported security packet schema");
  const synthetic=v.flag(packet.synthetic_input);
  const inventory=JSON.parse(reference(base,packet.inventory).bytes.toString()) as Inventory;
  const analysis=v.record(packet.analysis);
  let input=inventorySecurityInput(config,id,inventory,{...analysis,decisions:[],evidence:[],groups:[]});
  for(const item of v.list(packet.scanner_packets)){
    const row=v.record(item,["path","manifest_digest"]),relative=v.text(row.path);
    if(isAbsolute(relative)||relative.includes("\\")||relative.split("/").some(p=>!p||p==="."||p===".."))throw Error("scanner packet outside envelope");
    const scan=verifyScannerEvidence(join(base,relative));
    if(scan.manifest_digest!==v.hash(row.manifest_digest)||scan.hostname!==config.hostname||!input.scope.repositories.includes(scan.repository)||scan.source_commit!==input.source_commit)throw Error("scanner packet source/scope changed");
    const surface=`scanner/${scan.producer.name}/${scan.scope.category}/${digest(canonicalJSON({target:scan.target,scope:scan.scope})).slice(0,16)}`;
    input.coverage=input.coverage.filter(c=>!(c.repository===scan.repository&&c.status==="incomplete"&&surface.startsWith(c.surface+"/")));
    input.coverage.push({hostname:scan.hostname,repository:scan.repository,surface,status:scan.complete?"complete":"incomplete",count:scan.complete?scan.findings.length:null,reason:scan.complete?null:"scan incomplete",handoff:null,synthetic:scan.synthetic});
    for(const finding of scan.findings){const provider_id=digest(canonicalJSON({fingerprint:finding.fingerprint,target:scan.target,rule:finding.rule}));
      input.observations.push({id:`${scan.hostname}/${scan.repository}/${surface}:${provider_id}`,hostname:scan.hostname,repository:scan.repository,surface,provider_id,provider_state:"open",target:scan.target,
        package:finding.package,ecosystem:null,version:finding.version,location:finding.location,severity:finding.severity,advisory_ids:finding.advisory_ids,affected_range:null,fixed_versions:[],relationship:null,dependency_scope:null,rule:finding.rule,
        observed_at:scan.observed_at,raw_digest:scan.files.find(f=>f.path===finding.evidence)!.sha256,raw_reference:`scanner:${scan.manifest_digest}/${finding.evidence}#${finding.pointer}`,complete:scan.complete,synthetic:scan.synthetic,reactivated:false});
    }
  }
  const revisions:SecurityRevision[]=[];
  const primary=inventory.repositories.find(r=>r.repository===config.repository),defaultBranch=primary?.identity?.default_branch??git(config.root,"symbolic-ref","--short","refs/remotes/origin/HEAD").replace(/^origin\//,"");
  const defaultCommit=git(config.root,"rev-parse",`refs/remotes/origin/${defaultBranch}`);
  const committed=readHistory(config,defaultCommit);
  const history=[...committed.map(report=>({bytes:Buffer.from(report.text),entry:{sha256:report.digest},report:true,
      provenance:report.provenance==="published"?`commit:${report.commit}:${report.path}:${report.digest}`:`local:${report.path}:${report.digest}`})),
    ...v.list(packet.history).map(item=>{const file=reference(base,item);return{...file,report:false,provenance:`local:${file.entry.sha256}`};})];
  // Verification replays the revisions that preceded the claimed one; later appends to this run's report are not its inputs.
  const earlier=(r:SecurityRevision)=>r.run_id!==id||options.before===undefined||r.snapshot_revision<options.before;
  // A copy of this run's report may repeat a revision the report itself supplies; the same digest is one revision, not a fork.
  const add=(found:SecurityRevision[])=>{for(const r of found)if(r.run_id!==id||!revisions.some(o=>o.digest===r.digest))revisions.push(r);};
  const historySeen=new Set<string>(),provenance:string[]=[];
  for(const file of history){
    if(historySeen.has(file.entry.sha256))continue;
    const markdown=file.bytes.toString(),found=readSecurityRevisions(markdown);
    // Older reports remain evidence of outstanding observations, never proof of their resolution.
    const legacy=parseObservation(markdown);
    // This run's own saved report changes with every append, so it contributes only its earlier revisions.
    if(file.report&&legacy?.run_id===id){add(found.filter(earlier));continue;}
    historySeen.add(file.entry.sha256);provenance.push(file.provenance);
    add(found);
    if(!found.length && legacy)for(const observation of legacy.observations){
      if(observation.hostname!==input.hostname||!input.scope.repositories.includes(observation.repository))continue;
      for(const alert of observation.alerts??[]){const identity=`${observation.hostname}/${observation.repository}/${alert.identity}`;
        if(!input.observations.some(o=>o.id===identity))input.observations.push({id:identity,hostname:observation.hostname,repository:observation.repository,surface:observation.surface,provider_id:String(alert.number),provider_state:"unknown",target:{kind:"source",reference:null,platform:"unknown"},
          package:alert.package,ecosystem:null,version:null,location:alert.manifest,severity:alert.severity,advisory_ids:[],affected_range:null,fixed_versions:[],relationship:null,dependency_scope:null,rule:null,observed_at:observation.observed_at,
          raw_digest:digest(canonicalJSON(alert)),raw_reference:`${file.provenance}#${alert.identity}`,complete:false,synthetic:false,reactivated:false});}
    }
  }
  const sameRun=revisions.filter(r=>r.run_id===id),chain=selectSecurityChain(sameRun);
  input=mergeSecurityHistory(input,revisions).input;
  const overlay=(old:unknown[],fresh:unknown[])=>{const map=new Map(old.map(value=>{const row=v.record(value);return[v.text(row.id),row];}));for(const value of fresh){const row=v.record(value);map.set(v.text(row.id),row);}return[...map.values()];};
  input=parseSecurityInput({...input,decisions:overlay(input.decisions,v.list(analysis.decisions)),evidence:overlay(input.evidence,v.list(analysis.evidence)),groups:v.list(analysis.groups)});
  if(packet.history_resolutions!==undefined)input=mergeSecurityHistory({...input,history_gaps:[]},revisions,packet.history_resolutions).input;
  input.history_provenance=[...new Set([...(input.history_provenance??[]),...provenance])].sort();
  if(synthetic){input.observations=input.observations.map(o=>({...o,synthetic:true}));input.coverage=input.coverage.map(c=>({...c,synthetic:true}));input.evidence=input.evidence.map(e=>({...e,synthetic:true}));}
  for(const terminal of inventory.terminal??[]){
    const identity=`${terminal.hostname}/${terminal.repository}/${terminal.surface}:${terminal.number}`,observed=input.observations.find(o=>o.id===identity);
    if(!observed||terminal.hostname!==input.hostname||!input.scope.repositories.includes(terminal.repository))throw Error("terminal result has no in-scope prior occurrence");
    observed.complete=false;
    if(terminal.status==="complete"){
      if(!terminal.raw||terminal.raw_digest!==digest(canonicalJSON(terminal.raw))||terminal.raw.number!==terminal.number||terminal.raw.state!==terminal.state)throw Error("terminal raw evidence changed");
      observed.provider_state=v.choice(terminal.state,["open","fixed","dismissed","auto_dismissed"]);observed.raw_digest=terminal.raw_digest;observed.raw_reference=`terminal:${terminal.raw_digest}`;
      const at=v.timestamp(terminal.observed_at),context=alertContext(terminal.raw,input.hostname,terminal.repository,terminal.surface);
      // A historical absence becomes current evidence only after a positive, fresh exact read
      // and an explicit source observation. Unknown targets never inherit the primary's commit.
      const sources=input.evidence.filter(e=>e.occurrence_id===identity&&e.kind==="source"&&["observed","corrected"].includes(e.result)&&e.complete&&!e.synthetic&&e.target.kind==="source"&&e.target.reference!==null&&
        e.binding===evidenceBinding(input.source_commit,input.policy,input.scope,e.target)&&Date.parse(e.observed_at)>=Date.parse(at)&&Date.parse(e.observed_at)<=Date.parse(input.evaluated_at)&&
        (terminal.repository!==input.repository||e.target.reference===input.source_commit));
      const targets=new Map(sources.map(e=>[canonicalJSON(e.target),e.target])),current=[...targets.values()][0];
      const raw=terminal.raw,dep=terminal.surface==="dependabot"?v.record(raw.dependency):null,pkg=dep?v.record(dep.package):null;
      const rawPackage=pkg?v.text(pkg.name):null,rawLocation=dep?v.text(dep.manifest_path):null;
      const instance=raw.most_recent_instance===undefined?null:v.record(raw.most_recent_instance),commit=instance?.commit_sha;
      const rule=terminal.surface==="code_scanning"?v.text(v.record(raw.rule).id):null;
      const metadataMatches=(!observed.rule||!rule||observed.rule===rule)&&(!observed.package||!rawPackage||observed.package===rawPackage)&&(!observed.location||!rawLocation||observed.location===rawLocation)&&
        (!observed.advisory_ids.length||!context.advisory_ids.length||observed.advisory_ids.some(id=>context.advisory_ids.includes(id)));
      if(metadataMatches&&targets.size===1&&current&&Date.parse(at)>=Date.parse(input.collected_at)&&Date.parse(at)>=Date.parse(observed.observed_at)&&Date.parse(at)<=Date.parse(input.evaluated_at)&&
        (terminal.surface!=="code_scanning"||commit===current.reference)){
        observed.target=current;observed.complete=true;observed.observed_at=at;
        observed.package=rawPackage??observed.package;observed.location=rawLocation??observed.location;
        observed.ecosystem=context.ecosystem??observed.ecosystem;observed.version=context.installed_version??observed.version;
        observed.advisory_ids=context.advisory_ids.length?context.advisory_ids:observed.advisory_ids;
        observed.affected_range=context.affected_range??observed.affected_range;observed.fixed_versions=context.fixed_versions.length?context.fixed_versions:observed.fixed_versions;
        observed.relationship=context.relationship??observed.relationship;observed.dependency_scope=context.scope??observed.dependency_scope;
      }
    }else observed.provider_state="unknown";
  }
  const files=new Map<string,string>();
  for(const item of v.list(packet.evidence_files)){
    const row=v.record(item,["reference","path","sha256"]),ref=v.text(row.reference),file=reference(base,{path:row.path,sha256:row.sha256});
    if(files.has(ref))throw Error("duplicate security evidence reference");files.set(ref,file.entry.sha256);
  }
  for(const evidence of input.evidence){if(files.get(evidence.reference)!==evidence.digest)throw Error("security proof file missing or changed");}
  const snapshot=reconcileSecurity(input),revision=createSecurityRevision(snapshot,chain.latest);
  return{revision,validation:{packet_path:absolute,packet_digest:digest(packetBytes)}};
}
export function verifySecurityResult(config:Settings,id:string,value:unknown):SecurityResult{
  const row=v.record(value,["revision","validation"]),receipt=v.record(row.validation,["packet_path","packet_digest"]),path=v.text(receipt.packet_path);
  if(digest(physicalFile(path))!==v.hash(receipt.packet_digest))throw Error("security reconciliation packet changed");
  const recomputed=reconcileSecurityPacket(config,id,path,{before:v.integer(v.record(row.revision).snapshot_revision,1)});
  if(canonicalJSON(value)!==canonicalJSON(recomputed))throw Error("security reconciliation result changed or falsely reconciled");
  if(recomputed.revision.snapshot.findings.some(f=>f.exception?.expires_at && Date.parse(f.exception.expires_at)<=Date.now()))throw Error("security exception expired; reassessment required");
  return recomputed;
}
export function securitySummary(revision:SecurityRevision):string{
  const snapshot=revision.snapshot;
  return `Security accounting: ${snapshot.accounting_state}; coverage: ${snapshot.coverage_state}; open remediation: ${snapshot.open_remediation_count}; exceptions: ${snapshot.exception_count}; pending delivery: ${snapshot.pending_delivery_count}.\n\n\`\`\`maintenance-security-v1\n${JSON.stringify(revision,null,2)}\n\`\`\`\n`;
}
