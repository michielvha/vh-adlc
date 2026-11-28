#!/bin/sh
# The owner-directed recorded run (#187): the macOS boundary checks a Codex reviewer can't run inside its
# own sandbox, run on this Mac outside any sandbox in a fresh clone of the code commit.
# Usage: run.sh <code commit> <record file>
set -u
commit=$1
record=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
repo=$(cd "$(dirname "$0")/../../../../.." && pwd)
full=$(git -C "$repo" rev-parse --verify "$commit^{commit}") || exit 2
work=$(mktemp -d "${TMPDIR:-/tmp}/vh-recorded-run.XXXXXX")
trap 'rm -rf "$work"' EXIT
git clone -q --no-hardlinks "$repo" "$work/clone" && git -C "$work/clone" checkout -q --detach "$full" || exit 2
cd "$work/clone" || exit 2
export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"
{
  echo "# Recorded unsandboxed run"
  echo
  echo "code commit: $full"
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "host: $(uname -a)"
  echo "bun: $(bun --version)"
  echo "sandboxed: $( /usr/bin/sandbox-exec -p '(version 1)(allow default)' /usr/bin/true 2>/dev/null && echo no || echo yes)"
} > "$record"
step() {
  name=$1; shift
  { echo; echo "## $name"; echo; echo "command: $*"; echo; echo '```text'; } >> "$record"
  "$@" >> "$record" 2>&1
  code=$?
  { echo '```'; echo; echo "exit code: $code"; } >> "$record"
}
step "Boundary test files, outside any sandbox" bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts tests/vh-adlc/loop/owned-process.test.ts
step "AC-10: the route tests inside a Seatbelt sandbox" /usr/bin/sandbox-exec -p '(version 1)(allow default)' bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts
step "Mutant script" python3 tests/vh-adlc/evidence/macos-review-boundary/mutants.py
{ echo; echo "clone status after the run:"; git status --porcelain; } >> "$record"
