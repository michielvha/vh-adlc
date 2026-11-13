// The loop's user-facing terms (docs/specs/shared-development-loop.md, Glossary) are defined once in the
// settings reference and used with that meaning; the loop references, reports and code use no other name.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PLUGIN = resolve(import.meta.dir, "../../../plugins/vh-adlc");
const TERMS: Record<string, string[]> = {
  "Loop role": ["agent role", "loop stage"],
  "Route": ["dispatch mode", "review channel"],
  "Enrolled spec": ["migrated spec", "adopted spec"],
  "Verification rung": ["verification gate", "check rung"],
  "Project procedure": ["project playbook", "local procedure file"],
  "Primary worktree": ["root checkout", "main worktree"],
  "No publication path": ["nothing to publish", "no-publish"],
  "Delivered": ["fully shipped", "published and done"],
};
const files = () => [
  ...["loop-settings.md", "review-protocol.md", "loop.md", "authority.md"].map(name => join(PLUGIN, "references", name)),
  ...readdirSync(join(PLUGIN, "scripts", "loop")).map(name => join(PLUGIN, "scripts", "loop", name)),
];

describe("the loop glossary", () => {
  test("the settings reference defines every term in its Terms table", () => {
    const reference = readFileSync(join(PLUGIN, "references", "loop-settings.md"), "utf8");
    const table = reference.slice(reference.indexOf("## Terms"), reference.indexOf("\n## ", reference.indexOf("## Terms") + 1));
    for (const term of Object.keys(TERMS)) expect([term, table.includes(`| ${term} |`)]).toEqual([term, true]);
  });

  test("the loop references, reports and code use no rejected synonym", () => {
    const hits: string[] = [];
    for (const path of files()) {
      const text = readFileSync(path, "utf8").toLowerCase();
      for (const [term, synonyms] of Object.entries(TERMS)) for (const synonym of synonyms)
        if (text.includes(synonym)) hits.push(`${path.slice(PLUGIN.length + 1)}: "${synonym}" (use "${term}")`);
    }
    expect(hits).toEqual([]);
  });
});
