#!/usr/bin/env bash
# Prints the path of a vh-adlc binary verified against the plugin's lock.
#
# Sources, in order: a vh-adlc on PATH whose digest and version match the lock,
# then the user cache entry for the locked version, verified on every reuse,
# then the release asset, verified before extraction and again before it runs
# or is cached. A matching version with a wrong or missing digest fails closed.
# The script writes only below the user cache directory.
#
# Usage: ensure-vh-adlc.sh [--offline]
set -euo pipefail

offline=false
for arg in "$@"; do
  case "$arg" in
    --offline) offline=true ;;
    *) echo "vh-adlc: unknown argument $arg" >&2; exit 2 ;;
  esac
done

die() {
  echo "vh-adlc: $*" >&2
  exit 1
}

plugin_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
lock="$plugin_root/vh-adlc.lock.json"
[[ -f "$lock" ]] || die "the lock $lock is missing"

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) die "unsupported operating system $(uname -s)" ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=amd64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) die "unsupported architecture $(uname -m)" ;;
esac
platform="${os}_${arch}"

# The checker holds the lock to one key per line, so these reads are exact.
version=$(sed -n 's/^  "version": "\([0-9][0-9.]*\)",$/\1/p' "$lock")
[[ -n "$version" ]] || die "the lock has no version"
field() {
  awk -v plat="\"$platform\": {" -v key="\"$1\": \"" '
    index($0, plat) { inside = 1; next }
    inside && /^    }/ { exit }
    inside && index($0, key) {
      v = substr($0, index($0, key) + length(key))
      sub(/",?$/, "", v)
      print v
      exit
    }' "$lock"
}
url=$(field url)
asset_sha=$(field asset_sha256)
binary_sha=$(field binary_sha256)
[[ -n "$url" ]] || die "the lock has no asset for $platform"
[[ "$asset_sha" =~ ^[0-9a-f]{64}$ ]] || die "the lock has no asset digest for $platform; refusing to install"
[[ "$binary_sha" =~ ^[0-9a-f]{64}$ ]] || die "the lock has no binary digest for $platform; refusing to install"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

reports_version() {
  [[ "$("$1" --version 2>/dev/null || true)" == "vh-adlc $version" ]]
}

if [[ "$os" == darwin ]]; then
  cache_base="$HOME/Library/Caches"
else
  cache_base="${XDG_CACHE_HOME:-$HOME/.cache}"
fi
cache_dir="$cache_base/vh-adlc/bin/$version/$platform"
cached="$cache_dir/vh-adlc"

# 1. A vh-adlc on PATH.
if candidate=$(command -v vh-adlc 2>/dev/null) && [[ -n "$candidate" ]]; then
  if [[ "$(sha256 "$candidate")" == "$binary_sha" ]]; then
    reports_version "$candidate" || die "$candidate matches the locked digest but reports a version other than $version"
    echo "$candidate"
    exit 0
  fi
  if reports_version "$candidate"; then
    die "$candidate reports vh-adlc $version but its digest does not match the lock; remove it or fix PATH"
  fi
  echo "vh-adlc: ignoring $candidate, which is not vh-adlc $version" >&2
fi

# 2. The user cache entry, verified before every reuse.
if [[ -e "$cached" ]]; then
  [[ "$(sha256 "$cached")" == "$binary_sha" ]] ||
    die "the cached $cached does not match the locked digest; remove it to reinstall"
  reports_version "$cached" || die "the cached $cached reports a version other than $version"
  echo "$cached"
  exit 0
fi

# 3. The release asset.
if [[ "$offline" == true ]]; then
  die "binary unavailable: vh-adlc $version is not cached and --offline forbids a download"
fi
work=$(mktemp -d "${TMPDIR:-/tmp}/vh-adlc-ensure.XXXXXX")
trap 'rm -rf "$work"' EXIT
curl -fsSL --retry 2 -o "$work/asset.tar.gz" "$url" || die "binary unavailable: downloading $url failed"
[[ "$(sha256 "$work/asset.tar.gz")" == "$asset_sha" ]] ||
  die "the downloaded asset's digest does not match the lock; nothing was installed"
mkdir "$work/extract"
tar -xzf "$work/asset.tar.gz" -C "$work/extract" vh-adlc || die "the asset holds no vh-adlc binary"
[[ "$(sha256 "$work/extract/vh-adlc")" == "$binary_sha" ]] ||
  die "the extracted binary's digest does not match the lock; nothing was installed"
chmod 755 "$work/extract/vh-adlc"
reports_version "$work/extract/vh-adlc" ||
  die "the verified binary reports a version other than $version; nothing was installed"
mkdir -p "$cache_dir"
tmp="$cache_dir/.vh-adlc.$$"
cp "$work/extract/vh-adlc" "$tmp"
chmod 755 "$tmp"
mv -f "$tmp" "$cached"
echo "$cached"
