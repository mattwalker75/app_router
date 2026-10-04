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

It reads the port from `config.json`. "Running" means App Router itself is answering
on that port: another web server there is not mistaken for it.

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

See the note about Desktop, Documents and Downloads in
[Installation](INSTALLATION.md#start-whenever-the-mac-starts).
