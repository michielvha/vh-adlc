// Coverage of the accepted behavioral matrix. This is a CLI result only;
// desktop discovery and feature completion require their separate evidence.
import { readFileSync } from "node:fs";

export const REQUIRED_TRIALS: Record<string, number> = {
  L01: 1, L02: 3, L03: 1, L04: 3, L05: 3,
  L06: 3, "L06-dependency": 3, "L06-ci": 3, L07: 3,
  "L08-held": 1, "L08-released": 1, "L09-onboard": 1, "L09-bootstrap": 1,
  L10: 1, "L11-ship": 1, "L12-missing": 1, "L12-conflict": 1, "L12-live": 1,
  L13: 1, L14: 1, L15: 3,
  "L16-public": 1, "L16-permissions": 1, "L16-data": 1, "L16-release": 1,
  "L17-findings": 1, "L17-missing": 1, "L17-check-failure": 1,
  "L18-source": 1, "L18-outcome": 1, "L18-contract": 1, "L18-scope": 1,
  "L18-proposal": 1, "L18-checks": 1, "L18-bookkeeping": 1,
  "L19-active": 1, "L19-complete": 1, R01: 1, R02: 1, R03: 1, R04: 1,
};

export function assessCliSuite(results: any[], packageHash: string, docsPin: string) {
  const errors: string[] = [];
  if (!results.length) errors.push("no trial evidence");
  if (results.some((r) => r.packageHash !== packageHash || r.docsPin !== docsPin)) errors.push("mixed package or engineering-docs revisions");
  if (new Set(results.map((r) => r.host)).size !== 1 || results.some((r) => !r.host?.startsWith("codex-cli ") || !r.configuration?.includes("no model override"))) errors.push("inconsistent or unsupported host/model selection");
  if (results.some((r) => !r.rawEventsHash || !r.fixtureUnchangedSinceTrial || r.status !== "pass" || !r.checks?.length || r.checks.some((c: any) => !c.pass))) errors.push("failed or unverified trial evidence");
  if (new Set(results.map((r) => r.rawEventsHash)).size !== results.length) errors.push("duplicate native trial evidence");
  const coverage = Object.entries(REQUIRED_TRIALS).map(([key, required]) => {
    const matches = results.filter((r) => key.startsWith("R") ? r.variant === key : r.id === key && !r.variant);
    return { case: key, required, observed: matches.length, pass: matches.length >= required };
  });
  for (const c of coverage.filter((c) => !c.pass)) errors.push(`${c.case}: ${c.observed}/${c.required} trials`);
  for (const r of results.filter((r) => r.variant === "R04" || r.id === "L11-ship")) {
    if (r.phases?.length !== 2 || !r.phases[0]?.thread || r.phases.some((p: any) => p.thread !== r.phases[0].thread || p.exitCode !== 0 || p.timeout)) errors.push(`${r.trial}: missing successful same-thread second turn`);
  }
  return {
    kind: "native-cli-lifecycle-matrix", pass: errors.length === 0, packageHash, docsPin,
    trialCount: results.length, minimumTrialCount: Object.values(REQUIRED_TRIALS).reduce((a, b) => a + b, 0),
    coverage, errors,
    limitation: "Native CLI evidence only. This does not establish desktop GUI discovery/invocation or feature completion; other hosts remain unverified.",
  };
}

if (import.meta.main) {
  const [file, packageHash, docsPin] = process.argv.slice(2);
  if (!file || !packageHash || !docsPin) throw new Error("usage: suite.ts <regraded-report.json> <frozen-package-digest> <docs-pin>");
  const result = assessCliSuite(JSON.parse(readFileSync(file, "utf8")).results, packageHash, docsPin);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.pass ? 0 : 1;
}
