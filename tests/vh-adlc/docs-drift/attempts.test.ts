import { afterAll, expect, spyOn, test } from "bun:test";
import { rmSync } from "node:fs";
import * as journalModule from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { executeAttempt, pendingAttempt } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { reconcileAbsent } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { hash } from "./manifest-fixture";
import { publicationFixture, publicationOptions } from "./publication-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["stale-handoff", "absorbed-invalidation", "absorbed-recovery-only", "lost-claim-ack"] as const)(
  "pre-dispatch journal race %s records unsent status without dispatch", async race => {
    const f = publicationFixture(roots), observe = f.transport.observe;
    f.transport.observe = async (plan, effect, objects) => effect.id === "pr" ? { state: "unknown", reason: "initial-read-unavailable" } : observe(plan, effect, objects);
    const stopped = await publish(publicationOptions(f));
    f.transport.observe = observe;
    const effect = f.plan.manifest.effects.find(item => item.id === "pr")!;
    const actualAppend = journalModule.appendAttempt, execute = f.transport.execute;
    let dispatched = 0;
    f.transport.execute = async () => { dispatched++; };
    const claimed = spyOn(journalModule, "appendAttempt").mockImplementation((journal, id, attempt, grant, companion) => {
      const own = actualAppend(journal, id, attempt, grant, companion);
      const changed = race === "absorbed-invalidation" ? journalModule.appendInvalidation(own, id, "concurrent-material-change")
        : race === "absorbed-recovery-only" ? journalModule.appendRecoveryOnly(own, id, "operation-started-elsewhere")
        : journalModule.appendHandoff(own, id, "concurrent-recovery-observer");
      if (race === "lost-claim-ack") throw Error("docs-drift journal revision conflict");
      return race === "stale-handoff" ? own : changed;
    });
    try {
      await expect(executeAttempt({ journal: stopped.journal, effect, objects: stopped.objects, transport: f.transport })).rejects.toThrow();
    } finally { claimed.mockRestore(); f.transport.execute = execute; }
    expect(dispatched).toBe(0);
    const current = journalModule.readJournal(stopped.journal.directory, f.repo);
    const ended = current.events.findLast(event => event.kind === "attempt-ended" && event.effect_id === effect.id);
    if (!ended || !("sent" in ended.payload)) throw Error("missing confirmed pre-dispatch ending");
    expect(ended.payload.sent).toBe(false);
    expect(ended.payload.reaped).toBe(true);
    expect(pendingAttempt(current, effect, true)).toBeNull();
    if (race === "stale-handoff" || race === "lost-claim-ack") {
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
