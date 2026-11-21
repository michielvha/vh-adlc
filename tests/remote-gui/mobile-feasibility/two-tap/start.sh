#!/usr/bin/env bash
set -euo pipefail
p=$1
. /home/m/.config/remote-gui/runtime.env
export PATH="$(dirname "$REMOTE_GUI_XVFB"):$PATH"
mkdir -p "$p"/{runtime,config,cache,data}
chmod 700 "$p"/{runtime,config,cache,data}
export XDG_RUNTIME_DIR="$p/runtime" XDG_CONFIG_HOME="$p/config" XDG_CACHE_HOME="$p/cache" XDG_DATA_HOME="$p/data"
unset AT_SPI_BUS_ADDRESS CHROMIUM_FLAGS CHROME_FLAGS CHROMIUM_USER_FLAGS
/usr/libexec/at-spi-bus-launcher --launch-immediately --a11y=1 --screen-reader=1 >"$p/launcher.log" 2>&1 &
launcher=$!
trap 'kill "$launcher" ${registry:-} 2>/dev/null || :; wait || :' EXIT
for _ in {1..50}; do
    reply=$(gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.a11y.Bus)
    [[ $reply == '(true,)' ]] && break
    sleep .1
done
AT_SPI_BUS_ADDRESS=$(/usr/bin/python3 -c 'import dbus; print(dbus.SessionBus().get_object("org.a11y.Bus","/org/a11y/bus",introspect=False).GetAddress(dbus_interface="org.a11y.Bus"))')
export AT_SPI_BUS_ADDRESS GTK_A11Y=1 ACCESSIBILITY_ENABLED=1
DBUS_SESSION_BUS_ADDRESS="$AT_SPI_BUS_ADDRESS" /usr/libexec/at-spi2-registryd >"$p/registry.log" 2>&1 &
registry=$!
for _ in {1..50}; do
    reply=$(gdbus call --address "$AT_SPI_BUS_ADDRESS" --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.a11y.atspi.Registry)
    [[ $reply == '(true,)' ]] && break
    sleep .1
done
node "$p/host.cjs"
