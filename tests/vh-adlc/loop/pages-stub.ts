// A stand-in vh-adlc binary for review dispatch tests: `knowledge` writes each requested page into the
// docs cache the CLI reads at `revision` (under XDG_CACHE_HOME, or HOME/Library/Caches on macOS) and
// answers as the real binary does. With `fail`, it answers `unreachable` and writes nothing. With
// `pages`, a listed page gets the given text instead of a heading. Every call is logged.
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function pagesStub(revision = "abc", options: { fail?: boolean; pages?: Record<string, string> } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-pages-"))), log = join(dir, "calls.log"), source = join(dir, "source");
  const cache = process.platform === "darwin" ? join(dir, "Library", "Caches") : join(dir, "cache");
  mkdirSync(cache, { recursive: true });
  for (const [page, text] of Object.entries(options.pages ?? {})) { mkdirSync(join(source, dirname(page)), { recursive: true }); writeFileSync(join(source, page), text); }
  const binary = join(dir, "vh-adlc"), docs = JSON.stringify(join(cache, "vh-adlc", "docs", revision));
  writeFileSync(binary, `#!/bin/bash
echo "$*" >> ${JSON.stringify(log)}
[ "$1" = knowledge ] || exit 2
${options.fail ? `echo '{"schema_version":1,"command":"knowledge","result":"unreachable","knowledge":null,"data":null,"findings":[]}'; exit 1` : ""}
pages=(); while [ $# -gt 0 ]; do [ "$1" = --page ] && { pages+=("$2"); shift; }; shift; done
for p in "\${pages[@]}"; do mkdir -p ${docs}/"$(dirname "$p")"; if [ -f ${JSON.stringify(source)}/"$p" ]; then cp ${JSON.stringify(source)}/"$p" ${docs}/"$p"; else echo "# $p" > ${docs}/"$p"; fi; done
echo '{"schema_version":1,"command":"knowledge","result":"answered","knowledge":{"revision":"${revision}"},"data":{"pages":[]},"findings":[]}'
`);
  chmodSync(binary, 0o700);
  return { dir, binary, cache, log, env: { XDG_CACHE_HOME: cache, HOME: dir } };
}
