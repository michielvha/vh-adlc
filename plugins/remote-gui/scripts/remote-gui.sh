#!/usr/bin/env bash
set -euo pipefail
umask 077
plugin_root=$(cd -- "${BASH_SOURCE[0]%/*}/.." && pwd -P)
if command -v uname >/dev/null 2>&1 && [[ $(uname -s) != Linux || $(uname -m) != x86_64 ]]; then
  printf '%s\n' '{"schema_version":1,"result":"unsupported-platform","diagnostic":"remote-gui sessions require Linux amd64"}'
  exit 1
fi
go_cmd=${REMOTE_GUI_GO:-go}
if ! command -v "$go_cmd" >/dev/null 2>&1; then
  printf '%s\n' 'remote-gui needs the Go toolchain declared in go.mod. Install Go, then retry; nothing was downloaded.' >&2
  exit 1
fi
for tool in uname sha256sum find sort xargs flock stat mktemp; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'remote-gui build needs the existing host tool: %s\n' "$tool" >&2
    exit 1
  fi
done
export GOTOOLCHAIN=local
export GOWORK=off
export GOPROXY=off
export GOSUMDB=off
build_cache=${REMOTE_GUI_BUILD_CACHE:-${XDG_CACHE_HOME:-${HOME:?HOME or REMOTE_GUI_BUILD_CACHE is required}/.cache}/remote-gui/builds}
if [[ $build_cache != /* || -L $build_cache ]]; then
  printf '%s\n' 'remote-gui build cache must be an absolute user-owned directory, without a symlink at that path.' >&2
  exit 1
fi
mkdir -p -- "$build_cache"
if [[ ! -d $build_cache || ! -O $build_cache || $(stat -c %a -- "$build_cache") != 700 ]]; then
  printf '%s\n' 'remote-gui build cache requires owner-only mode 0700.' >&2
  exit 1
fi
identity=$(
  cd -- "$plugin_root"
  { "$go_cmd" version; "$go_cmd" env GOOS GOARCH; find cmd internal -type f -name '*.go' -print0 | sort -z | xargs -0 sha256sum; sha256sum go.mod; if [[ -f go.sum ]]; then sha256sum go.sum; fi; } | sha256sum
)
identity=${identity%% *}
output=$build_cache/$identity
if [[ -L $output ]]; then exit 1; fi
mkdir -p -- "$output"
if [[ ! -O $output || $(stat -c %a -- "$output") != 700 || -L $output/build.lock ]]; then exit 1; fi
exec 9>"$output/build.lock"
flock 9
if [[ -L $output/remote-gui ]]; then exit 1; fi
if [[ ! -f $output/remote-gui ]]; then
  staged=$(mktemp "$output/.build-XXXXXX")
  trap 'rm -f -- "$staged"' EXIT
  (cd -- "$plugin_root" && CGO_ENABLED=0 "$go_cmd" build -mod=readonly -trimpath -o "$staged" ./cmd/remote-gui)
  chmod 700 -- "$staged"
  mv -- "$staged" "$output/remote-gui"
  trap - EXIT
fi
if [[ ! -O $output/remote-gui || ! -x $output/remote-gui || $(stat -c %a -- "$output/remote-gui") != 700 ]]; then exit 1; fi
flock -u 9
exec 9>&-
exec "$output/remote-gui" "$@"
