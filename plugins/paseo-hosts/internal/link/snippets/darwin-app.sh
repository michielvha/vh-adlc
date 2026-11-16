# Finds the Paseo desktop app on a Mac. Input: need_app (yes or optional).
set -euo pipefail
app="$HOME/Applications/Paseo.app"
[[ -d "$app" ]] || app="/Applications/Paseo.app"
if [[ ! -d "$app" ]]; then
  [[ "$need_app" == optional ]] && exit 0
  echo "FAIL: the Paseo app is not installed in /Applications or ~/Applications"
  exit 1
fi
echo "APP=$app"
