# Changelog

All notable changes to App Router are listed here, newest first.

## [Unreleased]

### Added
- 2026-10-04: **Details for every link.** A link's ⋯ menu starts with **Details…**: the
  whole description, the address it opens, where it sits on the page, and its status with
  the reason and the address that is checked. A tile cuts a long name and description
  short and shows the rest only on hover; a phone or tablet has nothing to hover with, so
  there the ⋯ stays even when changes to the page are off, with Details alone in it.
- 2026-10-04: **The sign-in screen wears your theme.** It used to follow the device's
  light or dark setting whatever was chosen in Settings. The theme is now answered before
  signing in (`GET /api/appearance`, colours only) and remembered in each browser, so a
  reload does not flash the default look either.

### Changed
- 2026-10-04: **Reviewed on a computer, a tablet and a phone.** Nothing was broken at any
  size; these make the smaller ones comfortable. The page on a computer looks as before.
  - **Header.** On a tablet held upright the search box and the summary of the lights get
    a line of their own instead of wrapping unevenly. On a phone the header is two lines
    instead of three: the computer's name is left out and the signed-in user is a picture.
    A long title wraps instead of pushing the buttons off the screen.
  - **Settings on a phone.** The sections are a row you slide sideways, so the settings
    start at the top instead of below a tall menu. Pairs of boxes sit side by side only
    when there is room for both, judged by the room they have and not by the screen.
  - **Under a finger.** Text boxes use 16px text (a phone zooms the whole page in for
    anything smaller). The small controls — a tile's ⋯, a window's ✕, the eye in a password
    box, colour swatches, the drag handle, theme buttons — are 40px. Menu rows are taller.
  - **Long names** wrap everywhere: a directory's heading keeps its folder picture beside
    it, the trail keeps each arrow with its name, and a window's title, a user's name and
    a search for a long word no longer make anything scroll sideways.
  - **A new screen starts at its top.** Opening a directory, Settings or a Settings
    section used to keep the scroll position of the screen before.
  - The add-link form puts the port and the type on one line on a phone.
- 2026-10-04: **Simpler tiles.** A tile no longer has a line for the address or port — it
  shows the name, the description (now on up to two lines) and the status light. Hover a
  tile to see where it goes. Search still finds a link by its address.

### Fixed
- 2026-10-04: **A second review** — the code read again and checked by an independent
  review; each fix has a test (130 in all).
  - **Password file.** If the new place could not be saved (config.json broken by hand),
    the file had already moved, and the next visitor was asked to create a login. It is now
    put back. With no users yet, Settings accepted any existing file as the password file;
    now only a place with no file, or a real password file. The links file and the pictures
    folder are checked the same way before they are saved.
  - **config.json edited by hand.** A value of the wrong kind (text where a list belongs,
    `null` for a group) made every request fail. Such a value now falls back to its default.
  - **Links file edited by hand.** An id with anything but lowercase letters and digits
    broke that link's picture and could write a file outside the pictures folder. Such ids
    are replaced when the file is read, and a picture name the app did not make is dropped.
  - **Links.** `mailto:` and other non-web addresses are refused instead of being bent into
    a web address. A name or description is measured in characters as people count them,
    so 80 emoji fit. A malformed request (`"icon": "abc"`, a port of `true`) gets a plain
    sentence instead of "Something went wrong". An address the browser cannot read no
    longer shows "Opens about:blank" in the form.
  - **Settings → Access** listed the addresses for other devices as soon as the switch was
    saved, before the restart that makes them work, and hid them while they still worked.
    It now shows the addresses that answer at that moment.
  - **Deleting a directory** that could not be deleted no longer jumps to its parent.
  - **Health checks.** New links from an import are checked eight at a time, not all at once.
  - **`ROUTER.sh`.** After the port was changed in Settings, `--status` and `--stop` said
    "Not running" about the copy still listening on the old port. They now find it, say
    that a restart is needed, and stop it. A change to the favicon, the packages or the
    build settings triggers a rebuild.
  - **`INSTALL_APP.sh`** checks the Node.js version again after installing it.
  - **Reading it out loud.** The colour choices are announced as buttons that are pressed
    or not; the drag handle is skipped by the keyboard (Move earlier / later in the ⋯ menu
    does that job); the label of the network switch flips it.
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
