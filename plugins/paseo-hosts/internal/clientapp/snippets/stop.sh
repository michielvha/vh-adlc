# Quits the Paseo app on a Mac and waits for its update installer.
# Inputs: app, wait_ms, fallback (TERM or KILL), floor_ms, the least time
# to wait once the app is gone, and limit_ms, the longest time to wait for
# the installer.
set -euo pipefail
pattern="^${app}/Contents/MacOS/Paseo( |\$)"
# The app updates itself, so read its bundle identifier on each run.
id=$(PATH="$PATH:/usr/libexec" PlistBuddy -c 'Print CFBundleIdentifier' "$app/Contents/Info.plist" 2>/dev/null) || id=""
if [[ "$id" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]]; then
  src=file
else
  id=sh.paseo.desktop
  src=fallback
fi
echo "INSTALLER=$id.ShipIt"
echo "INSTALLER_SOURCE=$src"
# Squirrel.Mac passes the job label <identifier>.ShipIt to ShipIt; match
# it whole so other apps' ShipIt jobs do not count.
escaped=$(printf '%s' "$id" | sed 's/\./\\./g')
installer="(^|[^A-Za-z0-9.-])$escaped\\.ShipIt([^A-Za-z0-9.-]|\$)"
running() { pgrep -f -- "$pattern" >/dev/null 2>&1; }
installing() { pgrep -f -- "$installer" >/dev/null 2>&1; }
gone() {
  local i
  for ((i = 0; i < wait_ms / 100; i++)); do
    running || return 0
    sleep 0.1
  done
  ! running
}
if ! running; then
  stopped=none
else
  osascript -e "tell application id \"$id\" to quit" >/dev/null 2>&1 || true
  if gone; then
    stopped=graceful
  else
    pkill "-$fallback" -f -- "$pattern" >/dev/null 2>&1 || true
    if ! gone; then
      echo "FAIL: the Paseo app did not stop"
      exit 1
    fi
    stopped=$fallback
  fi
fi
echo "STOPPED=$stopped"
# waited counts only the sleeps, so it never runs ahead of the clock;
# SECONDS bounds the limit when the checks themselves take time.
waited=0
SECONDS=0
while ((waited < floor_ms)) || installing; do
  if ((waited >= limit_ms || (SECONDS - 1) * 1000 >= limit_ms)); then
    echo "INSTALLING=yes"
    exit 0
  fi
  sleep 0.1
  waited=$((waited + 100))
done
