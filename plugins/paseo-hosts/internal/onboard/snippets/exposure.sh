# Changes Serve routes. Inputs: remove_ports (space separated), add_port, listen_port.
set -euo pipefail
fail() { echo "FAIL: $*"; exit 1; }
serve() { tailscale serve "$@" >/dev/null 2>&1 || sudo -n tailscale serve "$@" >/dev/null; }
for p in $remove_ports; do
  serve --https="$p" off || fail "removing the Serve route on port $p failed"
  echo "REMOVED=$p"
done
if [[ -n "$add_port" ]]; then
  serve --bg --https="$add_port" "http://127.0.0.1:$listen_port" || fail "adding the Serve route on port $add_port failed"
  echo "ADDED=$add_port"
fi
