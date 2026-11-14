#!/usr/bin/env bun
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// The operator first verifies the release and supplies its immutable checkout.
try {
  const argv = process.argv.slice(2), flags = ["--repo", "--source", "--component-repo", "--component-source", "--component-pin"];
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
  const { readGit } = await module("scripts/docs-drift/git.ts");
  const { readYAML } = await module("scripts/settings-file.ts");
  const { parseComponentPin } = await module("scripts/docs-drift/adoption.ts");
  const { computeComponentIdentity } = await module("scripts/docs-drift/bootstrap.ts");
  const source = get("--source"), expected = get("--component-source"), pinPath = get("--component-pin");
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(source) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(expected)
    || !/^\.vh-adlc\/docs-drift-components\/[A-Za-z0-9_.-]+\.yaml$/u.test(pinPath)) throw Error("Immutable source and component pin required");
  const bytes = readGit(realpathSync(get("--repo")), "show", source + ":" + pinPath);
  const pin = parseComponentPin(readYAML(bytes, (reason: string) => { throw Error(reason); }, { offline: true }));
  const actual = computeComponentIdentity(realpathSync(get("--component-repo")), expected);
  if (pin.source_repository !== "michielvha/vh-adlc" || pin.source_commit !== expected
    || pin.plugin_version !== actual.plugin_version || pin.component_sha256 !== actual.component_sha256)
    throw Error("Setup required. The selected component does not match the committed collection pin.");
  console.log(JSON.stringify({ schema_version: 1, outcome: "component-matched", source_commit: expected,
    plugin_version: actual.plugin_version, component_sha256: actual.component_sha256, authority: "none" }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Component setup failed");
  process.exitCode = 2;
}
