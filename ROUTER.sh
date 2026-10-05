#!/usr/bin/env bash
#
# ROUTER.sh — run App Router.
#
# Usage:  ./ROUTER.sh [options…]     options run in the order given, e.g.  ./ROUTER.sh -x -s
#
#   -s, --start     Start in the background and open it in your browser. Builds the
#                   app first if it has not been built (or the code changed). Does
#                   nothing if it is already running.
#   -x, --stop      Stop the background server.
#   -r, --restart   Stop, then start (needed after changing a setting marked "Needs restart":
#                   the port, network access, the sign-in length, where files are kept).
#   -i, --status    Is it running? Prints the address and process id.
#   -l, --logs      Follow the server log (Ctrl-C to leave).
#   -f, --fg        Run in the foreground instead (Ctrl-C to stop).
#   -c, --check     Check that everything it needs is in place, and exit.
#   -t, --test      Run the tests.
#   -d, --dev       Developer mode: live-reloading page at http://localhost:5174 (Ctrl-C to stop).
#   -h, --help      This help.
#
# Bare words work too:  ./ROUTER.sh start | stop | restart | status | logs | fg | check | test | dev | help
#
# Examples:
#   ./ROUTER.sh                 start it (same as --start)
#   ./ROUTER.sh --status        is it running, and where?
#   ./ROUTER.sh -r              restart after changing the port in Settings
#   ./ROUTER.sh -x -s           stop, then start, in one go
#   ./ROUTER.sh --logs          watch what the server is doing
#
# Settings live in config.json next to this script (Settings in the app edits the same
# file). First-time setup on a new computer:  ./INSTALL_APP.sh
# To have it start whenever the computer starts:  ./AUTOSTART.sh --install
# (while that is installed, --start, --stop and --restart here go through it).
# Set AR_NO_OPEN=1 to start without opening the browser.
#
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$HERE"
mkdir -p "$HERE/data"; PIDFILE="$HERE/data/router.pid"; LOG="$HERE/data/router.log"
ENTRY="dist/node/server/src/index.js"
if [[ -t 1 ]]; then C_RESET=$'\033[0m'; C_RED=$'\033[0;31m'; C_GRN=$'\033[0;32m'; C_YEL=$'\033[0;33m'; C_BLU=$'\033[0;34m'; else C_RESET=''; C_RED=''; C_GRN=''; C_YEL=''; C_BLU=''; fi
info() { echo "${C_BLU}==>${C_RESET} $*"; }; ok() { echo "${C_GRN}OK ${C_RESET} $*"; }; warn() { echo "${C_YEL}!! ${C_RESET} $*"; }; err() { echo "${C_RED}ERROR${C_RESET} $*" >&2; }
usage() { awk 'NR>=3 { if (/^#/) { sub(/^# ?/, ""); print } else { exit } }' "${BASH_SOURCE[0]}"; }

# The config file this copy of the app uses. It is handed to the server explicitly, so the server
# never falls back to looking for one somewhere else.
CONFIG="${AR_CONFIG:-$HERE/config.json}"
cfg() { node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));const v=process.argv[2].split('.').reduce((a,k)=>a&&a[k],c);console.log(v===undefined?process.argv[3]:v)}catch{console.log(process.argv[3])}" "$CONFIG" "$1" "$2"; }
port() { echo "${PORT:-$(cfg server.port 80)}"; }
url() { local p; p="$(port)"; if [[ "$p" == 80 ]]; then echo "http://localhost"; else echo "http://localhost:$p"; fi; }
# "is App Router answering?" — the health route says which app it is, so another web server on the port is not mistaken for it
answering() { curl -fsS --max-time 2 "$(url)/api/health" 2>/dev/null | grep -q '"app":"app-router"'; }
# The copy started by this script: its process must be alive AND be App Router. After a restart
# of the computer the number in the pid file can belong to some other program — never touch that.
running() {
  [[ -f "$PIDFILE" ]] || return 1
  local pid; pid="$(cat "$PIDFILE" 2>/dev/null)"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null && ps -p "$pid" -o command= 2>/dev/null | grep -qF "$ENTRY" && return 0
  rm -f "$PIDFILE"; return 1
}
node_ok() { command -v node >/dev/null 2>&1 && [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]]; }
# Installed with ./AUTOSTART.sh? Then the system keeps it running, and start/stop must go through it.
AGENT_LABEL="com.app-router.server"
agent_plist() { if [[ -f "/Library/LaunchDaemons/$AGENT_LABEL.plist" ]]; then echo "/Library/LaunchDaemons/$AGENT_LABEL.plist"; elif [[ -f "$HOME/Library/LaunchAgents/$AGENT_LABEL.plist" ]]; then echo "$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"; fi; }
autostart() { [[ -z "${AR_NO_AUTOSTART:-}" && -n "$(agent_plist)" ]]; }
# Does the system have it loaded (so: running, or being started again)? This does not depend on the port,
# which matters after the port was changed in Settings: the copy that is running still listens on the old one.
agent_loaded() { local d; if [[ "$(agent_plist)" == /Library/LaunchDaemons/* ]]; then d="system"; else d="gui/$(id -u)"; fi; launchctl print "$d/$AGENT_LABEL" >/dev/null 2>&1; }
moved_note() { echo "it is not answering at $(url). If the port was changed in Settings, restart to apply it: ./ROUTER.sh --restart"; }
# Started by the system, the log is kept where macOS always lets a background program write.
autostart && LOG="$HOME/Library/Logs/app-router.log"
# Keep the log from growing without end: past 5 MB, keep its last 2000 lines.
trim_log() { [[ -f "$LOG" && "$(wc -c < "$LOG")" -gt 5242880 ]] && { tail -n 2000 "$LOG" > "$LOG.tmp" && cat "$LOG.tmp" > "$LOG"; rm -f "$LOG.tmp"; }; return 0; }
# Started at boot (./AUTOSTART.sh --install --system), starting and stopping it needs an administrator.
admin_note() { [[ "$(agent_plist)" == /Library/LaunchDaemons/* ]] && info "App Router starts at boot on this Mac, so macOS may ask for your administrator password."; return 0; }

# Build when there is no build yet, or when any source file is newer than the last build.
needs_build() {
  [[ -f "$ENTRY" && -f dist/web/index.html && -f dist/.built ]] || return 0
  [[ -n "$(find web/src web/public web/index.html server/src shared package.json package-lock.json vite.config.ts tsconfig.server.json web/tsconfig.json -newer dist/.built -print -quit 2>/dev/null)" ]]
}
build() {
  info "Building App Router…"
  if npm run build >"$HERE/data/build.log" 2>&1; then touch dist/.built; ok "Built."; else err "The build failed — see data/build.log"; tail -n 25 "$HERE/data/build.log"; return 1; fi
}
prereqs() {
  node_ok || { err "Node.js 22 or newer is needed. Run ./INSTALL_APP.sh"; return 1; }
  [[ -d node_modules/express ]] || { err "The app's packages are not installed. Run ./INSTALL_APP.sh"; return 1; }
  [[ -f "$CONFIG" ]] || { info "No config.json yet — creating it from config.example.json"; cp config.example.json "$CONFIG" && chmod 600 "$CONFIG"; }
  if needs_build; then build || return 1; fi
}

cmd_check() {
  local rc=0
  if node_ok; then ok "Node.js $(node -v)"; else err "Node.js 22+ is required — run ./INSTALL_APP.sh"; rc=1; fi
  if [[ -d node_modules/express ]]; then ok "Packages installed"; else err "Packages not installed — run ./INSTALL_APP.sh"; rc=1; fi
  if [[ -f dist/web/index.html && -f "$ENTRY" ]]; then needs_build && warn "Built, but the code changed since — the next start rebuilds it" || ok "Built"; else warn "Not built yet — the next start builds it"; fi
  if [[ -f "$CONFIG" ]]; then ok "config.json present (port $(port), network access $(cfg server.allowNetwork false), login $(cfg security.loginEnabled false), changes to the page $(cfg page.allowEditing true), health checks $(cfg health.enabled true))"; else warn "config.json will be created from config.example.json on first start"; fi
  if autostart; then ok "Starts with the computer ($(agent_plist))"; else info "Does not start with the computer (./AUTOSTART.sh --install adds that)"; fi
  if answering; then ok "App Router is running — $(url)"; else info "App Router is not running"; fi
  return $rc
}
wait_up() { for _ in $(seq 1 60); do answering && return 0; sleep 0.25; done; return 1; }
opened() { [[ -z "${AR_NO_OPEN:-}" ]] && command -v open >/dev/null 2>&1 && open "$(url)"; return 0; }
cmd_start() {
  if autostart; then
    prereqs || return 1
    if answering; then ok "Already running (kept running by the system) — $(url)"; return 0; fi
    admin_note; trim_log
    ./AUTOSTART.sh --kick >/dev/null 2>&1
    if wait_up; then ok "App Router is running (kept running by the system) — $(url)"; opened; else err "It did not start — the end of $LOG:"; tail -n 20 "$LOG"; return 1; fi
    return 0
  fi
  if running; then ok "Already running (pid $(cat "$PIDFILE")) — $(url)"; return 0; fi
  prereqs || return 1
  if answering; then ok "App Router is already answering at $(url) (started some other way)."; return 0; fi
  trim_log
  AR_CONFIG="$CONFIG" nohup node "$ENTRY" >> "$LOG" 2>&1 & echo $! > "$PIDFILE"
  for _ in $(seq 1 60); do answering && break; kill -0 "$(cat "$PIDFILE")" 2>/dev/null || break; sleep 0.25; done
  if answering; then
    ok "App Router is running — $(url)   (log: data/router.log)"
    opened
  else
    err "It did not start — the end of data/router.log:"; tail -n 20 "$LOG"
    # never leave a half-started copy behind (it may be alive but not answering here)
    kill "$(cat "$PIDFILE")" 2>/dev/null; rm -f "$PIDFILE"; return 1
  fi
}
cmd_stop() {
  if autostart; then
    answering || agent_loaded || { info "Not running. (It starts again when the computer does; ./AUTOSTART.sh --remove ends that.)"; return 0; }
    admin_note
    ./AUTOSTART.sh --halt >/dev/null 2>&1
    for _ in $(seq 1 20); do answering || agent_loaded || break; sleep 0.25; done
    { answering || agent_loaded; } && { err "It is still running — see ./AUTOSTART.sh --status"; return 1; }
    ok "Stopped. (It starts again when the computer does; ./AUTOSTART.sh --remove ends that.)"; return 0
  fi
  if running; then
    local pid; pid="$(cat "$PIDFILE")"; kill "$pid"
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
    rm -f "$PIDFILE"; ok "Stopped."
  else rm -f "$PIDFILE"; info "Not running."; fi
}
cmd_status() {
  if autostart; then
    if answering; then ok "Running, kept running by the system — $(url)"
    elif agent_loaded; then warn "Running, kept running by the system — but $(moved_note)"
    else info "Not running (it is set to start with the computer: ./AUTOSTART.sh --status)."; fi
  elif running; then if answering; then ok "Running (pid $(cat "$PIDFILE")) — $(url)"; else warn "Running (pid $(cat "$PIDFILE")) — but $(moved_note)"; fi
  elif answering; then ok "Running — $(url)   (not started by this script)"
  else info "Not running."; fi
}
cmd_logs() { touch "$LOG"; tail -n 60 -f "$LOG"; }
# --fg and --dev start a server of their own, so nothing else may hold the port
busy() {
  if running; then err "Already running in the background (pid $(cat "$PIDFILE")); stop it first: ./ROUTER.sh -x"; return 0; fi
  if autostart && { answering || agent_loaded; }; then err "App Router is running, kept running by the system; stop it first: ./ROUTER.sh -x"; return 0; fi
  return 1
}
cmd_fg() {
  busy && return 1
  prereqs || return 1
  AR_CONFIG="$CONFIG" exec node "$ENTRY"
}
cmd_test() { npx vitest run; }
cmd_dev() {
  busy && return 1
  node_ok && [[ -d node_modules/vite ]] || { err "Run ./INSTALL_APP.sh first."; return 1; }
  [[ -f "$CONFIG" ]] || { cp config.example.json "$CONFIG" && chmod 600 "$CONFIG"; }
  info "Developer mode — open http://localhost:5174 (the page reloads as you edit; Ctrl-C stops both)"
  AR_CONFIG="$CONFIG" exec npm run dev
}

[[ $# -eq 0 ]] && set -- --start
rc=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--start|start)     cmd_start   || rc=$? ;;
    -x|--stop|stop)       cmd_stop    || rc=$? ;;
    -r|--restart|restart) cmd_stop; sleep 0.5; cmd_start || rc=$? ;;
    -i|--status|status)   cmd_status  || rc=$? ;;
    -l|--logs|logs)       cmd_logs    || rc=$? ;;
    -f|--fg|fg)           cmd_fg      || rc=$? ;;
    -c|--check|check)     cmd_check   || rc=$? ;;
    -t|--test|test)       cmd_test    || rc=$? ;;
    -d|--dev|dev)         cmd_dev     || rc=$? ;;
    -h|--help|help)       usage; exit 0 ;;
    *) err "Unknown option: $1"; echo; usage; exit 2 ;;
  esac
  shift
done
exit $rc
