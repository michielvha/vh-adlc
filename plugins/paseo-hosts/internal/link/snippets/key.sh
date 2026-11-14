# Creates the client's dedicated key if it is missing. Input: key_name.
set -euo pipefail
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
key="$HOME/.ssh/$key_name"
if [[ ! -f "$key" ]]; then
  ssh-keygen -q -t ed25519 -N "" -C paseo-hosts -f "$key" >/dev/null || { echo "FAIL: ssh-keygen failed"; exit 1; }
fi
echo "PUB=$(cat "$key.pub")"
