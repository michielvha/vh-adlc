#!/usr/bin/env bash
# Keep compiler dependencies outside the plugin payload used by confinement/export checks.
set -euo pipefail
component_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
compiler_work=$(mktemp -d "${TMPDIR:-/tmp}/vh-docs-types.XXXXXX")
trap 'rm -rf "$compiler_work"' EXIT
cp "$component_dir/package.json" "$component_dir/bun.lock" "$compiler_work/"
bun install --frozen-lockfile --cwd "$compiler_work"
"$compiler_work/node_modules/.bin/tsc" --noEmit --project "$component_dir/tsconfig.json" \
  --typeRoots "$compiler_work/node_modules/@types"
