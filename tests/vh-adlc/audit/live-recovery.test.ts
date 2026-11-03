import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRun, readRun, intent, resourceIntents, noteResource } from "../../../plugins/vh-adlc/scripts/audit/journal";
import { cleanupPending, liveReady, recoverEffect } from "../../../plugins/vh-adlc/scripts/audit/recovery";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { fixture } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
function context() {
  const f = fixture(); projects.push(f); const config = loadSettings(f.root);
  const run = createRun(config, { artifact_root: f.artifacts, run_id: "live-test", batch_digest: "d".repeat(64) });
  const scope = { target: "development:owned-slot", actor: "fixture-actor", organization: "fixture-org", cleanup_method: "#verification-owned-cleanup" };
  const pending = (id: string, kind: "key" | "row") => intent(readRun(config, run.directory, "d".repeat(64)), { id, kind, correlation: "run-live-test-" + id, ...scope });
  return { f, config, run, scope, pending, reload: () => readRun(config, run.directory, "d".repeat(64)) };
}
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });

test.each(["before-create", "after-create", "after-cleanup"])("fresh-context %s recovery reconciles exact owned resources and never creates another key", async phase => {
  const c = context(); resourceIntents(c.reload(), [{id:"temporary-key",kind:"key",correlation:"run-live-test-temporary-key",...c.scope},{id:"test-row",kind:"row",correlation:"run-live-test-test-row",...c.scope}]);
  const resources = new Map<string, string>(); let deletes = 0, created = 0;
  if (phase !== "before-create") { resources.set("run-live-test-temporary-key", "key-id"); resources.set("run-live-test-test-row", "row-id"); created = 2; }
  if (phase === "after-cleanup") resources.clear();
  expect(liveReady(c.reload())).toBe(false);
  const result = await cleanupPending(c.reload(), c.scope, {
    authorized: true,
    lookup: async action => { const id = resources.get(action.correlation); return id ? [{ id, ...c.scope }] : []; },
    cleanup: async (action, resource) => { deletes++; expect(resource.id).toBe(resources.get(action.correlation)!); resources.delete(action.correlation); },
  });
  expect(result.ready).toBe(true); expect(resources.size).toBe(0); expect(deletes).toBe(phase === "after-create" ? 2 : 0);
  expect(created).toBe(phase === "before-create" ? 0 : 2); expect(liveReady(c.reload())).toBe(true);
  expect(readFileSync(join(c.run.directory, "header.json"), "utf8")).not.toContain("secret");
});

test("accepted cleanup with lost response is reconciled by observing absence before retry", async () => {
  const c = context(); c.pending("temporary-key", "key"); let present = true, deletes = 0;
  const transport = { authorized: true,
    lookup: async () => present ? [{ id: "key-id", ...c.scope }] : [],
    cleanup: async () => { present = false; deletes++; throw Error("cleanup response lost"); },
  };
  expect((await cleanupPending(c.run, c.scope, transport)).handoffs).toEqual([{action:"temporary-key",reason:"cleanup-execution-failed"}]);
  expect(liveReady(c.reload())).toBe(false);
  expect((await cleanupPending(c.reload(), c.scope, transport)).ready).toBe(true); expect(deletes).toBe(1);
});

test.each(["denied", "ambiguous", "target", "owner", "method"])("a %s cleanup boundary leaves a durable specific handoff and blocks another live attempt", async kind => {
  const c = context(); c.pending("temporary-key", "key"); let deleted = false;
  const resource = { id: "key-id", ...c.scope, ...(kind === "owner" ? { actor: "another-actor" } : {}) };
  const result = await cleanupPending(c.reload(), { ...c.scope, ...(kind === "target" ? { target: "another-target" } : kind === "method" ? { cleanup_method: "#other" } : {}) }, {
    authorized: kind !== "denied", lookup: async () => kind === "ambiguous" ? [resource, resource] : [resource], cleanup: async () => { deleted = true; },
  });
  expect(result.ready).toBe(false); expect(result.handoffs.length).toBeGreaterThan(0); expect(deleted).toBe(false);
  expect(liveReady(c.reload())).toBe(false); expect(c.reload().events.some(e => e.kind === "handoff")).toBe(true);
});

test("the server-assigned resource ID is retained and a replacement with the same correlation is not deleted", async () => {
  const c = context(); c.pending("temporary-key", "key");
  noteResource(c.reload(), "temporary-key", "original-key-id");
  let deleted = false;
  const result = await cleanupPending(c.reload(), c.scope, { authorized: true,
    lookup: async () => [{ id: "replacement-key-id", ...c.scope }], cleanup: async () => { deleted = true; },
  });
  expect(result.ready).toBe(false); expect(deleted).toBe(false);
  expect(c.reload().events.some(e => e.kind === "resource")).toBe(true);
});

test.each(["key", "row"] as const)("generic effect recovery cannot mark %s creation as completed cleanup", async kind => {
  const c = context(); c.pending("owned-resource", kind); let observed = false;
  await expect(recoverEffect(c.reload(), "owned-resource", { authorized: true,
    observe: async () => { observed = true; return { state: "done", receipt: { state: "observed", resource_id: "created-id" } }; },
  })).rejects.toThrow("cleanup");
  expect(observed).toBe(false); expect(liveReady(c.reload())).toBe(false);
  expect(c.reload().events.some(event => event.kind === "outcome")).toBe(false);
});

test("a second live resource intent is refused while the first is pending or handed off",()=>{
  const c=context();c.pending("key","key");
  expect(()=>c.pending("another-key","key")).toThrow();
});
test.each(["cleanup","absence-lookup"])("a %s failure leaves a specific durable handoff",async kind=>{
  const c=context();c.pending("key","key");let lookups=0;
  try { await cleanupPending(c.reload(),c.scope,{authorized:true,lookup:async()=>{lookups++;if(kind==="absence-lookup"&&lookups>1)throw Error("synthetic denied observation");return [{id:"key-id",...c.scope}];},cleanup:async()=>{if(kind==="cleanup")throw Error("synthetic revoke denied");}}); } catch { /* Old implementation threw without preserving the handoff. */ }
  expect(c.reload().events.some(event=>event.kind==="handoff"&&event.action_id==="key")).toBe(true);expect(liveReady(c.reload())).toBe(false);
});
test("a resource ID discovered during lost-response reconciliation is retained before cleanup, protecting replacements",async()=>{
  const c=context();c.pending("key","key");let current="original-id",deletes=0;
  const transport={authorized:true,lookup:async()=>[{id:current,...c.scope}],cleanup:async()=>{deletes++;current="replacement-id";throw Error("synthetic cleanup acknowledgement lost");}};
  try {await cleanupPending(c.reload(),c.scope,transport);}catch{}
  try {await cleanupPending(c.reload(),c.scope,transport);}catch{}
  expect(deletes).toBe(1);expect(current).toBe("replacement-id");expect(c.reload().events.some(event=>event.kind==="resource"&&(event.payload as any).resource_id==="original-id")).toBe(true);
});
