import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const plugin = resolve(import.meta.dir, "../../../plugins/vh-adlc");
for (const path of ["references/audit.md", "references/audit-record.md", "references/audit-review.md", "references/lifecycle.md"]) test(`${path} preserves the separate-feature selection boundary`, () => {
  const text = readFileSync(resolve(plugin, path), "utf8");
  for (const term of ["separate feature", "separate PR", "owner merges", "explicit reselection"]) expect(text).toContain(term);
});
