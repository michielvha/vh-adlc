#!/usr/bin/env bash
# Mutant C (original-host check of an opened run) with retained logs. Usage: mutC.sh <repo> <out-dir>
set -uo pipefail
R=$1 OUT=$2
mkdir -p "$OUT"
cd "$R"
F=plugins/vh-adlc/scripts/docs-drift/run-directory.ts
FROM='if (current.origin !== "original") fail("original host ownership required");'
TO='if (run.origin !== "original") fail("original host ownership required");'
run() { # testfile name
  local log="$OUT/C2-$2.log"
  git diff --quiet -- "$F" || { echo "refused: $F modified"; return; }
  python3 -I - "$F" "$FROM" "$TO" <<'PY' || { echo "C2 $2 not-applied"; return; }
import sys
path, a, b = sys.argv[1:4]
s = open(path).read()
if s.count(a) != 1: sys.exit(1)
open(path, "w").write(s.replace(a, b))
PY
  { echo "# mutant C2 (trust the opened run's cached origin): $F"; echo "# from: $FROM"; echo "# to:   $TO"; echo "# command: bun test --timeout 60000 $1"; echo "# source diff:"; git diff -- "$F"; echo "# run:"; } > "$log"
  PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH" bun test --timeout 60000 "$1" >> "$log" 2>&1
  local status=$?
  git checkout -- "$F"
  echo "C2 $2 exit=$status $(grep -E '^ *[0-9]+ (pass|fail)' "$log" | tr -s ' \n' ' ')"
}
run tests/vh-adlc/docs-drift/zz-rd-base.test.ts run-directory-task-base
run tests/vh-adlc/docs-drift/run-directory.test.ts run-directory-head
