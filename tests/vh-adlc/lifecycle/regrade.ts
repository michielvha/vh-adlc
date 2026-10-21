// Regrade saved diagnostics without rerunning an agent or overwriting its results.
// bun tests/vh-adlc/lifecycle/regrade.ts <run-dir> [<run-dir> ...]
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { events, fingerprint, grade, snapshot, type Fixture } from "./fixtures";
import { verifyMaintenanceReview } from "./native-review";

const roots = process.argv.slice(2).map((root) => resolve(root));
if (!roots.length) throw new Error("provide saved run directories");
const graderHash = fingerprint(import.meta.dir);
const results = roots.flatMap((root) => {
  const saved = JSON.parse(readFileSync(join(root, "results.json"), "utf8"));
  return saved.map((original: any) => {
    const trial = join(root, original.trial ?? original.id);
    const f: Fixture = { id: original.id, project: join(trial, "project"), origin: join(trial, "origin.git"), prompt: original.prompt };
    const before = JSON.parse(readFileSync(join(trial, "before.json"), "utf8"));
    const after = JSON.parse(readFileSync(join(trial, "after.json"), "utf8"));
    if (JSON.stringify(snapshot(f)) !== JSON.stringify(after)) throw new Error(`${original.candidate}/${original.id}: saved fixture has drifted`);
    const raw = readFileSync(join(trial, "events.jsonl"), "utf8");
    const parsed = events(raw);
    const review = f.id === "L06" ? verifyMaintenanceReview(f.project, join(root, "profile/sessions"), parsed.threadId, ["greet.sh", "test.sh"]) : undefined;
    const verdict = grade(f, before, after, parsed.response, parsed.commands, review);
    const unchanged = original.checks.find((c: any) => c.name === "installed candidate unchanged");
    const checks = [...verdict.checks, unchanged];
    return {
      ...original, review, originalStatus: original.status, originalGraderHash: original.graderHash ?? "not recorded",
      graderHash, rawEventsHash: new Bun.CryptoHasher("sha256").update(raw).digest("hex"),
      fixtureUnchangedSinceTrial: true,
      status: original.timeout || original.exitCode !== 0 || parsed.failed ? "execution-failed" : checks.every((c) => c?.pass) ? "pass" : "fail",
      checks,
    };
  });
});
console.log(JSON.stringify({
  kind: "native-cli-diagnostic-comparison", graderHash,
  limitation: "Not final acceptance evidence. Each review needs a valid native receipt; native desktop and the full matrix remain untested.",
  results,
}, null, 2));
