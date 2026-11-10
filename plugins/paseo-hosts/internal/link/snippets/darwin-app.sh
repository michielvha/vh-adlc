# Finds the Paseo desktop app on a Mac.
set -euo pipefail
app="$HOME/Applications/Paseo.app"
[[ -d "$app" ]] || app="/Applications/Paseo.app"
[[ -d "$app" ]] || { echo "FAIL: the Paseo app is not installed in /Applications or ~/Applications"; exit 1; }
echo "APP=$app"
