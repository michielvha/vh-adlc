// A stand-in vh-adlc binary for review dispatch tests: `knowledge` writes each requested page into the
// cache under XDG_CACHE_HOME at `revision` and answers as the real binary does. With `fail`, it answers
// `unreachable` and writes nothing. Every call is logged.
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function pagesStub(revision = "abc", options: { fail?: boolean } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-pages-"))), cache = join(dir, "cache"), log = join(dir, "calls.log");
  mkdirSync(cache);
  const binary = join(dir, "vh-adlc");
  writeFileSync(binary, `#!/bin/bash
echo "$*" >> ${JSON.stringify(log)}
[ "$1" = knowledge ] || exit 2
${options.fail ? `echo '{"schema_version":1,"command":"knowledge","result":"unreachable","knowledge":null,"data":null,"findings":[]}'; exit 1` : ""}
pages=(); while [ $# -gt 0 ]; do [ "$1" = --page ] && { pages+=("$2"); shift; }; shift; done
for p in "\${pages[@]}"; do mkdir -p "$XDG_CACHE_HOME/vh-adlc/docs/${revision}/$(dirname "$p")"; echo "# $p" > "$XDG_CACHE_HOME/vh-adlc/docs/${revision}/$p"; done
echo '{"schema_version":1,"command":"knowledge","result":"answered","knowledge":{"revision":"${revision}"},"data":{"pages":[]},"findings":[]}'
`);
  chmodSync(binary, 0o700);
  return { dir, binary, cache, log, env: { XDG_CACHE_HOME: cache } };
}
