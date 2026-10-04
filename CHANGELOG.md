# Changelog

All notable changes to App Router are listed here, newest first.

## [Unreleased]

### Added
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
  - 89 tests.
