# Waits for the app's SSH tunnel to a server. Inputs: name, port, wait_ms.
set -euo pipefail
pattern="-W 127[.]0[.]0[.]1:${port} ${name}( |\$)"
for ((i = 0; i < wait_ms / 100; i++)); do
  if pgrep -f -- "$pattern" >/dev/null 2>&1; then
    echo "TUNNEL=yes"
    exit 0
  fi
  sleep 0.1
done
echo "FAIL: the app opened no SSH tunnel to ${name} within $((wait_ms / 1000)) seconds"
exit 1
