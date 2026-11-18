#!/usr/bin/env bun
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// The operator first verifies the release and supplies its immutable checkout.
try {
  const argv = process.argv.slice(2), flags = ["--repo", "--source", "--component-repo", "--component-source"];
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!flags.includes(flag) || values.has(flag) || !value || value.startsWith("--")) throw Error("Invalid component-check arguments");
    values.set(flag, value);
  }
  if (values.size !== flags.length || !process.env.DOCS_DRIFT_PLUGIN_DIR) throw Error("Complete bound component-check inputs required");
  const get = (flag: string) => values.get(flag)!;
  const plugin = realpathSync(process.env.DOCS_DRIFT_PLUGIN_DIR);
  const module = (path: string) => import(pathToFileURL(join(plugin, path)).href);
  const { loadCommittedSettings } = await module("scripts/docs-drift/settings.ts");
  const { computeComponentIdentity } = await module("scripts/docs-drift/bootstrap.ts");
  const source = get("--source"), expected = get("--component-source");
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(source) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(expected))
    throw Error("Immutable consumer and component sources required");
  const { settings } = loadCommittedSettings(realpathSync(get("--repo")), source);
  if (settings.schema_version !== 2 || !settings.component) throw Error("Set the released component binding in .vh-adlc/docs-drift.yaml.");
  const component = settings.component;
  const actual = computeComponentIdentity(realpathSync(get("--component-repo")), expected);
  if (component.source_commit !== expected || component.plugin_version !== actual.plugin_version
    || component.component_sha256 !== actual.component_sha256)
    throw Error("Setup required. The selected component does not match the committed component binding.");
  console.log(JSON.stringify({ schema_version: 1, outcome: "component-matched", source_commit: expected,
    plugin_version: actual.plugin_version, component_sha256: actual.component_sha256, authority: "none" }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Component setup failed");
  process.exitCode = 2;
}
