/** Navigation and actual CLI grammar for the public setup/handoff. Host acceptance remains separate. */
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseRunOptions } from "../../../plugins/vh-adlc/scripts/docs-drift/run-cli";

const root = resolve(import.meta.dir, "../../..");
const guides = ["README.md", "docs/user-guides/workflows.md", "docs/reference/compatibility.md",
  "docs/reference/marketplace.md", "docs/get-started/installation.md"];

test("mixed-root guides describe committed editing policy and its original-source binding", () => {
  const settings = readFileSync(resolve(root, "plugins/vh-adlc/references/docs-drift-settings.md"), "utf8");
  for (const field of ["local_documents", "exclude_patterns", "editable_parts", "status_aliases", "required_fields", "acceptance_headings", "committedConfigurationDigest"])
    expect(settings).toContain(field);
  expect(settings).toContain("including an empty list");
  expect(settings).toContain("original source commit");
  expect(settings).toContain("without a settings-only");
  const procedure = readFileSync(resolve(root, "plugins/vh-adlc/references/docs-drift.md"), "utf8");
  expect(procedure).toContain("Caller context accepts only");
  expect(procedure).toContain("exact declared acceptance heading");
  const example = readFileSync(resolve(root, "plugins/vh-adlc/examples/docs-drift/basic/.vh-adlc/docs-drift-project.md"), "utf8");
  expect(example).toContain("settings-only preflight digest");
});

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
  const values: Record<string, string> = { "<project>": root, "<full-commit>": "a".repeat(40),
    "<new-private-external-directory>": "/fixture/run" };
  for (const command of commands) {
    const parsed = parseRunOptions(command.map(word => values[word] ?? word));
    expect(parsed.command).toBe("scan");
    expect(parsed.repo).toBe(root);
    expect(parsed.source).toBe("a".repeat(40));
  }
});


test.each(["plugins/vh-adlc/references/docs-drift-settings.md", "plugins/vh-adlc/examples/docs-drift/README.md"])(
  "%s explains reserved hosted production execution", path => {
    const text = readFileSync(resolve(root, path), "utf8").replace(/\s+/gu, " ");
    for (const token of ["`hosted`", "`GITHUB_ACTIONS=true`", "`GITHUB_RUN_ID`", "`GITHUB_RUN_ATTEMPT`", "`reports.workflow_id`"]) expect(text).toContain(token);
    expect(text).toContain("Other profiles are local and refuse Actions production effects.");
    expect(text).not.toContain("`hosted` profiles can be invoked from any supported harness");
  },
);
