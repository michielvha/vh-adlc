#!/bin/sh
# AC-06: run one real review through the Codex command route on this Mac and keep its evidence.
# Usage: run-review.sh <spec|implementation> <commit> <output directory>
# Needs codex-cli signed in. The controller runs from a clean clone of <commit>, so the route, the policy
# and the route code are the commit's own. Exits nonzero unless the outcome is `ready` for that commit,
# the route is a command route, and the owning worktree's status, ignored files, HEAD, index and refs are
# unchanged.
set -u
kind=$1 commit=$2 out=$3
repo=$(cd "$(dirname "$0")/../../../.." && pwd)
pin=e79eaa6a0126f2e8ddca2cf14e3db3067b244cc7
fail() { echo "FAIL: $*" | tee -a "$out/environment.txt" >&2; exit 1; }
mkdir -p "$out"
full=$(git -C "$repo" rev-parse --verify "$commit^{commit}") || { echo "unknown commit $commit" >&2; exit 2; }
controller=$(mktemp -d "${TMPDIR:-/tmp}/vh-run-review.XXXXXX")
trap 'rm -rf "$controller"' EXIT
git clone -q --no-hardlinks "$repo" "$controller/clone" && git -C "$controller/clone" checkout -q --detach "$full" || fail "could not check out $full"
cli="$controller/clone/plugins/vh-adlc/scripts/loop/cli.ts"
binary=$(bash "$controller/clone/plugins/vh-adlc/scripts/ensure-vh-adlc.sh") || fail "no verified vh-adlc binary"
state() {
  git -C "$repo" status --porcelain=v1 --ignored --untracked-files=all
  git -C "$repo" rev-parse HEAD
  git -C "$repo" symbolic-ref -q HEAD || echo detached
  git -C "$repo" for-each-ref --format='%(refname) %(objectname)'
  git -C "$repo" ls-files --stage -v
  shasum -a 256 "$(git -C "$repo" rev-parse --absolute-git-dir)/index"
}
{ date -u +%Y-%m-%dT%H:%M:%SZ; uname -a; codex --version; echo "commit=$full"; echo "kind=$kind"; } > "$out/environment.txt"
operation=$([ "$kind" = spec ] && echo "spec review" || echo review)
bun "$cli" route --repo "$controller/clone" --operation "$operation" > "$out/route.json" || fail "route lookup failed"
grep -q '"route":"command"' "$out/route.json" || fail "the route at $full is not a command route: $(cat "$out/route.json")"
state > "$out/state-before.txt"
marker="$controller/started"; : > "$marker"
bun "$cli" review --repo "$repo" --document docs/specs/macos-review-boundary.md --commit "$full" \
  --kind "$kind" --docs-revision "$pin" --binary "$binary" --plugin-pin "$pin" > "$out/outcome.json" 2> "$out/stderr.txt"
echo "review_exit=$?" >> "$out/environment.txt"
state > "$out/state-after.txt"
transcript=$(find "$HOME/.codex/sessions" -name 'rollout-*.jsonl' -newer "$marker" 2>/dev/null | xargs grep -l "$full" 2>/dev/null | head -1)
[ -n "$transcript" ] && cp "$transcript" "$out/transcript.jsonl" && echo "transcript=$(basename "$transcript")" >> "$out/environment.txt"
python3 - "$out/outcome.json" "$out/records.txt" <<'PY' || fail "could not read the outcome"
import json, sys
outcome = json.load(open(sys.argv[1]))
open(sys.argv[2], "w").write(outcome.get("records", ""))
print(outcome.get("status"), outcome.get("model"), outcome.get("target"), outcome.get("reason", ""))
PY
cmp -s "$out/state-before.txt" "$out/state-after.txt" || fail "the owning worktree changed during the review"
grep -q '"status":"ready"' "$out/outcome.json" || fail "the outcome is not ready: $(head -c 400 "$out/outcome.json")"
grep -q "\"target\":\"$full\"" "$out/outcome.json" || fail "the outcome names another target"
[ -s "$out/transcript.jsonl" ] || fail "no Codex session log mentions $full"
echo "result=ready, unchanged" >> "$out/environment.txt"
