#!/bin/sh
# Keeps `claude remote-control` running as a per-user service, so this machine stays available as a
# Claude Code Remote Control environment, and reports what still stops it from starting.
#
# Usage:
#   remote-control.sh install   [--dir DIR] [--name NAME] [--claude PATH] [--spawn MODE] [--path PATH] [--linger] [--dry-run]
#   remote-control.sh status    [--dir DIR] [--claude PATH]
#   remote-control.sh uninstall [--dir DIR] [--dry-run]
#
#   --dir     the folder the bridge serves (default: the working directory)
#   --name    the name shown in claude.ai/code (default: <short host name>-<id>)
#   --claude  the claude binary (default: claude on PATH)
#   --spawn   worktree (default, a Git worktree per session), same-dir or session
#   --path    PATH for the service and its sessions (default: the current PATH)
#   --linger  Linux only: loginctl enable-linger, so the service runs without a login session
#   --dry-run print what install or uninstall would change and change nothing
#
# <id> is the folder's last path segment. macOS gets a LaunchAgent,
# ~/Library/LaunchAgents/pro.vhco.claude-remote-control.<id>.plist, loaded into gui/<uid>, where the
# CLI can read its Keychain login (an SSH session cannot). Linux gets a systemd --user unit,
# ~/.config/systemd/user/claude-remote-control-<id>.service. Both restart the bridge 60 seconds after
# it exits. Running install again with the same options changes nothing.
#
# Each check prints `ok`, `action`, `unknown` or `optional`, and the script ends with the owner's
# remaining steps in order. Workspace trust and the one-time "Enable Remote Control?" answer are the
# owner's decisions: this script never records either. The JSON checks need python3.
#
# Exit status: status exits 0 when every check is ok or optional and 1 otherwise; install and
# uninstall exit 1 only when a service command fails; 2 means a usage error.
set -u

usage() {
  sed -n '5,8p' "$0" | sed 's/^# //' >&2
  exit 2
}

[ "$#" -gt 0 ] || usage
command=$1
shift
case "$command" in install | status | uninstall) ;; *) usage ;; esac

dir=$PWD
name=
claude=
spawn=worktree
search_path=$PATH
linger=0
dry_run=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir) [ "$#" -ge 2 ] || usage; dir=$2; shift 2 ;;
    --name) [ "$#" -ge 2 ] || usage; name=$2; shift 2 ;;
    --claude) [ "$#" -ge 2 ] || usage; claude=$2; shift 2 ;;
    --spawn) [ "$#" -ge 2 ] || usage; spawn=$2; shift 2 ;;
    --path) [ "$#" -ge 2 ] || usage; search_path=$2; shift 2 ;;
    --linger) linger=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    *) usage ;;
  esac
done
case "$spawn" in worktree | same-dir | session) ;; *) echo "--spawn must be worktree, same-dir or session" >&2; exit 2 ;; esac

case "$(uname -s)" in
  Darwin) platform=macos ;;
  Linux) platform=linux ;;
  *) echo "remote-control.sh supports macOS (LaunchAgent) and Linux (systemd --user) only" >&2; exit 2 ;;
esac

# The folder as Claude sees it: physical, without a trailing slash.
if [ -d "$dir" ]; then
  dir=$(cd "$dir" && pwd -P)
else
  dir=${dir%/}
fi
id=$(printf '%s\n' "${dir##*/}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9.-][^a-z0-9.-]*/-/g; s/^-*//; s/-*$//')
[ -n "$id" ] || { echo "cannot derive a service name from $dir" >&2; exit 2; }

if [ "$platform" = macos ]; then
  service=pro.vhco.claude-remote-control.$id
  service_file=$HOME/Library/LaunchAgents/$service.plist
  log=$HOME/Library/Logs/claude-remote-control-$id.log
  managed_settings=${VH_ADLC_RC_MANAGED_SETTINGS:-/Library/Application Support/ClaudeCode/managed-settings.json}
else
  service=claude-remote-control-$id.service
  service_file=$HOME/.config/systemd/user/$service
  log="journalctl --user -u $service"
  managed_settings=${VH_ADLC_RC_MANAGED_SETTINGS:-/etc/claude-code/managed-settings.json}
fi

if [ -z "$claude" ]; then
  claude=$(command -v claude 2>/dev/null || true)
fi

uid=$(id -u)
user=$(id -un)

# --- service state -------------------------------------------------------------------------------

loaded=0
running=0
service_pid=
read_state() {
  loaded=0
  running=0
  service_pid=
  if [ "$platform" = macos ]; then
    if out=$(launchctl print "gui/$uid/$service" 2>/dev/null); then
      loaded=1
      service_pid=$(printf '%s\n' "$out" | sed -n 's/^[[:space:]]*pid = \([0-9][0-9]*\).*/\1/p' | head -n 1)
      [ -n "$service_pid" ] && running=1
    fi
  else
    out=$(systemctl --user show "$service" --property=UnitFileState,ActiveState,MainPID 2>/dev/null || true)
    case "$out" in *UnitFileState=enabled*) loaded=1 ;; esac
    case "$out" in *ActiveState=active*) running=1 ;; esac
    service_pid=$(printf '%s\n' "$out" | sed -n 's/^MainPID=\([1-9][0-9]*\)$/\1/p')
  fi
}

# --- checks --------------------------------------------------------------------------------------

steps=
step_count=0
not_ready=0
report() { # report STATUS CHECK DETAIL [STEP]
  echo "$1 $2: $3"
  case "$1" in action | unknown) not_ready=1 ;; esac
  if [ "$1" != ok ] && [ -n "${4:-}" ]; then
    step_count=$((step_count + 1))
    steps="$steps  $step_count. [$2] $4
"
  fi
}

have_python=0
command -v python3 >/dev/null 2>&1 && have_python=1

# Prints one line per fact Claude's JSON files give: "traffic FILE", "unreadable FILE",
# "trusted PATH", "config-unreadable" and "consent". Only these keys are read.
json_facts() {
  python3 -I - "$HOME" "$dir" "$managed_settings" <<'PY'
import json, os, sys
home, directory, managed = sys.argv[1:4]
def load(path):
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)
for path in (os.path.join(home, ".claude", "settings.json"),
             os.path.join(directory, ".claude", "settings.json"),
             os.path.join(directory, ".claude", "settings.local.json"),
             managed):
    try:
        settings = load(path)
    except Exception:
        print("unreadable", path)
        continue
    env = settings.get("env") if isinstance(settings, dict) else None
    if isinstance(env, dict) and env.get("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"):
        print("traffic", path)
try:
    config = load(os.path.join(home, ".claude.json"))
except Exception:
    print("config-unreadable")
    config = None
if isinstance(config, dict):
    projects = config.get("projects")
    path = directory
    while isinstance(projects, dict):
        entry = projects.get(path)
        if isinstance(entry, dict) and entry.get("hasTrustDialogAccepted") is True:
            print("trusted", path)
            break
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent
    if config.get("remoteDialogSeen") is True:
        print("consent")
PY
}

# Prints the PIDs of claude remote-control processes serving $dir, other than the service.
terminal_bridges() {
  ps -A -o pid=,args= 2>/dev/null |
    awk '{ pid = $1; $1 = ""; if ($0 ~ /(^|[ \/])claude[ \t]+remote-control([ \t]|$)/) print pid }' |
    while read -r pid; do
      [ "$pid" = "$service_pid" ] && continue
      if [ "$platform" = macos ]; then
        cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)
      else
        cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null || true)
      fi
      [ "${cwd%/}" = "$dir" ] && echo "$pid"
    done
}

run_checks() {
  if [ -n "$claude" ] && [ -x "$claude" ]; then
    report ok "claude binary" "$claude"
    have_claude=1
  else
    report action "claude binary" "claude was not found" "Install Claude Code (on macOS: brew install --cask claude-code@latest), or pass --claude."
    have_claude=0
  fi

  facts=
  if [ "$have_python" -eq 1 ]; then
    facts=$(json_facts)
  fi
  traffic=$(printf '%s\n' "$facts" | sed -n 's/^traffic //p' | paste -sd ',' - | sed 's/,/, /g')
  unreadable=$(printf '%s\n' "$facts" | sed -n 's/^unreadable //p' | paste -sd ',' - | sed 's/,/, /g')
  if [ "$have_python" -eq 0 ]; then
    report unknown "nonessential traffic" "python3 is needed to read Claude's settings files" "Install python3, or check by hand that no Claude settings file sets CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC."
  elif [ -n "$traffic" ]; then
    report action "nonessential traffic" "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC is set in $traffic" "Remove CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC from the env block in $traffic. Remote Control needs feature-flag evaluation, which it turns off. Unsetting it in the shell does not help: settings env overrides the shell."
  elif [ -n "$unreadable" ]; then
    report unknown "nonessential traffic" "could not parse $unreadable" "Fix the JSON in $unreadable and check it does not set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC."
  else
    report ok "nonessential traffic" "no settings file disables it"
  fi

  # Only loggedIn is read; the rest of the output names the account and is discarded.
  logged_in=unknown
  if [ "$have_claude" -eq 1 ] && [ "$have_python" -eq 1 ]; then
    logged_in=$("$claude" auth status --json 2>/dev/null | python3 -I -c '
import json, sys
text = sys.stdin.read()
try:
    value = json.loads(text[text.index("{"):]).get("loggedIn")
except Exception:
    value = None
print({True: "true", False: "false"}.get(value, "unknown"))')
  fi
  if [ "$logged_in" = true ]; then
    report ok login "claude auth status reports a login"
  elif [ "$platform" = macos ] && { [ -n "${SSH_CONNECTION:-}" ] || [ -n "${SSH_TTY:-}" ]; }; then
    report unknown login "over SSH the macOS Keychain is out of reach, so the CLI reports no login even when one exists" "The LaunchAgent runs in your GUI session and can read the Keychain. Check $log, or run claude auth status at the Mac itself."
  elif [ "$logged_in" = false ]; then
    report action login "claude auth status reports no login" "At a terminal on this machine, run claude and sign in."
  else
    report unknown login "could not read claude auth status --json" "At a terminal on this machine, run claude auth status and sign in if it asks."
  fi

  trust_step="At a terminal, run claude in $dir and accept the workspace trust dialog. Trust is your decision; this script never records it."
  consent_step="At a terminal in $dir, run claude remote-control once and answer y to 'Enable Remote Control?'. Then stop that terminal bridge with Ctrl+C: while it runs, the service cannot serve the folder."
  trusted=$(printf '%s\n' "$facts" | sed -n 's/^trusted //p')
  if [ "$have_python" -eq 0 ]; then
    report unknown "workspace trust" "python3 is needed to read ~/.claude.json" "$trust_step"
    report unknown "remote control consent" "python3 is needed to read ~/.claude.json" "$consent_step"
  elif printf '%s\n' "$facts" | grep -qx config-unreadable; then
    report unknown "workspace trust" "could not parse $HOME/.claude.json" "$trust_step"
    report unknown "remote control consent" "could not parse $HOME/.claude.json" "$consent_step"
  else
    if [ -n "$trusted" ]; then
      report ok "workspace trust" "accepted for $trusted"
    else
      report action "workspace trust" "no trust recorded for $dir" "$trust_step"
    fi
    if printf '%s\n' "$facts" | grep -qx consent; then
      report ok "remote control consent" "Remote Control was enabled once on this machine"
    else
      report action "remote control consent" "Remote Control was never enabled on this machine" "$consent_step"
    fi
  fi

  bridges=$(terminal_bridges | paste -sd ' ' -)
  if [ -n "$bridges" ]; then
    report action "terminal bridge" "a terminal claude remote-control (PID $bridges) already serves $dir, so the service cannot start: 'This folder is already served by a terminal claude remote-control on this device'" "Stop the terminal bridge with Ctrl+C in its terminal, or kill $bridges. The service takes over within a minute."
  else
    report ok "terminal bridge" "no terminal claude remote-control serves $dir"
  fi

  if [ "$platform" = linux ]; then
    if [ "$(loginctl show-user "$user" --property=Linger --value 2>/dev/null)" = yes ]; then
      report ok linger "enabled for $user"
    else
      report optional linger "off for $user, so the bridge stops when the last login session ends" "On a server, run install again with --linger. A workstation you stay logged in to does not need it."
    fi
  fi
}

print_summary() {
  read_state
  echo "service $service: installed $([ -f "$service_file" ] && echo yes || echo no), loaded $([ "$loaded" -eq 1 ] && echo yes || echo no), running $([ "$running" -eq 1 ] && echo "yes (PID $service_pid)" || echo no)"
  echo "log: $log"
  run_checks
  if [ -n "$steps" ]; then
    echo "Steps left for the owner, in this order:"
    printf '%s' "$steps"
    echo "The service retries every 60 seconds, so it starts by itself once these are done."
  fi
}

# --- service definitions -------------------------------------------------------------------------

xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&apos;/g"
}

# systemd expands % specifiers everywhere and $ variables in ExecStart; quoted words escape \ and ".
systemd_quote() {
  printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/%/%%/g' -e 's/\$/$$/g')"
}

launch_agent() {
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$(xml_escape "$service")</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "$claude")</string>
    <string>remote-control</string>
    <string>--spawn=$spawn</string>
    <string>--name</string>
    <string>$(xml_escape "$name")</string>
  </array>
  <key>WorkingDirectory</key><string>$(xml_escape "$dir")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(xml_escape "$search_path")</string>
    <key>HOME</key><string>$(xml_escape "$HOME")</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$(xml_escape "$log")</string>
  <key>StandardErrorPath</key><string>$(xml_escape "$log")</string>
</dict>
</plist>
EOF
}

systemd_unit() {
  cat <<EOF
[Unit]
Description=Claude Code Remote Control bridge $(printf '%s' "$name" | sed 's/%/%%/g')
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=$(printf '%s' "$dir" | sed 's/%/%%/g')
Environment=$(systemd_quote "PATH=$search_path")
ExecStart=$(systemd_quote "$claude") "remote-control" "--spawn=$spawn" "--name" $(systemd_quote "$name")
Restart=always
RestartSec=60

[Install]
WantedBy=default.target
EOF
}

failed=0
run() { # run COMMAND...: runs it, or only prints it with --dry-run
  if [ "$dry_run" -eq 1 ]; then
    echo "would run: $*"
    return 0
  fi
  if ! out=$("$@" 2>&1); then
    echo "failed: $*: $out" >&2
    failed=1
    return 1
  fi
}

# --- commands ------------------------------------------------------------------------------------

do_install() {
  [ -d "$dir" ] || { echo "working directory not found: $dir" >&2; exit 1; }
  [ -n "$claude" ] && [ -x "$claude" ] || { echo "Claude Code was not found. Install it (on macOS: brew install --cask claude-code@latest), or pass --claude." >&2; exit 1; }
  if [ -z "$name" ]; then
    host=$(hostname 2>/dev/null || uname -n)
    name=$(printf '%s' "${host%%.*}" | tr '[:upper:]' '[:lower:]')-$id
  fi
  [ "$linger" -eq 1 ] && [ "$platform" != linux ] && echo "--linger applies to Linux only; ignoring it" >&2

  tmp=$(mktemp)
  trap 'rm -f "$tmp"' EXIT
  if [ "$platform" = macos ]; then launch_agent >"$tmp"; else systemd_unit >"$tmp"; fi
  changed=1
  if [ -f "$service_file" ] && cmp -s "$tmp" "$service_file"; then
    changed=0
    echo "unchanged: $service_file"
  elif [ "$dry_run" -eq 1 ]; then
    echo "would write: $service_file"
  else
    if ! { mkdir -p "${service_file%/*}" && cat "$tmp" >"$service_file"; }; then
      echo "cannot write $service_file" >&2
      exit 1
    fi
    echo "wrote: $service_file"
  fi

  read_state
  if [ "$platform" = macos ]; then
    if [ "$loaded" -eq 1 ] && [ "$changed" -eq 1 ]; then
      run launchctl bootout "gui/$uid/$service"
      # bootout returns before launchd has removed the job, and bootstrap fails until it has.
      tries=0
      while [ "$dry_run" -eq 0 ] && [ "$tries" -lt 10 ] && launchctl print "gui/$uid/$service" >/dev/null 2>&1; do
        sleep 1
        tries=$((tries + 1))
      done
    fi
    if [ "$loaded" -eq 0 ] || [ "$changed" -eq 1 ]; then
      [ "$dry_run" -eq 1 ] || mkdir -p "${log%/*}"
      run launchctl bootstrap "gui/$uid" "$service_file" && [ "$dry_run" -eq 0 ] && echo "loaded: $service into gui/$uid"
    fi
  else
    [ "$changed" -eq 1 ] && run systemctl --user daemon-reload
    run systemctl --user enable "$service"
    if [ "$changed" -eq 1 ]; then run systemctl --user restart "$service"; else run systemctl --user start "$service"; fi
    [ "$linger" -eq 1 ] && run loginctl enable-linger "$user"
  fi

  print_summary
  exit "$failed"
}

do_status() {
  print_summary
  exit "$not_ready"
}

do_uninstall() {
  read_state
  if [ ! -f "$service_file" ] && [ "$loaded" -eq 0 ] && [ "$running" -eq 0 ]; then
    echo "no Remote Control service is installed for $dir"
    exit 0
  fi
  if [ "$platform" = macos ]; then
    [ "$loaded" -eq 1 ] && run launchctl bootout "gui/$uid/$service"
  elif [ "$loaded" -eq 1 ] || [ "$running" -eq 1 ]; then
    run systemctl --user disable --now "$service"
  fi
  if [ -f "$service_file" ]; then
    if [ "$dry_run" -eq 1 ]; then
      echo "would remove: $service_file"
    else
      rm -f "$service_file" && echo "removed: $service_file"
      [ "$platform" = linux ] && run systemctl --user daemon-reload
    fi
  fi
  echo "kept: the log ($log), linger, workspace trust, Remote Control consent and the Claude login"
  exit "$failed"
}

case "$command" in
  install) do_install ;;
  status) do_status ;;
  uninstall) do_uninstall ;;
esac
