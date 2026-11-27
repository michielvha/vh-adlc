#!/bin/sh
# AC-06: run one real review through the committed Codex command route on this Mac and keep its evidence.
# Usage: run-review.sh <spec|implementation> <commit> <output directory>
# Needs codex-cli signed in, and the verified vh-adlc binary that scripts/ensure-vh-adlc.sh prints.
set -u
kind=$1 commit=$2 out=$3
repo=$(cd "$(dirname "$0")/../../../.." && pwd)
pin=e79eaa6a0126f2e8ddca2cf14e3db3067b244cc7
binary=$(bash "$repo/plugins/vh-adlc/scripts/ensure-vh-adlc.sh")
mkdir -p "$out"
cd "$repo" || exit 1
git status --porcelain > "$out/status-before.txt"
{ date -u +%Y-%m-%dT%H:%M:%SZ; uname -a; codex --version; git rev-parse "$commit"; } > "$out/environment.txt"
bun plugins/vh-adlc/scripts/loop/cli.ts route --repo . --operation "$([ "$kind" = spec ] && echo "spec review" || echo review)" > "$out/route.json"
bun plugins/vh-adlc/scripts/loop/cli.ts review --repo . --document docs/specs/macos-review-boundary.md --commit "$commit" \
  --kind "$kind" --docs-revision "$pin" --binary "$binary" --plugin-pin "$pin" > "$out/outcome.json" 2> "$out/stderr.txt"
echo "exit=$?" >> "$out/environment.txt"
git status --porcelain > "$out/status-after.txt"
cmp -s "$out/status-before.txt" "$out/status-after.txt" && echo "status unchanged" >> "$out/environment.txt" || echo "STATUS CHANGED" >> "$out/environment.txt"
