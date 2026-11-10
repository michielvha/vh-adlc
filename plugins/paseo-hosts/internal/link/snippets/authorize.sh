# Authorizes a client key for a tunnel to the daemon port only.
# Inputs: port, key ("type base64"), comment.
# `restrict` alone still allows commands, so the forced command stays.
set -euo pipefail
keydata="$(printf '%s\n' "$key" | awk '{print $2}')"
[[ -n "$keydata" ]] || { echo "FAIL: empty public key"; exit 1; }
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
f="$HOME/.ssh/authorized_keys"
touch "$f"
cp -p "$f" "$f.bak-paseo-hosts"
tmp="$(mktemp "$f.XXXXXX")"
grep -vF -- "$keydata" "$f" >"$tmp" || true
printf 'restrict,port-forwarding,permitopen="127.0.0.1:%s",command="/bin/false" %s %s\n' "$port" "$key" "$comment" >>"$tmp"
chmod 600 "$tmp"
mv "$tmp" "$f"
