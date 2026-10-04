# Changelog

All notable changes to App Router are listed here, newest first.

## [Unreleased]

### Fixed
- 2026-10-04: **A review of the first version.** Everything below came from reading the code
  again and from an independent review; each fix has a test.
  - **Login.** Changing the password file's place in Settings while the login was on left
    the app with no users, so the next visitor could create the only login. The file is now
    moved along. A sign-in now ends on the server after `sessionHours`, not only in the
    browser, and Sign out ends that session even for a copy of its cookie. A password longer
    than 72 characters is refused instead of silently cut. Adding a user can no longer undo
    a removal or password change made at the same moment.
  - **`ROUTER.sh`.** It now hands its config file to the server it starts. A start that fails
    stops the half-started copy. A pid file left from before a reboot is no longer trusted,
    so `--stop` can never stop another program. `--fg` and `--dev` refuse to run beside a
    copy kept running by the system. The log is trimmed past 5 MB.
  - **`AUTOSTART.sh`.** The log moved to `~/Library/Logs/app-router.log`, outside folders
    macOS guards. It checks for Node 22.
  - **Dragging.** A link let go in a gap next to a directory tile no longer vanishes into
    that directory. A directory tile dropped on a link of another section moves there, as
    the guide says. Pressing a tile's ⋯ button no longer picks the tile up.
  - **Health checks.** Turning them back on, or saving new timing, starts a round at once.
    A link is never asked twice at the same moment, so one hiccup cannot count as two
    failures.
  - **Settings.** A box you are typing in is no longer reset by saving or flipping something
    else. The "restart to apply" message only appears for the save that needs it. A save
    keeps what was typed into `config.json` by hand meanwhile. The Host check follows how
    the server was started, so switching network access off no longer cuts you off before
    the restart.
  - **Data.** A links file edited by hand is repaired on start (missing fields, unknown
    directories, directories that contain each other) instead of blanking the page or
    hanging. Import refuses entries that are not records, two directories with one id, and
    nesting deeper than 8, with a plain message. Pictures and the page are served when a
    folder in their path starts with a dot.
  - **Smaller things.** Red buttons are readable in the dark theme. The link form keeps
    separate ports for "on this computer" and "elsewhere". Emoji work in names and as tile
    letters. Search matches the whole address. "Move to…" the place a directory is already
    in changes nothing. A hand-edited address that is not http or https opens nothing.

### Added
- 2026-10-04: **Dragging on touch screens**: press and hold a tile, then drag; a swipe still
  scrolls. **`/`** jumps to the search box. A page left open refreshes its links every half
  minute. An address for a directory that no longer exists goes back to the main page. An
  error screen with Reload replaces a blank page if drawing ever fails.
- 2026-10-04: Tests for the scripts (`test/scripts.test.ts`): `ROUTER.sh` and `AUTOSTART.sh`
  run for real in a scratch copy with a stand-in `launchctl`. 119 tests in all.
- 2026-10-04: **First version.** One front page for the web apps you run, each on its own port.
  - **Links and directories.** A link is a tile with a name, an optional description, and
    letters, a colour or a picture. Directories nest like bookmark folders; a link can also
    sit on the main page. Tiles are reordered and moved by dragging, or from their ⋯ menu.
  - **Apps on this computer need only a port** (and a path, if the app is not at the root of
    its port). The tile opens that port on whatever name you reached App Router by. Anything
    elsewhere takes a full address and an optional port.
  - **Status lights**, per link and with a master switch: green when it answers, yellow for a
    while after it comes back, red after two failed checks in a row, grey when not checked.
    Timing is in Settings. An optional address to check, such as `/api/health`.
  - **Settings**: the title and the name of the main page; **Allow changes to the page**
    (off hides the add buttons and refuses every change); **Show the search box**; Light, Dark,
    System and your own themes; health check timing; port, network access and other names for
    this computer; the login and its users; export and import.
  - **Access**, the same way as my_business_manager: network access on or off; an optional
    login; several users who see the same page and can all add users, set passwords and remove
    users. Passwords need 8 characters and every password box has an eye button. Deleting the
    password file asks for a new first login and touches nothing else.
  - **Port 80 by default**, without `sudo`. With network access off it accepts connections
    from this computer only.
  - **Scripts**: `INSTALL_APP.sh`, `ROUTER.sh` (start, stop, restart, status, logs), and
    `AUTOSTART.sh` to start App Router whenever the Mac starts.
