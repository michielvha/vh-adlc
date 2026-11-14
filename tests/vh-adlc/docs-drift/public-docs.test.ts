/** Navigation and actual CLI grammar for the public setup/handoff. Host acceptance remains separate. */
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { argumentsForCommand } from "../../../plugins/vh-adlc/scripts/docs-drift/cli";

const root = resolve(import.meta.dir, "../../..");
const guides = ["README.md", "docs/user-guides/workflows.md", "docs/reference/compatibility.md",
  "docs/reference/marketplace.md", "docs/get-started/installation.md"];

test.each(guides)("%s exposes docs-drift and resolves its local documentation links", path => {
  const text = readFileSync(resolve(root, path), "utf8");
  expect(text).toContain("vh-adlc-docs-drift");
  const links = [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)].map(match => match[1])
    .filter(target => target.includes("docs-drift") && !target.includes("://") && !target.startsWith("#"));
  expect(links.length).toBeGreaterThan(0);
  for (const target of links) expect(existsSync(resolve(root, dirname(path), target.split("#")[0]))).toBe(true);
});

test("public docs-drift setup templates pass the real argument parser", () => {
  const commands = guides.flatMap(path => {
    const text = readFileSync(resolve(root, path), "utf8");
    return [...text.matchAll(/bun <installed-plugin>\/scripts\/docs-drift\/cli\.ts ([\s\S]*?)(?=\n```)/gu)]
      .map(match => match[1].replaceAll(/\\\n\s*/gu, " ").trim().split(/\s+/u));
  });
  expect(commands.length).toBeGreaterThan(0);
  const values: Record<string, string> = { "<project>": "/fixture/project", "<full-commit>": "a".repeat(40),
    "<private-external-directory>": "/fixture/artifacts" };
  for (const command of commands) {
    const parsed = argumentsForCommand(command.map(word => values[word] ?? word));
    expect(parsed.command).toBe("scan");
    expect(parsed.repo).toBe("/fixture/project");
    expect(parsed.source).toBe("a".repeat(40));
  }
});
