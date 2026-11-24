#!/usr/bin/env bash
# Builds the paseo-hosts CLI into PASEO_HOSTS_CACHE/builds on first use and runs it.
# The first build downloads the module's dependencies through Go's module proxy
# and verifies them against the committed go.sum.
set -euo pipefail
umask 077
plugin_root=$(cd -- "${BASH_SOURCE[0]%/*}/.." && pwd -P)
if ! command -v go >/dev/null 2>&1; then
  printf '%s\n' 'paseo-hosts needs the Go toolchain declared in go.mod. Install Go, then retry.' >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  sha() { sha256sum "$@"; }
elif command -v shasum >/dev/null 2>&1; then
  sha() { shasum -a 256 "$@"; }
else
  printf '%s\n' 'paseo-hosts build needs sha256sum or shasum.' >&2
  exit 1
fi
export GOTOOLCHAIN=local
export GOWORK=off
cache=${PASEO_HOSTS_CACHE:-${XDG_CACHE_HOME:-${HOME:?HOME or PASEO_HOSTS_CACHE is required}/.cache}/paseo-hosts}
if [[ $cache != /* ]]; then
  printf '%s\n' 'PASEO_HOSTS_CACHE must be an absolute path.' >&2
  exit 1
fi
builds=$cache/builds
mkdir -p -- "$builds"
identity=$(
  cd -- "$plugin_root"
  {
    go version
    go env GOOS GOARCH
    find cmd internal -type f ! -name '*_test.go' -print | LC_ALL=C sort | while IFS= read -r file; do sha "$file"; done
    sha go.mod go.sum scripts/paseo-hosts.sh
  } | sha
)
identity=${identity%% *}
output=$builds/$identity
mkdir -p -- "$output"
if [[ ! -x $output/paseo-hosts ]]; then
  staged=$(mktemp "$output/.build-XXXXXX")
  trap 'rm -f -- "$staged"' EXIT
  (cd -- "$plugin_root" && CGO_ENABLED=0 go build -buildvcs=false -mod=readonly -trimpath -o "$staged" ./cmd/paseo-hosts)
  chmod 700 -- "$staged"
  mv -- "$staged" "$output/paseo-hosts"
  trap - EXIT
fi
exec "$output/paseo-hosts" "$@"
