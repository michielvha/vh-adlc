import { afterAll, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import * as filesystem from "node:fs";
import { join } from "node:path";
import * as journalModule from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { executeAttempt, pendingAttempt } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { publish } from "../../../plugins/vh-adlc/scripts/docs-drift/publish";
import { reconcileAbsent } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { hash } from "./manifest-fixture";
import { publicationFixture, publicationOptions } from "./publication-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) filesystem.rmSync(root, { recursive: true, force: true }); });

test.each(["pre-dispatch", "executed"] as const)("a disappearing append temporary file preserves the %s ending", async phase => {
  const f = publicationFixture(roots), observe = f.transport.observe, execute = f.transport.execute;
  f.transport.observe = async (plan, effect, objects) => effect.id === "pr" ? { state: "unknown", reason: "initial-read-unavailable" } : observe(plan, effect, objects);
  const stopped = await publish(publicationOptions(f)); f.transport.observe = observe;
  const effect = f.plan.manifest.effects.find(item => item.id === "pr")!;
  const directory = join(stopped.journal.directory, "events"), temporary = join(directory, ".tmp-" + randomUUID());
  const actualReadDirectory = filesystem.readdirSync, actualAppend = journalModule.appendAttempt;
  let armed = false, listings = 0, vanished = false, dispatched = 0;
  const prepareTemporary = () => {
    filesystem.writeFileSync(temporary, "in-progress append", { flag: "wx", mode: 0o600 });
    armed = true;
  };
  // Node overloads readdir for encodings and Dirent results. Forward each call's original arguments and result.
  const intercept = ((...args: unknown[]) => {
    const result: unknown = Reflect.apply(actualReadDirectory, filesystem, args);
    if (armed && String(args[0]) === directory && ++listings === (phase === "pre-dispatch" ? 3 : 1)) {
      filesystem.rmSync(temporary); vanished = true;
    }
    return result;
  }) as typeof filesystem.readdirSync;
  const listing = spyOn(filesystem, "readdirSync").mockImplementation(intercept);
  const claim = spyOn(journalModule, "appendAttempt").mockImplementation((journal, id, attempt, grant, companion) => {
    const own = actualAppend(journal, id, attempt, grant, companion);
    if (phase === "pre-dispatch") { journalModule.appendHandoff(own, id, "concurrent-recovery-observer"); prepareTemporary(); }
    return own;
  });
  f.transport.execute = async (plan, selected, objects) => {
    dispatched++; await execute(plan, selected, objects);
    if (phase === "executed") prepareTemporary();
  };
  try {
    const running = executeAttempt({ journal: stopped.journal, effect, objects: stopped.objects, transport: f.transport });
    if (phase === "pre-dispatch") await expect(running).rejects.toThrow();
    else await running;
  } finally { listing.mockRestore(); claim.mockRestore(); f.transport.execute = execute; }
  expect(vanished).toBe(true);
  expect(dispatched).toBe(phase === "executed" ? 1 : 0);
  const current = journalModule.readJournal(stopped.journal.directory, f.repo);
  const endings = current.events.filter(event => event.kind === "attempt-ended" && event.effect_id === effect.id);
  expect(endings).toHaveLength(1);
  if (!("sent" in endings[0].payload)) throw Error("missing attempt status");
  expect(endings[0].payload.sent).toBe(phase === "executed");
  expect(endings[0].payload.reaped).toBe(true);
  if (phase === "pre-dispatch") {
    expect(pendingAttempt(current, effect, true)).toBeNull();
    const cleaned = await reconcileAbsent({ source_repo: f.repo, journal_directory: current.directory, object_store: f.store,
      settings: f.settings, transport: f.transport, retire_effect_ids: [effect.id],
      authorize: async scope => ({ scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("actual selected cleanup request") }) });
    expect(cleaned.state).toBe("retired");
    expect(f.refs.has(f.settings.publication.lease_ref)).toBe(false);
  }
});


test.each(["symlink", "shared-mode"] as const)("an existing unsafe temporary journal entry still fails (%s)", kind => {
  const f = publicationFixture(roots);
  const journal = journalModule.createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  const path = join(journal.directory, "events", ".tmp-" + randomUUID());
  if (kind === "symlink") filesystem.symlinkSync(join(journal.directory, "header.json"), path);
  else filesystem.writeFileSync(path, "unsafe temporary input", { mode: 0o644 });
  expect(() => journalModule.readJournal(journal.directory, f.repo)).toThrow();
});
