# Installs the pinned Paseo CLI and paseo.service.
# Inputs: version, listen_port, hostnames (a JSON array), hash.
set -euo pipefail
fail() { echo "FAIL: $*"; exit 1; }
root="$HOME/.local/share/paseo"
mkdir -p "$root/runtime" "$root/state" "$root/workspace" "$HOME/.config/systemd/user"
chmod 700 "$root/state"
installed="$(node -p "try{require('$root/runtime/node_modules/@getpaseo/cli/package.json').version}catch{''}")"
if [[ "$installed" != "$version" ]]; then
  npm install --silent --no-fund --no-audit --prefix "$root/runtime" --save-exact "@getpaseo/cli@$version" >&2 \
    || fail "npm install @getpaseo/cli@$version failed"
fi
bin="$root/runtime/node_modules/.bin/paseo"
[[ -x "$bin" ]] || fail "paseo is missing after the install"
[[ -d "$root/workspace/.git" ]] || git init -q "$root/workspace"
cfg() { "$bin" daemon config set "$1" "$2" --home "$root/state" >/dev/null || fail "paseo daemon config set $1 failed"; }
cfg daemon.listen "127.0.0.1:$listen_port"
cfg daemon.hostnames "$hostnames"
cfg daemon.relay.enabled false
cfg pluginsEnabled false
cfg agents.skills.selection '{"mode":"custom","skills":[]}'
cfg features.webUi.enabled true
# The same persistence path as `paseo daemon set-password`, with a hash made on the operator host.
(cd "$root/runtime" && PASEO_STATE="$root/state" PASEO_HASH="$hash" node --input-type=module -e '
const { readPersistedConfig, savePersistedConfig } = await import("@getpaseo/server/configuration");
const home = process.env.PASEO_STATE;
const c = readPersistedConfig(home);
savePersistedConfig(home, { ...c, daemon: { ...c.daemon, auth: { ...c.daemon?.auth, password: process.env.PASEO_HASH } } });
') || fail "writing the password hash failed"
stored="$(node -p "require('$root/state/config.json').daemon.auth.password")"
[[ "$stored" == "$hash" ]] || fail "the stored password hash does not match"

unit_path=""
for a in codex copilot claude; do
  p="$(command -v "$a" || true)"
  [[ -n "$p" ]] || continue
  d="$(dirname "$p")"
  case ":$unit_path" in *":$d:"*) ;; *) unit_path="$unit_path$d:" ;; esac
done
unit_path="$unit_path$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
unit="$HOME/.config/systemd/user/paseo.service"
cat >"$unit" <<UNIT
[Unit]
Description=Paseo agent daemon
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
WorkingDirectory=%h
Environment="PATH=$unit_path"
ExecStart=$(command -v node) --disable-warning=DEP0040 $root/runtime/node_modules/@getpaseo/cli/bin/paseo daemon run --home $root/state
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable -q paseo.service || fail "enabling paseo.service failed"
systemctl --user restart paseo.service || fail "restarting paseo.service failed"
for _ in $(seq 1 30); do
  curl -fsS --max-time 2 "http://127.0.0.1:$listen_port/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS --max-time 2 "http://127.0.0.1:$listen_port/api/health" >/dev/null 2>&1 \
  || fail "paseo.service does not answer on 127.0.0.1:$listen_port"
