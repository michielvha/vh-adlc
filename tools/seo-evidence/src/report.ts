import { stable } from "./bundle";
import type { PolicyResult } from "./policy";

function csv(value: string): string {
  const safe = /^[\s]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
const markdown = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("|", "&#124;").replaceAll("`", "&#96;").replace(/\r\n|\r|\n/g, "\\n");
export function renderFiles(report: PolicyResult): Record<string, string> {
  const header = ["id", "rule", "url", "mode", "detail", "evidence", "values"];
  const rows = report.findings.map(f => [f.id, f.rule, f.url, f.mode, f.detail, stable(f.evidence).trim(), stable(f.values).trim()]);
  const text = ["# SEO evidence report", "", `Operation: ${report.operation}`, `Analysis: ${report.analysis_status}`, `Policy: ${report.policy_status}`, `Exit code: ${report.exit_code}`, "", "These findings describe observed saved evidence, not verified indexing or rankings.", "", "| Rule | URL / mode | Observation | Evidence |", "| --- | --- | --- | --- |", ...report.findings.map(f => `| ${markdown(f.rule)} | ${markdown(f.url)} / ${f.mode} | ${markdown(f.detail)} | ${markdown(stable(f.evidence).trim())} |`), "", "## Coverage", "", "```json", stable(report.coverage).trim(), "```", "", "## Unavailable evidence", "", ...report.partial_reasons.map(r => `- ${markdown(r)}`), ""].join("\n");
  return { "findings.json": stable(report), "findings.csv": [header, ...rows].map(row => row.map(csv).join(",")).join("\r\n") + "\r\n", "report.md": text };
}
export function renderStatus(result: { exit_code: number; analysis_status: string; policy_status: string }, options: { tty: boolean; ascii: boolean; noColor?: string }): string {
  // No colour is emitted in any mode; NO_COLOR is consequently always respected.
  const failed = result.exit_code !== 0; const prefix = options.ascii || !options.tty ? failed ? "FAIL" : "OK" : failed ? "✗" : "✓";
  return `${prefix} ${failed ? "Failed" : "Passed"}: analysis ${result.analysis_status}; policy ${result.policy_status}; exit ${result.exit_code}\n`;
}
