# Scripts

Three scripts sit next to `config.json`. Each prints its own help with `-h`.

## `INSTALL_APP.sh`

Sets App Router up on this computer. Safe to run again.

| Option | Does |
| --- | --- |
| *(none)* | Check or install Node, install packages, build, create `config.json`, run the tests. |
| `-y`, `--yes` | Do not ask before installing with Homebrew. |
| `-c`, `--check` | Only report what is installed or missing. |

Logs: `data/build.log`, `data/test.log`.

## `ROUTER.sh`

Runs App Router. Options run in the order given; bare words work too
(`./ROUTER.sh restart`).

| Option | Does |
| --- | --- |
| `-s`, `--start` | Start in the background and open the page. Builds first if the code changed. The default. |
| `-x`, `--stop` | Stop it. |
| `-r`, `--restart` | Stop, then start. Needed after changing the port or network access. |
| `-i`, `--status` | Is it running, and where? |
| `-l`, `--logs` | Follow `data/router.log`. |
| `-f`, `--fg` | Run in the foreground. Ctrl-C stops it. |
| `-c`, `--check` | Check that everything it needs is in place. |
| `-t`, `--test` | Run the tests. |
| `-d`, `--dev` | Developer mode with a live-reloading page on port 5174. |

It reads the port from `config.json`, and hands that file to the server it starts.

- A start counts as done only when App Router itself answers on that port: another web
  server there is not mistaken for it. A start that fails leaves nothing running.
- The copy it started is remembered in `data/router.pid`. A number left there from
  before a reboot is not trusted: the process must also be App Router, so `--stop` can
  never stop some other program.
- `--fg` and `--dev` refuse to start while another copy is running.
- The log is trimmed to its last 2000 lines when it passes 5 MB.

Set `AR_NO_OPEN=1` to start without opening the browser.

## `AUTOSTART.sh`

Has macOS start App Router by itself, and start it again if it stops.

| Option | Does |
| --- | --- |
| `-i`, `--install` | Start it every time you log in, and now. |
| `--install --system` | Start it when the Mac boots, before anyone logs in. Asks for your administrator password. It still runs as you. |
| `-r`, `--remove` | Stop starting it automatically, and stop it. |
| `-s`, `--status` | Is automatic start installed, and is App Router running? |
| `-p`, `--print` | Show the launchd file it would install. Changes nothing. |

It writes one launchd file named `com.app-router.server`: in `~/Library/LaunchAgents`
for login, or `/Library/LaunchDaemons` for boot.

While it is installed, `./ROUTER.sh --start`, `--stop` and `--restart` go through it.
`--stop` stops App Router until the next login or boot; `--remove` ends the automatic
start.

Installed this way, App Router always uses the `config.json` next to the scripts, and
its log is `~/Library/Logs/app-router.log` (`./ROUTER.sh --logs` follows it). If it
cannot start, for example because the port is taken, macOS tries again every 10
seconds and the log says why.

See the note about Desktop, Documents and Downloads in
[Installation](INSTALLATION.md#start-whenever-the-mac-starts).
