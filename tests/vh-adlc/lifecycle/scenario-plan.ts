import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DIAGNOSTICS, type Diagnostic } from "./fixtures";

export type Scenario = { id: Diagnostic; trial: string; variant?: string; prompt?: string };
export function scenarioPlan(request: { cases?: string; reserved?: string; repeat?: string }): Scenario[] {
  if (request.cases && request.reserved) throw new Error("choose --cases or --reserved");
  const repeat = Number(request.repeat ?? "1");
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) throw new Error("--repeat must be an integer from 1 to 10");
  const scenarios: Scenario[] = [];
  if (request.reserved) {
    const variants = JSON.parse(readFileSync(join(import.meta.dir, "reserved-wording.json"), "utf8")).variants;
    for (const key of request.reserved.split(",")) {
      const variant = variants.find((v: any) => v.id === key);
      if (!variant) throw new Error(`unknown reserved variant: ${key}`);
      if (variant.prompts) throw new Error(`${key} requires the pending multi-turn adapter`);
      if (!DIAGNOSTICS.includes(variant.fixture)) throw new Error(`unsupported fixture: ${variant.fixture}`);
      scenarios.push({ id: variant.fixture, trial: key, variant: key, prompt: variant.prompt });
    }
  } else {
    for (const id of (request.cases?.split(",") ?? ["L01", "L02", "L04", "L05"]) as Diagnostic[]) {
      if (!DIAGNOSTICS.includes(id)) throw new Error(`unsupported diagnostic case: ${id}`);
      scenarios.push({ id, trial: id });
    }
  }
  const plan = scenarios.flatMap((s) => Array.from({ length: repeat }, (_, i) => ({ ...s, trial: repeat === 1 ? s.trial : `${s.trial}-${i + 1}` })));
  if (new Set(plan.map((s) => s.trial)).size !== plan.length) throw new Error("duplicate fixture keys");
  return plan;
}
