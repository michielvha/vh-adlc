# Trusts the server's host keys and writes the alias block on a Mac.
# Inputs: name, known_name, host_keys (one "type base64" per line),
# host_name, port, user, key_name.
set -euo pipefail
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
kh="$HOME/.ssh/known_hosts"
cfg="$HOME/.ssh/config"
touch "$kh" "$cfg"
chmod 600 "$cfg"
ssh-keygen -R "$known_name" -f "$kh" >/dev/null 2>&1 || true
rm -f "$kh.old"
while IFS= read -r k; do
  if [[ -n "$k" ]]; then printf '%s %s\n' "$known_name" "$k" >>"$kh"; fi
done <<<"$host_keys"

cp -p "$cfg" "$cfg.bak-paseo-hosts"
tmp="$(mktemp "$cfg.XXXXXX")"
awk -v n="$name" '
  $0 == "# BEGIN paseo-hosts " n || $0 == "# BEGIN paseo-host " n { skip = 1; next }
  skip && ($0 == "# END paseo-hosts " n || $0 == "# END paseo-host " n) { skip = 0; next }
  !skip { lines[++c] = $0 }
  END { while (c > 0 && lines[c] == "") c--; for (i = 1; i <= c; i++) print lines[i]; if (c > 0) print "" }
' "$cfg.bak-paseo-hosts" >"$tmp"
cat >>"$tmp" <<BLOCK
# BEGIN paseo-hosts $name
Host $name
  HostName $host_name
  Port $port
  User $user
  IdentityFile ~/.ssh/$key_name
  IdentitiesOnly yes
  StrictHostKeyChecking yes
# END paseo-hosts $name
BLOCK
chmod 600 "$tmp"
mv "$tmp" "$cfg"
