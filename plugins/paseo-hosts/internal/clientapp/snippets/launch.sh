# Starts the Paseo app on a Mac. Inputs: app, debug_port (empty for none).
set -euo pipefail
if [[ -n "$debug_port" ]]; then
  open -a "$app" --args "--remote-debugging-port=$debug_port"
else
  open -a "$app"
fi
echo "LAUNCHED=yes"
