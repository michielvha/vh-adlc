import { z } from "zod";
import { parseYaml } from "./bundle";
import { RULES, type RuleId } from "./rules";
import type { Analysis, Finding } from "./types";

function isRuleId(value: string): value is RuleId { return Object.hasOwn(RULES, value); }
const id = z.enum(Object.keys(RULES).filter(isRuleId));
export const PolicySchema = z.strictObject({ schema_version: z.literal(1), fail_rules: z.array(id).refine(values => new Set(values).size === values.length, "Duplicate fail rule") });
export type Policy = z.infer<typeof PolicySchema>;
export type PolicyResult = Analysis & { fail_rules: RuleId[]; policy_status: "report_only" | "passed" | "failed"; policy_failures: Finding[]; exit_code: 0 | 2 | 3 };
export function parsePolicy(text: string): Policy { return PolicySchema.parse(parseYaml(text)); }
export function applyPolicy(report: Analysis, policy: Policy = { schema_version: 1, fail_rules: [] }): PolicyResult {
  const validated = PolicySchema.parse(policy);
  for (const rule of validated.fail_rules) if (RULES[rule].command !== report.operation) throw new Error(`Rule ${rule} is not applicable to ${report.operation}`);
  const selected = new Set<string>(validated.fail_rules);
  const failures = report.findings.filter(f => selected.has(f.rule));
  return { ...report, fail_rules: [...validated.fail_rules].sort(), policy_failures: failures,
    policy_status: failures.length ? "failed" : selected.size ? "passed" : "report_only",
    exit_code: report.analysis_status === "partial" ? 2 : failures.length ? 3 : 0 };
}
