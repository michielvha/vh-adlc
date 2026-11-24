# Reports whether the Paseo app's main process runs on a Mac. Inputs: app.
set -euo pipefail
if pgrep -f -- "^${app}/Contents/MacOS/Paseo( |\$)" >/dev/null 2>&1; then
  echo "RUNNING=yes"
else
  echo "RUNNING=no"
fi
