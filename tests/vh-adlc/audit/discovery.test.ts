import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const plugin = resolve(import.meta.dir, "../../../plugins/vh-adlc");
test("audit is a native discoverable skill with portable shared references and no harness/model pin", () => {
  const text = readFileSync(resolve(plugin, "skills/vh-adlc-audit/SKILL.md"), "utf8");
  const header = text.match(/^---\n([\s\S]*?)\n---/); expect(header).not.toBe(null);
  const metadata = Bun.YAML.parse(header![1]); expect(metadata.name).toBe("vh-adlc-audit");
  expect(Object.keys(metadata).sort()).toEqual(["description", "name"]);
  for (const file of ["references/audit.md", "references/audit-settings.md", "references/audit-record.md", "references/audit-review.md", "scripts/audit/cli.ts"]) {
    expect(existsSync(resolve(plugin, file))).toBe(true);
  }
  for (const value of ["references/lifecycle.md", "references/authority.md", "references/audit.md", "vh-adlc knowledge", "guides/humanize-prose.md"]) expect(text).toContain(value);
  expect(text).not.toMatch(/^model:|^tools:|^allowed-tools:/m);
});
test("audit documentation separates historical status, provisional proposals, actual proof and separate delivery authority", () => {
  const text = ["audit.md", "audit-settings.md", "audit-record.md", "audit-review.md"].map(name => readFileSync(resolve(plugin, "references", name), "utf8")).join("\n");
  for (const requirement of ["STILL_PRESENT", "FIXED", "PARTIAL", "REGRESSED", "MOOT", "UNKNOWN", "Scope baseline", "Verified source", "source_target", "assessment-only", "authored-repair", "Standing audit workflow authorization", "provisional", "operator attestations", "lost acknowledgement", "cleanup", "full publication diff"]) expect(text).toContain(requirement);
  expect(text).not.toContain("claude-opus-5.5"); // The owner chooses review model; the operation stays portable.
});
