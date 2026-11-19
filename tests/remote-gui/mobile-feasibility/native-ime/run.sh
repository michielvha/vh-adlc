#!/bin/bash
set -euo pipefail
p=$1
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
test -d "$p"
test ! -e "$p/engine-ready"
. /home/m/.config/remote-gui/runtime.env
export PATH="$(dirname "$REMOTE_GUI_XVFB"):$PATH"
export XDG_CONFIG_HOME="$p/config"
export XDG_CACHE_HOME="$p/cache"
export IBUS_ADDRESS="unix:path=$p/ibus"
export GTK_IM_MODULE=ibus
export XMODIFIERS=@im=ibus
ibus-daemon --single --address "$IBUS_ADDRESS" --emoji-extension disable >"$p/ibus.log" 2>&1 &
daemon=$!
trap 'kill "$daemon" ${engine:-} 2>/dev/null || true; wait || true' EXIT
for _ in {1..40}; do
  [[ -S "$p/ibus" ]] && break
  sleep .1
done
/usr/bin/python3 "$source_dir/engine.py" "$p" >"$p/engine.log" 2>&1 &
engine=$!
for _ in {1..40}; do
  [[ -f "$p/engine-ready" ]] && break
  sleep .1
done
test -f "$p/engine-ready"
/usr/bin/python3 "$source_dir/host.py" "$p" "$REMOTE_GUI_CHROMIUM"
