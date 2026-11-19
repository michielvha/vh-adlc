#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} != --inside-private-bus ]]; then
  : "${REMOTE_GUI_CHROMIUM:?set the installed Chromium executable}"
  : "${REMOTE_GUI_XVFB:?set the installed Xvfb executable}"
  if [[ -z ${1:-} ]]; then
    printf 'Usage: bash %s NEW_ARTIFACT_DIRECTORY\n' "$0" >&2
    exit 2
  fi
  mkdir -m 700 -- "$1"
  mkdir -m 700 -- "$1/runtime" "$1/config" "$1/cache" "$1/data"
  exec env -u DISPLAY -u XAUTHORITY -u AT_SPI_BUS_ADDRESS \
    -u CHROMIUM_FLAGS -u CHROME_FLAGS -u CHROMIUM_USER_FLAGS \
    XDG_RUNTIME_DIR="$1/runtime" XDG_CONFIG_HOME="$1/config" XDG_CACHE_HOME="$1/cache" XDG_DATA_HOME="$1/data" \
    PATH="$(dirname "$REMOTE_GUI_XVFB"):$PATH" \
    dbus-run-session -- xvfb-run -a -e "$1/xvfb.stderr" \
    -s '-screen 0 1024x768x24 -nolisten tcp' bash "$0" --inside-private-bus "$1"
fi

work=$2
here=$(cd -- "$(dirname -- "$0")" && pwd)
launcher=
registry=
cleanup() {
  for pid in "$registry" "$launcher"; do
    if [[ -n $pid ]]; then
      kill "$pid" 2>/dev/null || :
      wait "$pid" 2>/dev/null || :
    fi
  done
}
trap cleanup EXIT

wait_for_bus_name() {
  local watched=$1
  local name=$2
  shift 2
  local reply
  for ((i=0; i<50; i++)); do
    reply=$(gdbus call "$@" --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
      --method org.freedesktop.DBus.NameHasOwner "$name") || return 1
    if [[ $reply == '(true,)' ]]; then return 0; fi
    kill -0 "$watched" || return 1
    sleep .1
  done
  printf '%s did not register on the private bus\n' "$name" >&2
  return 1
}

/usr/libexec/at-spi-bus-launcher --launch-immediately --a11y=1 --screen-reader=1 >"$work/launcher.log" 2>&1 &
launcher=$!
wait_for_bus_name "$launcher" org.a11y.Bus --session
bus_address=$(/usr/bin/python3 -c 'import dbus; print(dbus.SessionBus().get_object("org.a11y.Bus", "/org/a11y/bus", introspect=False).GetAddress(dbus_interface="org.a11y.Bus"))')
AT_SPI_BUS_ADDRESS="$bus_address" DBUS_SESSION_BUS_ADDRESS="$bus_address" \
  /usr/libexec/at-spi2-registryd >"$work/registry.log" 2>&1 &
registry=$!
wait_for_bus_name "$registry" org.a11y.atspi.Registry --address "$bus_address"
case "${REMOTE_GUI_METADATA_PROBE:-chromium}" in
  chromium) probe=editable-metadata.py ;;
  firefox) probe=firefox-editable-probe.py ;;
  *) printf 'Unknown metadata probe\n' >&2; exit 2 ;;
esac
/usr/bin/python3 "$here/$probe" "$work" >"$work/observed.json" 2>"$work/probe.stderr"
