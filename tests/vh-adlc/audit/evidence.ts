import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hash, type Snapshot } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
import type { Assessment } from "../../../plugins/vh-adlc/scripts/audit/assessment";
import type { fixture } from "./fixtures";
export function terminal(f: ReturnType<typeof fixture>, snap: Snapshot, id = "AUD-001"): Assessment {
  return { id, disposition: "assessment-only", verdict: "FIXED", reason: "Original return-value scenario was reassessed.",
    evidence: [{ path: "src/app.ts", sha256: hash(readFileSync(join(f.root, "src/app.ts"))), symbol: "answer", scenario: "Original documented return-value scenario.", commit: snap.source.commit }],
    checks: [{ name: "unit", argv: ["fixture-check", id], exit_code: 0, commit: snap.source.commit, artifact: f.artifact(id + "-unit.txt") }], residuals: [],
    challenge: { producer: "fixture-producer", reviewer: "independent-fixture-reviewer", id, source_commit: snap.source.commit, result: "supports-verdict", artifact: f.artifact(id + "-challenge.txt") } };
}
