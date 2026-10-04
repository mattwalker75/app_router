# Installation

## What it needs

- A Mac (the scripts are written for macOS; the app itself runs anywhere Node does).
- **Node.js 22 or newer.** `INSTALL_APP.sh` offers to install it with Homebrew.
- Nothing else. There is no database.

## Install

```bash
git clone https://github.com/mattwalker75/app_router.git
cd app_router
./INSTALL_APP.sh
```

The script installs the packages, builds the app, creates `config.json` from
`config.example.json`, and runs the tests. It is safe to run again, for example after
pulling new code.

## Start

```bash
./ROUTER.sh --start
```

This starts App Router in the background and opens `http://localhost`. See
[Scripts](SCRIPTS.md) for stop, restart, status and logs.

### Port 80

Port 80 is the default because it is the port a browser uses when you type no number.
macOS lets a normal user open port 80 without `sudo`, with one condition: only on every
network address at once, not on `127.0.0.1` alone.

So while **Allow other devices on my network** is off, App Router listens on every
address and drops any connection that does not come from the Mac itself. Other devices
still cannot open it. On a port of 1024 or higher it listens on `127.0.0.1` only.

To use another port, change **Settings → Access → Port** (or `server.port` in
`config.json`) and run `./ROUTER.sh --restart`. If another web server already uses
port 80, App Router says so and does not start.

## Start whenever the Mac starts

```bash
./AUTOSTART.sh --install            # when you log in (the usual choice)
./AUTOSTART.sh --install --system   # when the Mac boots, before anyone logs in
./AUTOSTART.sh --status
./AUTOSTART.sh --remove
```

`--install` suits a Mac that logs you in automatically. `--system` asks for your
administrator password once and starts App Router at boot; it still runs as you.

macOS starts App Router again if it ever stops. `./ROUTER.sh --start`, `--stop` and
`--restart` keep working and go through the installed service.

> **Protected folders.** macOS guards Desktop, Documents and Downloads. If App Router
> lives in one of them, macOS asks once whether "node" may use that folder: answer
> Allow. With `--system` there is nobody to ask, so keep the app outside those folders
> (for example `~/Apps/app_router`) or give node Full Disk Access in System Settings →
> Privacy & Security.

## Reach it from other devices

1. **Settings → Access → Allow other devices on my network**, Save, then
   `./ROUTER.sh --restart`. Settings then lists the addresses to use.
2. If you reach the Mac through a VPN such as Tailscale, add that name under
   **Other names for this computer**, for example `mac-mini.tailnet-name.ts.net`.
   App Router refuses names it does not know.
3. Turn the login on if other people share the network. See [Security](SECURITY.md).

Each app you link to must allow network access too. App Router's switch opens only
App Router.

## Move it to another computer

Copy `config.json` and the `data/` folder to the new copy of the app, or use
**Settings → Backup → Export** and **Import**. Details in [Data](DATA.md).

## Update

```bash
git pull
./INSTALL_APP.sh
./ROUTER.sh --restart
```
