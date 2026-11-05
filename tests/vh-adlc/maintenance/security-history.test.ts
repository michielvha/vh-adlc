import { expect, test } from "bun:test";
import { canonicalJSON, digest } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { reconcileSecurity } from "../../../plugins/vh-adlc/scripts/maintenance/security";
import { createSecurityRevision, selectSecurityChain, mergeSecurityHistory, readSecurityRevisions } from "../../../plugins/vh-adlc/scripts/maintenance/security-history";
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
