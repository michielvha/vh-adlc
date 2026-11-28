// What every SDD operation reads before acting, and the lenses a spec review applies
// (references/loop-settings.md). The procedure and lenses are the consumer's; this only lists them.
import { loadLoopSettingsAt, type Lens, type LoopSettings } from "./settings";
import { classify, fetchTip, settingsEntry, unverified, type Freshness } from "./freshness";
import { pluginStatus, type PluginStatus } from "./plugin-version";

export type LoopContext = { read: string[]; lenses: Lens[]; lensText: string };

export function loopContext(settings: LoopSettings): LoopContext {
  const read = [...settings.instruction_files, ...(settings.project_procedure ? [settings.project_procedure] : [])];
  const lensText = settings.lenses.map(lens => `- ${lens.name} (${lens.severity}): ${lens.check}`).join("\n");
  return { read, lenses: settings.lenses, lensText };
}

/** The `context` command's report: the reading list, lenses, plugin status and instruction freshness. */
export function contextReport(settings: LoopSettings, defaultBranch?: string): LoopContext & { plugin: PluginStatus; freshness: Freshness } {
  const tip = fetchTip(settings.root, defaultBranch);
  const settingsState: Freshness["settings"] = settingsEntry(settings.root, tip, settings.settings_path);
  let listed = loopContext(settings);
  // Settings behind the tip may list a rule file the tip added: take the list and lenses from the tip.
  if (settingsState.state === "stale" && "tip" in tip) {
    try { listed = loopContext(loadLoopSettingsAt(settings.root, tip.tip)); }
    catch (error) { settingsState.error = error instanceof Error ? error.message : String(error); }
  }
  const freshness: Freshness = "tip" in tip
    ? { default_branch: tip.branch, tip: tip.tip, settings: settingsState, files: listed.read.map(path => classify(settings.root, tip, path)) }
    : { default_branch: tip.branch, tip: null, reason: tip.reason, settings: settingsState, files: listed.read.map(unverified) };
  return { ...listed, plugin: pluginStatus(settings.root), freshness };
}
