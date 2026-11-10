# Prints the client key's public half, if it exists. Input: key_name.
set -euo pipefail
f="$HOME/.ssh/$key_name.pub"
if [[ -f "$f" ]]; then echo "PUB=$(head -n 1 "$f")"; fi
