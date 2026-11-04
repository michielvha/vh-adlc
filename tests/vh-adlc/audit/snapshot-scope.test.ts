import { expect, test } from "bun:test";
import { captureSnapshot } from "../../../plugins/vh-adlc/scripts/audit/snapshot";
import { createLedgerCandidate } from "../../../plugins/vh-adlc/scripts/audit/ledger";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { terminal } from "./evidence";
import { fixture, git } from "./fixtures";

test("fix scope does not inherit the historical comparison baseline", () => {
  const f = fixture();
  try {
    const config = loadSettings(f.root), base = git(f.root, "rev-parse", "HEAD");
    f.write("src/app.ts", "export const answer=43;\n"); f.commit();
    const options = {mode:"fix" as const, ids:["AUD-001"], artifact_root:f.artifacts, baseline:base, required_checks:{"AUD-001":["unit"]}};
    const snap = captureSnapshot(config, options);
    expect(snap.history.baseline).toBe(base); expect(snap.scope_baseline).toBeNull();
    const document = {schema_version:1, snapshot_digest:snap.digest, assessments:[terminal(f,snap)]};
    expect(() => createLedgerCandidate(config,snap,{document,at:"2026-11-02",run_id:"missing-scope",provisional:true})).toThrow("scope baseline");
    expect(captureSnapshot(config,{...options,scope_baseline:base}).scope_baseline).toBe(base);
  } finally { f.dispose(); }
});
