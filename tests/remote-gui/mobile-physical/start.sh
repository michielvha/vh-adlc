#!/usr/bin/env bash
# Start the synthetic fixture and one human browser session from an installed
# remote-gui copy, for the physical phone checks. Usage:
#   start.sh <new private run directory> <installed plugin root> [ttl]
# Prints the session id and the owner's direct viewer URL. Stop with
#   <plugin root>/scripts/remote-gui.sh stop <id> --home <run>/home; kill "$(cat <run>/fixture.pid)"
set -euo pipefail
umask 077
run=$1 plugin=$2 ttl=${3:-90m}
mkdir -p -- "$run/home"
here=$(cd -- "${BASH_SOURCE[0]%/*}" && pwd -P)
port=${REMOTE_GUI_FIXTURE_PORT:-18731}
setsid python3 -I "$here/fixture.py" "$run" "$port" >"$run/fixture.log" 2>&1 </dev/null &
for _ in $(seq 50); do curl -fsS "http://127.0.0.1:$port/state" >/dev/null 2>&1 && break; sleep 0.1; done
export REMOTE_GUI_BUILD_CACHE=$run/cache
rg() { bash "$plugin/scripts/remote-gui.sh" "$@"; }
rg start --browser-mode human --transport tailscale --ttl "$ttl" --home "$run/home" >"$run/session.json"
id=$(jq -r .id "$run/session.json")
printf 'session %s, fixture http://127.0.0.1:%s/ (type this into the remote address bar)\n' "$id" "$port"
rg access "$id" --reveal --home "$run/home" | jq -r .url
