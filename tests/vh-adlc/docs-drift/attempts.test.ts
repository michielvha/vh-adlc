import { afterAll, expect, spyOn, test } from "bun:test";
import { rmSync } from "node:fs";
import * as journalModule from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { executeAttempt, pendingAttempt } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { join } from "node:path";
import { reconcileAbsent, resumeEffects } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { hash } from "./manifest-fixture";
import { publicationFixture, publicationOptions } from "./publication-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["stale-handoff", "absorbed-invalidation", "absorbed-recovery-only", "lost-claim-ack", "refusal-ending-read-race"] as const)(
  "pre-dispatch journal race %s records unsent status without dispatch", async race => {
    const f = publicationFixture(roots), observe = f.transport.observe;
    f.transport.observe = async (plan, effect, objects) => effect.id === "pr" ? { state: "unknown", reason: "initial-read-unavailable" } : observe(plan, effect, objects);
    const stopped = await publish(publicationOptions(f));
    f.transport.observe = observe;
    const effect = f.plan.manifest.effects.find(item => item.id === "pr")!;
    const actualAppend = journalModule.appendAttempt, actualRead = journalModule.readJournal, execute = f.transport.execute;
    let dispatched = 0, armed = false, refusedRead = false;
    const reread = spyOn(journalModule, "readJournal").mockImplementation((directory, repo, expected) => {
      if (race === "refusal-ending-read-race" && armed && !refusedRead && expected === undefined) {
        refusedRead = true; throw Error("docs-drift journal read conflict");
      }
      return actualRead(directory, repo, expected);
    });
    f.transport.execute = async () => { dispatched++; };
    const claimed = spyOn(journalModule, "appendAttempt").mockImplementation((journal, id, attempt, grant, companion) => {
      const own = actualAppend(journal, id, attempt, grant, companion);
      const changed = race === "absorbed-invalidation" ? journalModule.appendInvalidation(own, id, "concurrent-material-change")
        : race === "absorbed-recovery-only" ? journalModule.appendRecoveryOnly(own, id, "operation-started-elsewhere")
        : journalModule.appendHandoff(own, id, "concurrent-recovery-observer");
      armed = true;
      if (race === "lost-claim-ack") throw Error("docs-drift journal revision conflict");
      return race === "stale-handoff" || race === "refusal-ending-read-race" ? own : changed;
    });
    try {
      await expect(executeAttempt({ journal: stopped.journal, effect, objects: stopped.objects, transport: f.transport })).rejects.toThrow();
    } finally { claimed.mockRestore(); reread.mockRestore(); f.transport.execute = execute; }
    expect(dispatched).toBe(0);
    const current = journalModule.readJournal(stopped.journal.directory, f.repo);
    const ended = current.events.findLast(event => event.kind === "attempt-ended" && event.effect_id === effect.id);
    if (!ended || !("sent" in ended.payload)) throw Error("missing confirmed pre-dispatch ending");
    expect(ended.payload.sent).toBe(false);
    expect(ended.payload.reaped).toBe(true);
    expect(pendingAttempt(current, effect, true)).toBeNull();
    if (race === "stale-handoff" || race === "lost-claim-ack" || race === "refusal-ending-read-race") {
      const cleaned = await reconcileAbsent({ source_repo: f.repo, journal_directory: current.directory, object_store: f.store,
        settings: f.settings, transport: f.transport, retire_effect_ids: [effect.id],
        authorize: async scope => ({ scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("actual selected cleanup request") }) });
      expect(cleaned.state).toBe("retired");
      expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
    }
});

test.each(["lost-ending-ack", "ending-cas-conflict", "several-ending-cas-conflicts"] as const)(
  "local attempt completion survives %s without executing the action twice", async race => {
    const f = publicationFixture(roots), observe = f.transport.observe;
    f.transport.observe = async (plan, effect, objects) => effect.id === "pr" ? { state: "unknown", reason: "initial-read-unavailable" } : observe(plan, effect, objects);
    const stopped = await publish(publicationOptions(f)); f.transport.observe = observe;
    const effect = f.plan.manifest.effects.find(item => item.id === "pr")!;
    const actualEnd = journalModule.appendAttemptEnd;
    let remaining = race === "several-ending-cas-conflicts" ? 4 : 1;
    const ending = spyOn(journalModule, "appendAttemptEnd").mockImplementation((journal, id, status) => {
      if (remaining-- === 0) return actualEnd(journal, id, status);
      if (race === "lost-ending-ack") actualEnd(journal, id, status);
      else journalModule.appendHandoff(journal, id, "concurrent-completion-observer");
      throw Error("docs-drift journal revision conflict");
    });
    let completed: journalModule.Journal;
    try { completed = await executeAttempt({ journal: stopped.journal, effect, objects: stopped.objects, transport: f.transport }); }
    finally { ending.mockRestore(); }
    const endings = completed.events.filter(event => event.kind === "attempt-ended" && event.effect_id === effect.id);
    expect(endings).toHaveLength(1);
    if (!("sent" in endings[0].payload)) throw Error("missing completed native attempt");
    expect(endings[0].payload.sent).toBe(true);
    expect(endings[0].payload.reaped).toBe(true);
    expect(f.executed.filter(id => id === effect.id)).toHaveLength(1);
  });


test("a failed claim cannot end another executor's actual attempt", async () => {
  const f = publicationFixture(roots), observe = f.transport.observe;
  f.transport.observe = async (plan, effect, objects) => effect.id === "pr" ? { state: "unknown", reason: "initial-read-unavailable" } : observe(plan, effect, objects);
  const stopped = await publish(publicationOptions(f)); f.transport.observe = observe;
  const effect = f.plan.manifest.effects.find(item => item.id === "pr")!;
  const actualAppend = journalModule.appendAttempt;
  const claiming = spyOn(journalModule, "appendAttempt").mockImplementation((journal, id, _attempt, grant, companion) => {
    actualAppend(journal, id, "another-executor-attempt", grant, companion);
    throw Error("docs-drift journal revision conflict");
  });
  try { await expect(executeAttempt({ journal: stopped.journal, effect, objects: stopped.objects, transport: f.transport })).rejects.toThrow(); }
  finally { claiming.mockRestore(); }
  const current = journalModule.readJournal(stopped.journal.directory, f.repo);
  expect(current.events.some(event => event.kind === "attempt-ended" && event.effect_id === effect.id)).toBe(false);
  expect(pendingAttempt(current, effect)).toBe("attempt-in-flight");
  expect(f.executed.includes(effect.id)).toBe(false);
});

test.each(["claim-only", "intent-and-claim"] as const)(
  "lost executed proof %s requires observation and cannot recreate an unseen action", async loss => {
  const f = publicationFixture(roots), observe = f.transport.observe, execute = f.transport.execute;
  f.transport.observe = async (plan, effect, objects) => effect.id === "pr" ? { state: "unknown", reason: "initial-read-unavailable" } : observe(plan, effect, objects);
  const stopped = await publish(publicationOptions(f)); f.transport.observe = observe;
  const effect = f.plan.manifest.effects.find(item => item.id === "pr")!;
  f.transport.execute = async (plan, selected, objects, attemptId) => {
    await execute(plan, selected, objects);
    const current = journalModule.readJournal(stopped.journal.directory, f.repo);
    const claim = current.events.find(item => item.kind === "attempt" && "attempt_id" in item.payload && item.payload.attempt_id === attemptId);
    if (!claim || current.events.at(-1) !== claim) throw Error("missing last owned claim fixture");
    const intent = current.events.find(item => item.kind === "intent" && item.effect_id === effect.id);
    if (!intent) throw Error("missing original intent fixture");
    const first = loss === "claim-only" ? claim.revision : intent.revision;
    for (const event of current.events.filter(item => item.revision >= first))
      rmSync(join(current.directory, "events", String(event.revision).padStart(10, "0") + ".json"));
    f.done.delete(effect.id);
  };
  await expect(executeAttempt({ journal: stopped.journal, effect, objects: stopped.objects, transport: f.transport })).rejects.toThrow("claim unavailable");
  f.transport.execute = execute;
  const unseen = await resumeEffects({ ...publicationOptions(f), journal_directory: stopped.journal.directory });
  expect(unseen.state).toBe("pending");
  expect(f.executed.filter(id => id === effect.id)).toHaveLength(1);
  f.done.add(effect.id);
  const observed = await resumeEffects({ ...publicationOptions(f), journal_directory: stopped.journal.directory });
  expect(observed.state).toBe("complete");
  expect(f.executed.filter(id => id === effect.id)).toHaveLength(1);
});
