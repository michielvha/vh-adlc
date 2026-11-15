#!/usr/bin/env bash
# Moves the plugin's binary lock to a published release, when that release changed the binary.
#
#   scripts/release/lock-binary.sh <tag>      e.g. v0.33.0
#
# It does nothing (exit 0, "skip: ...") when the lock already names the tag, when the tag is older
# than the locked version, or when nothing under cmd/, internal/, go.mod or go.sum changed since the
# locked version's tag: every merge to main is released, so most releases rebuild an unchanged binary.
# Otherwise it downloads the release, requires checksums.txt to carry a good signature from the key in
# release-signing-key.asc, checks every archive against it, writes plugins/vh-adlc/vh-adlc.lock.json
# with each archive's digest and its extracted binary's digest, and bumps the plugin's patch version.
# Under GitHub Actions it writes `changed` and `version` to $GITHUB_OUTPUT.
set -euo pipefail

PRIMARY_KEY=9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6
PLATFORMS=(darwin_amd64 darwin_arm64 linux_amd64 linux_arm64)
LOCK=plugins/vh-adlc/vh-adlc.lock.json
MANIFESTS=(plugins/vh-adlc/plugin.json plugins/vh-adlc/.claude-plugin/plugin.json)

tag=${1:?usage: lock-binary.sh <tag>}
version=${tag#v}
cd "$(git rev-parse --show-toplevel)"
output() { [ -n "${GITHUB_OUTPUT:-}" ] && echo "$1" >> "$GITHUB_OUTPUT"; return 0; }
skip() { echo "skip: $1"; output changed=false; exit 0; }

locked=$(jq -r .version "$LOCK")
[ "$version" = "$locked" ] && skip "the lock already names $version"
[ "$(printf '%s\n%s\n' "$locked" "$version" | sort -V | tail -1)" = "$locked" ] && skip "$version is older than the locked $locked"
git diff --quiet "v$locked" "$tag" -- cmd internal go.mod go.sum && skip "no binary change between v$locked and $tag"

work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
gh release download "$tag" --repo michielvha/vh-adlc --dir "$work/dl"
export GNUPGHOME="$work/gnupg"; mkdir -m 700 "$GNUPGHOME"
gpg --batch --quiet --import release-signing-key.asc
# VALIDSIG ends with the primary key's fingerprint, so a signature by any other key fails here.
gpg --batch --status-fd 1 --verify "$work/dl/checksums.txt.sig" "$work/dl/checksums.txt" 2>/dev/null |
  grep -Eq "^\[GNUPG:\] VALIDSIG .* $PRIMARY_KEY$" || { echo "checksums.txt is not signed by $PRIMARY_KEY" >&2; exit 1; }
(cd "$work/dl" && sha256sum --check --strict --quiet checksums.txt)

lock=$(jq -n --arg v "$version" '{version: $v, assets: {}}')
for platform in "${PLATFORMS[@]}"; do
  name="vh-adlc_${version}_${platform}.tar.gz"
  mkdir "$work/$platform" && tar -xzf "$work/dl/$name" -C "$work/$platform"
  lock=$(jq --arg p "$platform" --arg n "$name" --arg a "$(sha256sum "$work/dl/$name" | cut -d' ' -f1)" \
    --arg b "$(sha256sum "$work/$platform/vh-adlc" | cut -d' ' -f1)" \
    --arg u "https://github.com/michielvha/vh-adlc/releases/download/$tag/$name" \
    '.assets[$p] = {name: $n, url: $u, asset_sha256: $a, binary_sha256: $b}' <<<"$lock")
done
printf '%s\n' "$lock" | jq . > "$LOCK"

current=$(jq -r .version "${MANIFESTS[0]}")
next="${current%.*}.$(( ${current##*.} + 1 ))"
for manifest in "${MANIFESTS[@]}"; do sed -i "s/\"version\": \"$current\"/\"version\": \"$next\"/" "$manifest"; done
echo "locked $version; plugin $current -> $next"
output changed=true; output "version=$version"
