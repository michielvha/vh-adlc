# Quits the Paseo app on a Mac. Inputs: app, wait_ms, fallback (TERM or KILL).
set -euo pipefail
pattern="^${app}/Contents/MacOS/Paseo( |\$)"
running() { pgrep -f -- "$pattern" >/dev/null 2>&1; }
gone() {
  local i
  for ((i = 0; i < wait_ms / 100; i++)); do
    running || return 0
    sleep 0.1
  done
  ! running
}
if ! running; then
  echo "STOPPED=none"
  exit 0
fi
osascript -e 'tell application id "sh.paseo.desktop" to quit' >/dev/null 2>&1 || true
if gone; then
  echo "STOPPED=graceful"
  exit 0
fi
pkill "-$fallback" -f -- "$pattern" >/dev/null 2>&1 || true
if gone; then
  echo "STOPPED=$fallback"
  exit 0
fi
echo "FAIL: the Paseo app did not stop"
exit 1
