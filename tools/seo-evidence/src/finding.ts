import { digest, stable } from "./bundle";
import type { Evidence, Finding, Mode } from "./types";

export function finding(rule: string, url: string, mode: Mode, detail: string, evidence: Evidence[], values: unknown = null): Finding {
  const sources = [...new Map(evidence.map(e => [stable(e), e])).values()].sort((a, b) => a.path.localeCompare(b.path) || a.sha256.localeCompare(b.sha256));
  return { id: digest(stable({ rule, url, mode, evidence: sources, values })).slice(0, 24), rule, url, mode, detail, evidence: sources, values };
}
export const sortFindings = (items: Finding[]): Finding[] => [...items].sort((a, b) => a.rule.localeCompare(b.rule) || a.url.localeCompare(b.url) || a.mode.localeCompare(b.mode) || a.id.localeCompare(b.id));
