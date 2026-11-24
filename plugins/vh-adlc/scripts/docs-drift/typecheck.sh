#!/usr/bin/env bash
# Keep build dependencies outside the installed plugin payload.
set -euo pipefail
component_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
bun_bin=${BUN_BIN:-bun}
package_manager=$("$bun_bin" --eval 'console.log((await Bun.file(process.argv[1]).json()).packageManager)' "$component_dir/package.json")
if [[ "bun@$("$bun_bin" --version)" != "$package_manager" ]]; then
  printf 'Use the declared %s toolchain\n' "$package_manager" >&2
  exit 1
fi
compiler_work=$(mktemp -d "${TMPDIR:-/tmp}/vh-docs-drift-types.XXXXXX")
trap 'rm -rf "$compiler_work"' EXIT
cp "$component_dir/package.json" "$component_dir/bun.lock" "$compiler_work/"
"$bun_bin" install --frozen-lockfile --ignore-scripts --cwd "$compiler_work"
"$compiler_work/node_modules/.bin/tsc" --noEmit --project "$component_dir/tsconfig.json" \
  --typeRoots "$compiler_work/node_modules/@types"
