#!/usr/bin/env bash
# Reuse the repository's locked compiler; runtime code needs only Bun and gh.
set -euo pipefail
component_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
compiler_work=$(mktemp -d "${TMPDIR:-/tmp}/vh-security-settings-types.XXXXXX")
trap 'rm -rf "$compiler_work"' EXIT
cp "$component_dir/../docs-impact/package.json" "$component_dir/../docs-impact/bun.lock" "$compiler_work/"
bun install --frozen-lockfile --cwd "$compiler_work"
"$compiler_work/node_modules/.bin/tsc" --noEmit --project "$component_dir/tsconfig.json" \
  --typeRoots "$compiler_work/node_modules/@types"
