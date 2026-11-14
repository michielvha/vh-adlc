# Deletes paseo.service, the Serve routes to the daemon port, the runtime
# and the password hash, or with purge = yes all of ~/.local/share/paseo.
# Inputs: port, purge.
set -euo pipefail
fail() { echo "FAIL: $*"; exit 1; }
root="$HOME/.local/share/paseo"
unit="$HOME/.config/systemd/user/paseo.service"
if [[ -f "$unit" ]]; then
  systemctl --user disable --now paseo.service >/dev/null 2>&1 || fail "stopping and disabling paseo.service failed"
  rm -f "$unit"
else
  systemctl --user stop paseo.service >/dev/null 2>&1 || true
fi
systemctl --user daemon-reload
systemctl --user reset-failed paseo.service >/dev/null 2>&1 || true
echo "UNIT=removed"
if command -v tailscale >/dev/null; then
  ports="$(tailscale serve status --json 2>/dev/null | TARGET="http://127.0.0.1:$port" node -e '
let s = "";
process.stdin.on("data", d => s += d).on("end", () => {
  const web = (s.trim() ? JSON.parse(s) : {}).Web || {};
  for (const [hostPort, site] of Object.entries(web)) {
    if ((((site.Handlers || {})["/"] || {}).Proxy || "") === process.env.TARGET) console.log(hostPort.slice(hostPort.lastIndexOf(":") + 1));
  }
});')" || fail "reading the Serve routes failed"
  for p in $ports; do
    tailscale serve --https="$p" off >/dev/null 2>&1 || sudo -n tailscale serve --https="$p" off >/dev/null \
      || fail "removing the Serve route on port $p failed"
    echo "ROUTE=$p"
  done
fi
if ss -ltn "sport = :$port" | grep -q LISTEN; then
  fail "something still listens on port $port after paseo.service stopped"
fi
if [[ "$purge" == yes ]]; then
  rm -rf "$root"
else
  rm -rf "$root/runtime" "$root/state/config.json"
fi
