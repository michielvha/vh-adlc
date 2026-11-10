# Deletes a server's alias block, with the paseo-hosts or the local tool's
# paseo-host markers, from a Mac's SSH config. Input: name.
set -euo pipefail
cfg="$HOME/.ssh/config"
[[ -f "$cfg" ]] || exit 0
grep -qxF -e "# BEGIN paseo-hosts $name" -e "# BEGIN paseo-host $name" "$cfg" || exit 0
cp -p "$cfg" "$cfg.bak-paseo-hosts"
tmp="$(mktemp "$cfg.XXXXXX")"
awk -v n="$name" '
  $0 == "# BEGIN paseo-hosts " n || $0 == "# BEGIN paseo-host " n { skip = 1; next }
  skip && ($0 == "# END paseo-hosts " n || $0 == "# END paseo-host " n) { skip = 0; next }
  !skip { lines[++c] = $0 }
  END { while (c > 0 && lines[c] == "") c--; for (i = 1; i <= c; i++) print lines[i] }
' "$cfg.bak-paseo-hosts" >"$tmp"
chmod 600 "$tmp"
mv "$tmp" "$cfg"
