#!/usr/bin/env bun
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Supply the verified installed plugin location for this invocation.
const selected = process.env.DOCS_DRIFT_PLUGIN_DIR;
if (!selected) {
  console.error("Setup required. Set DOCS_DRIFT_PLUGIN_DIR to the verified installed vh-adlc plugin directory.");
  process.exit(2);
}
try {
  const plugin = realpathSync(selected);
  const { main } = await import(pathToFileURL(join(plugin, "scripts/docs-drift/cli.ts")).href);
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Documentation drift setup failed");
  process.exitCode = 2;
}
