#!/usr/bin/env bash
#
# INSTALL_APP.sh — set up App Router on this computer.
#
# What it needs:
#   REQUIRED  Node.js 22 or newer (npm comes with it) — installed with Homebrew if missing.
#   OPTIONAL  Homebrew — the easiest way to install Node on a Mac (https://brew.sh).
#
# Usage:  ./INSTALL_APP.sh [options…]
#
#   (no options)    Check/install Node, install the app's packages, build it,
#                   create config.json from config.example.json, run the tests.
#   -y, --yes       Don't ask before installing things with Homebrew.
#   -c, --check     Only report what is installed or missing; change nothing.
#   -h, --help      This help.
#
# Examples:
#   ./INSTALL_APP.sh              the usual install
#   ./INSTALL_APP.sh --check      just tell me what is missing
#
# Safe to run again at any time — for example after pulling new code (it rebuilds).
# Then:  ./ROUTER.sh --start        and, to start it whenever the computer starts:  ./AUTOSTART.sh --install
#
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$HERE"
if [[ -t 1 ]]; then C_RESET=$'\033[0m'; C_RED=$'\033[0;31m'; C_GRN=$'\033[0;32m'; C_YEL=$'\033[0;33m'; C_BLU=$'\033[0;34m'; else C_RESET=''; C_RED=''; C_GRN=''; C_YEL=''; C_BLU=''; fi
info() { echo "${C_BLU}==>${C_RESET} $*"; }; ok() { echo "${C_GRN}OK ${C_RESET} $*"; }; warn() { echo "${C_YEL}!! ${C_RESET} $*"; }; err() { echo "${C_RED}ERROR${C_RESET} $*" >&2; }
usage() { awk 'NR>=3 { if (/^#/) { sub(/^# ?/, ""); print } else { exit } }' "${BASH_SOURCE[0]}"; }

YES=0; CHECK_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes)   YES=1 ;;
    -c|--check) CHECK_ONLY=1 ;;
    -h|--help)  usage; exit 0 ;;
    *) err "Unknown option: $1"; echo; usage; exit 2 ;;
  esac; shift
done
confirm() { [[ $YES -eq 1 ]] && return 0; read -r -p "$1 [y/N] " a; [[ "$a" == y || "$a" == Y ]]; }
have() { command -v "$1" >/dev/null 2>&1; }
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
brew_install() { # brew_install <formula> <why>
  if [[ $CHECK_ONLY -eq 1 ]]; then return 1; fi
  if ! have brew; then err "Install $1 ($2). The easy way on a Mac is Homebrew (https://brew.sh), then: brew install $1"; return 1; fi
  confirm "Install $1 with Homebrew (brew install $1)?" && brew install "$1"
}

echo "App Router — install"; echo
# ---- Node.js
if have node && [[ "$(node_major)" -ge 22 ]]; then ok "Node.js $(node -v)"
else
  if have node; then warn "Node.js $(node -v) is too old — 22 or newer is needed"; else warn "Node.js is not installed"; fi
  if brew_install node "to run the app"; then
    hash -r 2>/dev/null
    # an older Node.js can still be the first one found (nvm, an old installer): say so now, not as a failed build later
    if have node && [[ "$(node_major)" -ge 22 ]]; then ok "Node.js $(node -v)"
    else err "Node.js was installed, but the one this terminal finds first is still $(node -v 2>/dev/null || echo missing) ($(command -v node 2>/dev/null || echo "not on the PATH")). Open a new terminal window, or remove the older one, then run ./INSTALL_APP.sh again."; exit 1; fi
  elif [[ $CHECK_ONLY -eq 0 ]]; then err "Node.js 22+ is still not available."; exit 1; fi
fi

if [[ $CHECK_ONLY -eq 1 ]]; then
  [[ -d node_modules/express ]] && ok "Packages installed" || warn "Packages not installed"
  [[ -f dist/web/index.html && -f dist/node/server/src/index.js ]] && ok "App built" || warn "App not built"
  [[ -f config.json ]] && ok "config.json present" || warn "config.json not created yet"
  exit 0
fi

# ---- packages + build
info "Installing the app's packages…"
if [[ -f package-lock.json ]]; then npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null; else npm install --no-audit --no-fund >/dev/null; fi
node -e "import('express').then(() => import('vite')).then(() => import('react'))" 2>/dev/null && ok "Packages installed" || { err "A package failed to install — run npm install to see why."; exit 1; }
info "Building…"
mkdir -p data
if npm run build > data/build.log 2>&1; then touch dist/.built; ok "Built"; else err "The build failed — see data/build.log"; tail -n 25 data/build.log; exit 1; fi
# ---- config.json
if [[ -f config.json ]]; then ok "config.json present"
else cp config.example.json config.json && chmod 600 config.json && ok "config.json created from config.example.json"; fi
# ---- tests
info "Running the tests…"
if npx vitest run >data/test.log 2>&1; then ok "Tests pass"; else warn "Some tests failed — see data/test.log (or ./ROUTER.sh --test)"; fi

PORT="$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('config.json','utf8')).server.port||80)}catch{console.log(80)}")"
echo
echo "Next:  ./ROUTER.sh --start        (opens http://localhost$([[ "$PORT" == 80 ]] || echo ":$PORT"))"
echo "       ./AUTOSTART.sh --install   (optional: start App Router whenever this computer starts)"
exit 0
