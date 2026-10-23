// A public index locates private native evidence. It is not a substitute for
// regrading the original logs, fixtures and independent reviewer receipts.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export function compactTrial(result: any, source: string) {
  if (!source || !result.rawEventsHash || result.fixtureUnchangedSinceTrial !== true || !result.checks?.length) throw new Error("trial evidence is missing or has drifted");
  const failedChecks = result.checks.filter((c: any) => c.pass !== true).map((c: any) => c.name);
  if (result.status === "pass" && failedChecks.length) throw new Error("a passing trial contains failed checks");
  return {
    source, case: result.variant ?? result.id, trial: result.trial ?? result.id,
    candidate: result.candidate, status: result.status, durationMs: result.durationMs,
    ...(result.originalStatus ? { originalStatus: result.originalStatus } : {}),
    packageHash: result.packageHash, graderHash: result.graderHash, docsPin: result.docsPin,
    host: result.host, rawEventsHash: result.rawEventsHash,
    checkCount: result.checks.length,
    checksHash: createHash("sha256").update(JSON.stringify(result.checks)).digest("hex"),
    ...(failedChecks.length ? { failedChecks } : {}),
    ...(result.review ? { review: result.review } : {}),
  };
}

if (import.meta.main) {
  const [reportPath, runs] = process.argv.slice(2);
  if (!reportPath || !runs) throw new Error("usage: evidence-index.ts <full-regraded-report.json> <native-runs-directory>");
  const full = readFileSync(reportPath), report = JSON.parse(full.toString());
  const sources = new Map<string, string>();
  for (const name of readdirSync(runs)) {
    const directory = join(runs, name);
    for (const row of JSON.parse(readFileSync(join(directory, "results.json"), "utf8"))) {
      const key = `${row.candidate}/${row.trial ?? row.id}`;
      if (sources.has(key)) throw new Error(`duplicate native source: ${key}`);
      sources.set(key, join(directory, row.trial ?? row.id));
    }
  }
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  console.log(JSON.stringify({ kind: "native-evidence-index", fullReportHash: hash(full), limitation: "Index only. Regrading requires the original native logs and fixtures; no overall pass is inferred here." }));
  for (const result of report.results) {
    const directory = sources.get(`${result.candidate}/${result.trial ?? result.id}`);
    if (!directory) throw new Error("missing native run source");
    if (hash(readFileSync(join(directory, "events.jsonl"))) !== result.rawEventsHash) throw new Error("native event hash mismatch");
    const source = `${basename(join(directory, ".."))}/${basename(directory)}`;
    console.log(JSON.stringify({ ...compactTrial(result, source), beforeHash: hash(readFileSync(join(directory, "before.json"))), afterHash: hash(readFileSync(join(directory, "after.json"))) }));
  }
}
