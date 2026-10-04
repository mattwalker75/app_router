#!/usr/bin/env bash
#
# AUTOSTART.sh — have App Router start by itself whenever this Mac starts.
#
# App Router is the front door to your other apps, so it should always be there.
# This hands it to macOS (launchd), which starts it and starts it again if it stops.
#
# Usage:  ./AUTOSTART.sh [options…]
#
#   -i, --install   Start App Router every time YOU log in to this Mac, and now.
#                   No administrator password needed. Right for a Mac that logs
#                   you in automatically when it starts.
#       --system    Use with --install or --remove: start it when the Mac BOOTS,
#                   before anyone logs in. Asks for your administrator password.
#                   It still runs as you, not as root.
#   -r, --remove    Stop starting it automatically, and stop it now.
#   -s, --status    Is automatic start installed, and is App Router running?
#   -p, --print     Show the launchd file that --install would write. Changes nothing.
#   -h, --help      This help.
#
# Examples:
#   ./AUTOSTART.sh --install            start at login (the usual choice)
#   ./AUTOSTART.sh --install --system   start at boot, even with nobody logged in
#   ./AUTOSTART.sh --status
#   ./AUTOSTART.sh --remove
#
# While it is installed, ./ROUTER.sh --start, --stop and --restart work through it,
# so you keep using ROUTER.sh as before. After changing the port or network access
# in Settings:  ./ROUTER.sh --restart
# It always runs this copy of the app with the config.json next to this script, and
# writes its log to ~/Library/Logs/app-router.log (./ROUTER.sh --logs follows it).
#
# One thing to know: macOS protects the Desktop, Documents and Downloads folders.
# If App Router lives in one of them, macOS asks once whether "node" may use that
# folder — answer Allow. With --system there is nobody to ask, so keep the app
# outside those folders (for example ~/Apps/app_router) or give node Full Disk
# Access in System Settings → Privacy & Security. (The log is kept outside the
# app's folder for the same reason.)
#
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$HERE"
if [[ -t 1 ]]; then C_RESET=$'\033[0m'; C_RED=$'\033[0;31m'; C_GRN=$'\033[0;32m'; C_YEL=$'\033[0;33m'; C_BLU=$'\033[0;34m'; else C_RESET=''; C_RED=''; C_GRN=''; C_YEL=''; C_BLU=''; fi
info() { echo "${C_BLU}==>${C_RESET} $*"; }; ok() { echo "${C_GRN}OK ${C_RESET} $*"; }; warn() { echo "${C_YEL}!! ${C_RESET} $*"; }; err() { echo "${C_RED}ERROR${C_RESET} $*" >&2; }
usage() { awk 'NR>=3 { if (/^#/) { sub(/^# ?/, ""); print } else { exit } }' "${BASH_SOURCE[0]}"; }

LABEL="com.app-router.server"
AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"
DAEMON="/Library/LaunchDaemons/$LABEL.plist"
ENTRY="$HERE/dist/node/server/src/index.js"
# The log goes where macOS always lets a background program write. (The app's own data/ folder
# may sit inside Desktop or Documents, which macOS guards — and it is launchd, not node, that
# opens the log, so nobody would be asked.)
LOG="$HOME/Library/Logs/app-router.log"
ME="$(id -un)"; MY_UID="$(id -u)"

installed_as() { if [[ -f "$DAEMON" ]]; then echo system; elif [[ -f "$AGENT" ]]; then echo login; else echo none; fi; }
domain_of() { [[ "$1" == system ]] && echo "system" || echo "gui/$MY_UID"; }
loaded() { launchctl print "$(domain_of "$1")/$LABEL" >/dev/null 2>&1; }
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

plist() { # plist <login|system>
  local node; node="$(command -v node)"
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml "$node")</string>
    <string>$(xml "$ENTRY")</string>
  </array>
  <key>WorkingDirectory</key><string>$(xml "$HERE")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(xml "$(dirname "$node")"):/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>AR_CONFIG</key><string>$(xml "$HERE/config.json")</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$(xml "$LOG")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOG")</string>$( [[ "$1" == system ]] && printf '\n  <key>UserName</key><string>%s</string>' "$(xml "$ME")" )
</dict>
</plist>
PLIST
}

ready() {
  command -v node >/dev/null 2>&1 || { err "Node.js is not installed. Run ./INSTALL_APP.sh first."; return 1; }
  [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 22 ]] || { err "Node.js $(node -v) is too old — 22 or newer is needed. Run ./INSTALL_APP.sh first."; return 1; }
  [[ -d node_modules/express ]] || { err "The app's packages are not installed. Run ./INSTALL_APP.sh first."; return 1; }
  [[ -f config.json ]] || { cp config.example.json config.json && chmod 600 config.json && info "Created config.json from config.example.json"; }
  if [[ ! -f "$ENTRY" || ! -f dist/web/index.html ]]; then info "Building App Router…"; mkdir -p data; npm run build > data/build.log 2>&1 && touch dist/.built || { err "The build failed — see data/build.log"; return 1; }; fi
  mkdir -p data "$(dirname "$LOG")"; touch "$LOG"   # made by you, so it stays yours to read and trim
  case "$HERE/" in "$HOME/Desktop/"*|"$HOME/Documents/"*|"$HOME/Downloads/"*)
    warn "App Router lives in a folder macOS protects ($HERE)."
    if [[ "$1" == system ]]; then warn "Started at boot, macOS can't ask for permission — if it does not start, move the app out of Desktop/Documents/Downloads or give node Full Disk Access."
    else warn "macOS may ask once whether “node” may use that folder — answer Allow."; fi ;;
  esac
}
port() { node -e "try{console.log(JSON.parse(require('fs').readFileSync('config.json','utf8')).server.port||80)}catch{console.log(80)}" 2>/dev/null || echo 80; }
url() { local p; p="$(port)"; [[ "$p" == 80 ]] && echo "http://localhost" || echo "http://localhost:$p"; }
answering() { curl -fsS --max-time 2 "$(url)/api/health" 2>/dev/null | grep -q '"app":"app-router"'; }

cmd_install() { # cmd_install <login|system>
  local how="$1" tmp
  [[ "$(uname)" == Darwin ]] || { err "Automatic start is set up for macOS (launchd). On another system, use its own service manager to run: node $ENTRY"; return 1; }
  ready "$how" || return 1
  local other; other="$(installed_as)"
  if [[ "$other" != none && "$other" != "$how" ]]; then info "Removing the other kind of automatic start first…"; cmd_remove "$other" >/dev/null || return 1; fi
  # a copy started by hand with ./ROUTER.sh would hold the port
  if [[ -f data/router.pid ]] && kill -0 "$(cat data/router.pid)" 2>/dev/null; then info "Stopping the copy started with ./ROUTER.sh…"; AR_NO_AUTOSTART=1 ./ROUTER.sh --stop >/dev/null; fi
  tmp="$(mktemp)"; plist "$how" > "$tmp"
  plutil -lint "$tmp" >/dev/null || { err "The launchd file did not come out right — nothing was installed."; rm -f "$tmp"; return 1; }
  if [[ "$how" == system ]]; then
    info "Installing for start at boot — macOS asks for your administrator password."
    sudo launchctl bootout "system/$LABEL" >/dev/null 2>&1
    sudo install -o root -g wheel -m 644 "$tmp" "$DAEMON" || { err "Could not write $DAEMON"; rm -f "$tmp"; return 1; }
    sudo launchctl bootstrap system "$DAEMON" || { err "macOS did not accept it — see: sudo launchctl print system/$LABEL"; rm -f "$tmp"; return 1; }
  else
    mkdir -p "$(dirname "$AGENT")"
    launchctl bootout "gui/$MY_UID/$LABEL" >/dev/null 2>&1
    install -m 644 "$tmp" "$AGENT"
    launchctl bootstrap "gui/$MY_UID" "$AGENT" || { err "macOS did not accept it — see: launchctl print gui/$MY_UID/$LABEL"; rm -f "$tmp"; return 1; }
  fi
  rm -f "$tmp"
  for _ in $(seq 1 60); do answering && break; sleep 0.25; done
  if answering; then ok "App Router now starts $([[ "$how" == system ]] && echo "when this Mac boots" || echo "when you log in"), and is running — $(url)"
  else warn "Installed, but App Router is not answering yet. Look at the end of $LOG:"; tail -n 15 "$LOG" 2>/dev/null; return 1; fi
}
cmd_remove() { # cmd_remove <login|system|auto>
  local how="$1"; [[ "$how" == auto ]] && how="$(installed_as)"
  [[ "$how" == none ]] && { info "Automatic start is not installed."; return 0; }
  if [[ "$how" == system ]]; then
    [[ -f "$DAEMON" ]] || { info "Start at boot is not installed."; return 0; }
    info "Removing start at boot — macOS asks for your administrator password."
    sudo launchctl bootout "system/$LABEL" >/dev/null 2>&1; sudo rm -f "$DAEMON" || return 1
  else
    [[ -f "$AGENT" ]] || { info "Start at login is not installed."; return 0; }
    launchctl bootout "gui/$MY_UID/$LABEL" >/dev/null 2>&1; rm -f "$AGENT"
  fi
  ok "App Router no longer starts by itself, and is stopped. (./ROUTER.sh --start starts it by hand.)"
}
cmd_status() {
  local how; how="$(installed_as)"
  case "$how" in
    none)   info "Automatic start is not installed. (./AUTOSTART.sh --install adds it.)" ;;
    login)  ok "Starts when you log in ($AGENT)"; loaded login && ok "macOS has it loaded" || warn "macOS does not have it loaded — ./ROUTER.sh --start loads it" ;;
    system) ok "Starts when this Mac boots ($DAEMON)"; loaded system && ok "macOS has it loaded" || warn "macOS does not have it loaded — ./ROUTER.sh --start loads it" ;;
  esac
  if answering; then ok "App Router is running — $(url)"; else info "App Router is not running."; fi
}
# used by ROUTER.sh: start / stop the installed service now, without changing whether it starts by itself
cmd_kick() {
  local how; how="$(installed_as)"; [[ "$how" == none ]] && return 1
  local d; d="$(domain_of "$how")"
  if [[ "$how" == system ]]; then sudo launchctl print "$d/$LABEL" >/dev/null 2>&1 && sudo launchctl kickstart -k "$d/$LABEL" || sudo launchctl bootstrap "$d" "$DAEMON"
  else launchctl print "$d/$LABEL" >/dev/null 2>&1 && launchctl kickstart -k "$d/$LABEL" || launchctl bootstrap "$d" "$AGENT"; fi
}
cmd_halt() {
  local how; how="$(installed_as)"; [[ "$how" == none ]] && return 1
  if [[ "$how" == system ]]; then sudo launchctl bootout "system/$LABEL"; else launchctl bootout "gui/$MY_UID/$LABEL"; fi
}

[[ $# -eq 0 ]] && { usage; exit 0; }
SYSTEM=0; ACTION=""
for a in "$@"; do
  case "$a" in
    --system) SYSTEM=1 ;;
    -i|--install|install) ACTION=install ;;
    -r|--remove|remove)   ACTION=remove ;;
    -s|--status|status)   ACTION=status ;;
    -p|--print|print)     ACTION=print ;;
    --kick) ACTION=kick ;; --halt) ACTION=halt ;;
    -h|--help|help) usage; exit 0 ;;
    *) err "Unknown option: $a"; echo; usage; exit 2 ;;
  esac
done
HOW=login; [[ $SYSTEM -eq 1 ]] && HOW=system
case "$ACTION" in
  install) cmd_install "$HOW" ;;
  remove)  if [[ $SYSTEM -eq 1 ]]; then cmd_remove system; else cmd_remove auto; fi ;;
  status)  cmd_status ;;
  print)   command -v node >/dev/null 2>&1 || { err "Node.js is not installed."; exit 1; }; plist "$HOW" ;;
  kick)    cmd_kick ;;
  halt)    cmd_halt ;;
  *) err "Say what to do: --install, --remove, --status or --print."; echo; usage; exit 2 ;;
esac
