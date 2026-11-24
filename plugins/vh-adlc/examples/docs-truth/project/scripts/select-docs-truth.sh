#!/usr/bin/env bash
set -euo pipefail

mode=${1:-next}
if [[ $# -gt 1 || ( "$mode" != next && "$mode" != report ) ]]; then
  printf '%s\n' 'Usage: bash scripts/select-docs-truth.sh [next|report]' >&2
  exit 2
fi

history=$(git show HEAD:.vh-adlc/docs-truth-history.tsv) || exit 1
paths=$(git ls-tree -r --name-only HEAD -- README.md docs/current/) || exit 1
inventory=$(
  awk -F '\t' '
    FILENAME == ARGV[1] {
      if (NF > 0) verified[$1] = $2
      next
    }
    /.md$/ {
      if ($0 in verified) printf "1\t%s\t%s\tverified %s\n", verified[$0], $0, verified[$0]
      else printf "0\t\t%s\tnever verified\n", $0
    }
  ' <(printf '%s\n' "$history") <(printf '%s\n' "$paths") |
    LC_ALL=C sort | cut -f 3-
)

if [[ "$mode" == report ]]; then
  count=$(printf '%s\n' "$inventory" | awk 'NF { n++ } END { print n + 0 }')
  printf '%s eligible documents\n' "$count"
fi
if [[ -n "$inventory" ]]; then
  printf '%s\n' "$inventory"
fi
