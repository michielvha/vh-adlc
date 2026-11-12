# Starts the Paseo app on a Mac. Inputs: app, debug_port (empty for none),
# wait_ms. It waits up to wait_ms for the app's main process.
set -euo pipefail
if [[ -z "$debug_port" ]]; then
  open -a "$app"
else
  open -a "$app" --args "--remote-debugging-port=$debug_port"
fi
for ((i = 0; i < wait_ms / 100; i++)); do
  if pgrep -f -- "^${app}/Contents/MacOS/Paseo( |\$)" >/dev/null 2>&1; then
    echo "LAUNCHED=yes"
    exit 0
  fi
  sleep 0.1
done
echo "FAIL: the Paseo app did not start within $((wait_ms / 1000)) seconds"
exit 1
