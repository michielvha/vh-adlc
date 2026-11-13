import { OWNER_DECISIONS, type Entry, type Output } from "./security-settings";

const cell = (value: string | undefined | null) => (value ?? "").replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");
const code = (value: string | undefined | null) => value ? `\`${cell(value)}\`` : "";

export type Missing = { repository: string; reason: string };
/** Entries that go to the owner: a Renovate overlap, a keep-off conflict or paused security updates. */
export function ownerDecisions(outputs: Output[]): { repository: string; entry: Entry }[] {
  return outputs.flatMap(output => output.entries.filter(entry => OWNER_DECISIONS.includes(entry.reason ?? "")).map(entry => ({ repository: output.repository, entry })));
}

/** The `## Repository security settings` section: one table per helper result, a row for each repository without one, and the owner decisions. */
export function renderSecuritySettings(outputs: Output[], missing: Missing[] = [], notes: string[] = []): string {
  const lines = ["## Repository security settings", ""];
  for (const note of notes) lines.push(note, "");
  for (const output of outputs) {
    lines.push(`### ${output.repository}`, "");
    const mode = `Mode: \`${output.mode}\`${output.mode_reason ? ` (${code(output.mode_reason)}${output.mode_detail ? `, ${cell(output.mode_detail)}` : ""})` : ""}`;
    const facts = [output.visibility ? `visibility \`${output.visibility}\`` : null, output.admin === null ? null : `admin \`${output.admin}\``,
      output.archived ? "archived" : null].filter(Boolean).join(", ");
    lines.push(`${mode}${facts ? `; ${facts}` : ""}.`, "");
    const { renovate, dependabot } = output.detection;
    if (renovate.status !== "not-checked") lines.push(`Renovate: \`${renovate.status}\`${renovate.evidence ? ` (${cell(renovate.evidence)})` : ""}${renovate.error ? ` (${cell(renovate.error)})` : ""}. Dependabot config: \`${dependabot.status}\`${dependabot.evidence ? ` (${cell(dependabot.evidence)})` : ""}${dependabot.error ? ` (${cell(dependabot.error)})` : ""}.`, "");
    lines.push("| Setting | State | Reason | Detail |", "| --- | --- | --- | --- |");
    for (const entry of output.entries) lines.push(`| \`${entry.setting}\` | \`${entry.state}\` | ${code(entry.reason)} | ${cell(entry.detail)} |`);
    lines.push("");
  }
  for (const item of missing) {
    lines.push(`### ${item.repository}`, "", "| Setting | State | Reason | Detail |", "| --- | --- | --- | --- |", `| all | helper did not run | | ${cell(item.reason)} |`, "");
  }
  lines.push("Owner decisions:", "");
  const decisions = ownerDecisions(outputs);
  if (!decisions.length) lines.push("None.");
  for (const { repository, entry } of decisions) lines.push(`- \`${repository}\` \`${entry.setting}\`: \`${entry.state}\` (\`${entry.reason}\`)${entry.detail ? `, ${cell(entry.detail)}` : ""}`);
  return lines.join("\n") + "\n";
}
