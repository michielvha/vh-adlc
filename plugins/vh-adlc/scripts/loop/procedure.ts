// What every SDD operation reads before acting, and the lenses a spec review applies
// (references/loop-settings.md). The procedure and lenses are the consumer's; this only lists them.
import type { Lens, LoopSettings } from "./settings";

export type LoopContext = { read: string[]; lenses: Lens[]; lensText: string };

export function loopContext(settings: LoopSettings): LoopContext {
  const read = [...settings.instruction_files, ...(settings.project_procedure ? [settings.project_procedure] : [])];
  const lensText = settings.lenses.map(lens => `- ${lens.name} (${lens.severity}): ${lens.check}`).join("\n");
  return { read, lenses: settings.lenses, lensText };
}
