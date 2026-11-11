export type ExpectedTrial = { target: string; payload_digest: string; cases: { id: string; verdict: string | string[]; eligible: boolean; next: string; evidence: { path: string; line: number }[] }[];
  routes: { id: string; operation: string; mode: string | null }[] };
/** Semantic oracle for bounded synthetic fixtures, never production or self-authored execution proof. */
export function gradeTrial(value: any, expected: ExpectedTrial, sources: Record<string, string>, proof: any) {
  const failures: string[] = [];
  if (!proof || proof.exit_code !== 0 || proof.timed_out !== false || proof.reaped !== true || proof.requested_model !== "claude-opus-5.5" || JSON.stringify(proof.models) !== '["claude-opus-5.5"]' ||
      proof.tool_contract_pass !== true || proof.source_preserved !== true || proof.input_preserved !== true || !/^[a-f0-9]{64}$/.test(proof.transcript_sha256)) failures.push("native-provenance");
  if (!value || value.source_commit !== expected.target || value.payload_digest !== expected.payload_digest) failures.push("target-binding");
  if (value?.limits?.synthetic !== true || value?.limits?.live_compatible !== false || value?.limits?.published !== false || !Array.isArray(value?.limits?.executed_actions) || value.limits.executed_actions.length) failures.push("unsupported-claim");
  for (const [name, rows] of [["cases", expected.cases], ["routes", expected.routes]] as const) {
    const actual = value?.[name];
    if (!Array.isArray(actual) || actual.length !== rows.length || new Set(actual.map(row => row?.id)).size !== rows.length || actual.some(row => !rows.some(expected => expected.id === row?.id))) { failures.push(`${name}:scope`); continue; }
    for (const row of rows) {
      const result = actual.find(item => item.id === row.id);
      for (const key of Object.keys(row).filter(key => !["id", "evidence"].includes(key))) if (key === "verdict" && Array.isArray((row as any)[key]) ? !(row as any)[key].includes(result[key]) : result[key] !== (row as any)[key]) failures.push(`${row.id}:${key}`);
      if (name === "cases") {
        if (!result.reason?.trim() || !Array.isArray(result.evidence)) { failures.push(`${row.id}:evidence`); continue; }
        for (const required of (row as ExpectedTrial["cases"][number]).evidence) if (!result.evidence.some((e: any) => e?.path === required.path && e.line === required.line)) failures.push(`${row.id}:required-evidence`);
        if (result.evidence.some((e: any) => typeof sources[e?.path] !== "string" || !Number.isSafeInteger(e.line) || e.line < 1 || e.line > sources[e.path].split("\n").length)) failures.push(`${row.id}:unbound-evidence`);
      }
    }
  }
  return { pass: !failures.length, failures };
}
