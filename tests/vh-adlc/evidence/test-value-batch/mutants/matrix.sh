#!/usr/bin/env bash
# Refusal mutant matrix with retained logs. Each run applies one textual mutant to a tracked source file,
# runs one test selection, restores the file with git checkout, and keeps the full log.
# Usage: matrix.sh <repo> <out-dir>
set -uo pipefail
R=$1 OUT=$2
mkdir -p "$OUT"
cd "$R"
NP=tests/vh-adlc/docs-drift/normal-preparation.test.ts
BEFORE=tests/vh-adlc/docs-drift/zz-np-before.test.ts   # the four-variant version, from commit 448ce516
RA=tests/vh-adlc/docs-drift/run-approval.test.ts
RD=tests/vh-adlc/docs-drift/run-directory.test.ts
specs=(
  "A|plugins/vh-adlc/scripts/docs-drift/run-approval.ts|if (!existsSync(join(run.directory, \"approval.yaml\"))) throw new SetupRequired|if (false) throw new SetupRequired"
  "B|plugins/vh-adlc/scripts/docs-drift/run-approval.ts|if (approved.manifest_sha256 !== manifestDigest(manifest)) throw Error(\"Approval must bind|if (false) throw Error(\"Approval must bind"
  "D|plugins/vh-adlc/scripts/docs-drift/run-cli.ts|} else if (run.origin !== \"original\") {|} else if (false) {"
  "E|plugins/vh-adlc/scripts/docs-drift/run-directory.ts|for (const reference of Object.values(stage.artifacts)) readBoundArtifact({ source_repo: options.repo, artifact_root: scope.directory, reference });|void stage;"
)
one() { # id file from to testfile pattern name
  local id=$1 file=$2 from=$3 to=$4 testfile=$5 pattern=$6 name=$7
  local log="$OUT/$id-$name.log"
  if ! git diff --quiet -- "$file"; then echo "$id $name refused: $file already modified"; return; fi
  python3 -I - "$file" "$from" "$to" <<'PY' || { echo "$id $name not-applied"; return; }
import sys
path, a, b = sys.argv[1:4]
s = open(path).read()
if s.count(a) != 1: sys.exit(1)
open(path, "w").write(s.replace(a, b))
PY
  local args=(test --timeout 1200000 "$testfile"); [ -n "$pattern" ] && args+=(-t "$pattern")
  { echo "# mutant $id: $file"; echo "# from: $from"; echo "# to:   $to"; echo "# command: bun ${args[*]}"; echo "# source diff:"; git diff -- "$file"; echo "# run:"; } > "$log"
  local start=$(date +%s)
  PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH" bun "${args[@]}" >> "$log" 2>&1
  local status=$?
  git checkout -- "$file"
  local verdict=survived; [ $status -ne 0 ] && verdict=killed
  grep -qE '^Ran [1-9]' "$log" || verdict=no-tests-ran
  echo "$id $name $verdict $(( $(date +%s) - start ))s"
}
uptime
for spec in "${specs[@]}"; do
  IFS='|' read -r id file from to <<<"$spec"
  one "$id" "$file" "$from" "$to" "$RA" "" "run-approval"
  one "$id" "$file" "$from" "$to" "$RD" "" "run-directory"
  for v in matching caller-change mixed-plans prepare-protocol; do
    one "$id" "$file" "$from" "$to" "$BEFORE" "owned candidate: $v\$" "before-$v"
  done
  one "$id" "$file" "$from" "$to" "$NP" "owned candidate: matching\$" "after-matching"
  uptime
done
