# Preflight for onboard. Inputs: listen_port, publish (yes or no).
# Prints facts as KEY=value lines and each Serve route as ROUTE=<port> <proxy>.
set -euo pipefail
fail() { echo "FAIL: $*"; exit 1; }
command -v node >/dev/null || fail "node is not on PATH"
command -v npm >/dev/null || fail "npm is not on PATH"
command -v git >/dev/null || fail "git is not on PATH"
[[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" == yes ]] \
  || fail "user lingering is off; run: sudo loginctl enable-linger $USER"
if ss -ltn "sport = :$listen_port" | grep -q LISTEN; then
  held=no
  if systemctl --user -q is-active paseo.service; then
    configured="$(node -p "try{require(process.env.HOME+'/.local/share/paseo/state/config.json').daemon.listen}catch{''}")"
    [[ "$configured" == "127.0.0.1:$listen_port" ]] && held=yes
  fi
  [[ "$held" == yes ]] || fail "port $listen_port is in use by something other than paseo.service"
fi
agents=()
for a in codex copilot claude; do
  if command -v "$a" >/dev/null; then agents+=("$a"); fi
done
[[ ${#agents[@]} -gt 0 ]] || fail "no agent CLI (codex, copilot or claude) on PATH"
dns=""
if command -v tailscale >/dev/null; then
  dns="$(tailscale status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))')" \
    || fail "tailscale is installed but its tailnet name could not be read"
  tailscale serve status --json 2>/dev/null | node -e '
let s = "";
process.stdin.on("data", d => s += d).on("end", () => {
  const web = (s.trim() ? JSON.parse(s) : {}).Web || {};
  for (const [hostPort, site] of Object.entries(web)) {
    const proxy = ((site.Handlers || {})["/"] || {}).Proxy || "";
    console.log("ROUTE=" + hostPort.slice(hostPort.lastIndexOf(":") + 1) + " " + proxy);
  }
});' || true
elif [[ "$publish" == yes ]]; then
  fail "tailscale is not on PATH; --publish needs it"
fi
echo "USER=$USER"
echo "DNS=$dns"
echo "AGENTS=${agents[*]}"
