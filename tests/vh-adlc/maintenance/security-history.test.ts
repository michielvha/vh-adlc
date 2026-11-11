import { expect, test } from "bun:test";
import { canonicalJSON, digest } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { reconcileSecurity } from "../../../plugins/vh-adlc/scripts/maintenance/security";
import { createSecurityRevision, selectSecurityChain, mergeSecurityHistory, readSecurityRevisions, historyAuthorityBinding } from "../../../plugins/vh-adlc/scripts/maintenance/security-history";
import { securityInput, decision, proof } from "./security-fixtures";

test("linked revisions preserve the initial collection while exposing later verified closure",()=>{
  const input=securityInput(), first=createSecurityRevision(reconcileSecurity(input),null,"a".repeat(64));
  input.collection_revision=2;input.collected_at="2026-11-05T11:30:00Z"; input.evaluated_at="2026-11-05T13:00:00Z";
  input.decisions.push({...decision(input),outcome:"fixed"});
  input.evidence.push(proof(input,"source","corrected"),proof(input,"check","pass"),proof(input,"scan","absent"));
  const second=createSecurityRevision(reconcileSecurity(input),first), before=canonicalJSON(first);
  expect(second.original_projection_digest).toBe(first.original_projection_digest);
  expect(selectSecurityChain([second,first]).latest?.snapshot.findings[0].remediation).toBe("fixed-verified");
  expect(canonicalJSON(first)).toBe(before);
  const markdown=[first,second].map(r=>'```maintenance-security-v1\n'+JSON.stringify(r)+'\n```').join('\n');
  expect(readSecurityRevisions(markdown)).toEqual([first,second]);
  expect(selectSecurityChain([second]).gaps.length).toBeGreaterThan(0);
  expect(selectSecurityChain([first,first]).gaps.length).toBeGreaterThan(0);
});
test("separate A/B runs both contribute outstanding work to a combined sweep",()=>{
  const a=securityInput(), b=securityInput(); b.run_id="22345678-1234-4234-8234-123456789abc"; b.repository="example/satellite";b.scope.repositories=[b.repository];b.coverage[0].repository=b.repository;
  b.observations[0].repository=b.repository;b.observations[0].id="github.com/example/satellite/dependabot:1";
  const current=securityInput();current.scope.repositories.push(b.repository);current.observations=[];current.collected_at="2026-11-05T12:00:00Z";current.evaluated_at="2026-11-05T13:00:00Z";
  const merged=mergeSecurityHistory(current,[createSecurityRevision(reconcileSecurity(a),null),createSecurityRevision(reconcileSecurity(b),null)]);
  expect(merged.input.observations.map(o=>o.repository).sort()).toEqual(["example/project","example/satellite"]);
  expect(reconcileSecurity(merged.input).all_clear).toBe(false);
});
test("forks and unbound changes remain pending rather than choosing a favorable timestamp",()=>{
  const input=securityInput();input.decisions.push(decision(input));input.evidence.push(proof(input,"tracking","accessible"));
  expect(reconcileSecurity(input).accounting_state).toBe("reconciled");
  const first=createSecurityRevision(reconcileSecurity(input),null);
  input.evaluated_at="2026-11-05T13:00:00Z";
  const second=createSecurityRevision(reconcileSecurity(input),first);
  input.evaluated_at="2026-11-05T14:00:00Z";
  const fork=createSecurityRevision(reconcileSecurity(input),first);
  expect(selectSecurityChain([first,second,fork]).gaps).toContain("forked snapshot revision");
  const merged=mergeSecurityHistory(input,[first,second,fork]);
  expect(reconcileSecurity(merged.input).accounting_state).toBe("pending");
  const tampered={...second,snapshot_revision:3};expect(()=>readSecurityRevisions('```maintenance-security-v1\n'+JSON.stringify(tampered)+'\n```')).toThrow();
});

test("history approval cannot authorize a different conflict set or successor decision",()=>{
  const a=securityInput(),b=securityInput(),c=securityInput();b.run_id="22345678-1234-4234-8234-123456789abc";c.run_id="32345678-1234-4234-8234-123456789abc";
  b.decisions.push({...decision(b),outcome:"fixed"});b.evidence.push(proof(b,"source","corrected"),proof(b,"check","pass"),proof(b,"scan","absent"));
  c.decisions.push({...decision(c),outcome:"unknown"});
  const [ra,rb,rc]=[a,b,c].map(i=>createSecurityRevision(reconcileSecurity(i),null));
  const current=securityInput();current.decisions.push(decision(current));current.evidence.push(proof(current,"tracking","accessible"),proof(current,"authority","supersedes-history"));
  current.evidence[1].binding=historyAuthorityBinding(current,current.observations[0].id,[ra.digest,rb.digest]);
  const resolution=(rows:typeof ra[])=>[{occurrence_id:current.observations[0].id,prior_digests:rows.map(r=>r.digest),evidence_id:"authority"}];
  expect(mergeSecurityHistory(current,[ra,rb],resolution([ra,rb])).gaps).toHaveLength(0);
  expect(()=>mergeSecurityHistory(current,[ra,rc],resolution([ra,rc]))).toThrow();
  current.decisions[0].outcome="unknown";
  expect(()=>mergeSecurityHistory(current,[ra,rb],resolution([ra,rb]))).toThrow();
  current.evidence[1].binding=historyAuthorityBinding(current,current.observations[0].id,[ra.digest,rb.digest]);
  expect(mergeSecurityHistory(current,[ra,rb],resolution([ra,rb])).gaps).toHaveLength(0);
});
