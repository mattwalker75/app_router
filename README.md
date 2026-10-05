# App Router

One front page for every web app you run. Each app keeps its own port; App Router
gives you a single address with a tile for each one. Click a tile and you are in the app.

- **Tiles and directories.** A link is a tile with a name, an optional description and
  picture. Directories group tiles the way bookmark folders do, up to 8 deep.
- **Apps on this computer need only a port.** The tile opens that port on whatever name
  you used to reach App Router: `localhost`, the network address, or a Tailscale name.
  Anything elsewhere takes a full address.
- **Status lights.** Green when a link answers, yellow when it has just come back, red
  when it is down. Per link, and switchable for the whole page.
- **Yours to lock down.** Network access, a login with several users, and whether the
  page can be changed at all are switches in Settings.
- **Light, dark, or your own colours.**
- **Works on a computer, a tablet and a phone.** The same page rearranges itself to fit.

It is a launcher, not a proxy: your apps are not changed, and each keeps its own login.

## Quick start

```bash
./INSTALL_APP.sh           # once: packages, build, config.json, tests
./ROUTER.sh --start        # start it and open http://localhost
./AUTOSTART.sh --install   # optional: start it whenever this Mac starts
```

It listens on port 80 by default, so the address needs no port number. Change that, and
everything else, in **Settings** or in `config.json`.

## Documentation

| | |
| --- | --- |
| [Installation](Docs/INSTALLATION.md) | What it needs, installing, starting at boot, moving to another computer |
| [User guide](Docs/USER_GUIDE.md) | Adding links and directories, dragging, search, Settings, using it on a phone or tablet |
| [Health checks](Docs/HEALTH_CHECKS.md) | What the lights mean and how a link is checked |
| [Configuration](Docs/CONFIGURATION.md) | Every key in `config.json` |
| [Security](Docs/SECURITY.md) | Network access, the login, users, the password file |
| [Scripts](Docs/SCRIPTS.md) | `INSTALL_APP.sh`, `ROUTER.sh`, `AUTOSTART.sh` |
| [Data](Docs/DATA.md) | The links file, pictures, export and import, backing up |
| [API](Docs/API.md) | Every HTTP route |
| [Architecture](Docs/ARCHITECTURE.md) | How it is built |
| [Development](Docs/DEVELOPMENT.md) | Working on the code, tests, conventions |

Changes are listed in [CHANGELOG.md](CHANGELOG.md).
