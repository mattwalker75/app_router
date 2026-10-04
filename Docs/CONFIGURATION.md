# Configuration

Every setting lives in `config.json`, next to the scripts. **Settings** in the app
reads and writes the same file, so editing it by hand and editing it in the app change
the same thing.

The file is read when App Router starts. An edit made by hand while it is running takes
effect at the next restart; a Save in Settings meanwhile keeps your edit, it does not
write over it. If the file is not valid JSON when you save in Settings, nothing is
saved and you are told why.

- `INSTALL_APP.sh` creates it from `config.example.json`. It is never committed.
- Missing keys use the defaults below. Unknown keys, including `_comment` notes, are kept.
- Paths are relative to the folder `config.json` is in. `~` means your home folder.
- The file is written with owner-only permissions.
- To use a different file for a run by hand, set `AR_CONFIG=/path/to/config.json`.
  Automatic start (`AUTOSTART.sh`) always uses the `config.json` next to the scripts.

## Keys

### `server`

| Key | Default | Applies | Meaning |
| --- | --- | --- | --- |
| `port` | `80` | after a restart | The port App Router listens on. 1 to 65535. The `PORT` environment variable overrides it for one run. |
| `allowNetwork` | `false` | after a restart | `false`: only this computer can open the page. `true`: other devices on your network or VPN can. |
| `extraHosts` | `[]` | immediately | Other names this computer is reached by, for example a Tailscale name. Up to 20. |

### `security`

| Key | Default | Applies | Meaning |
| --- | --- | --- | --- |
| `loginEnabled` | `false` | immediately | Whether everyone signs in first. Changed with **Turn the login on / off** in Settings → Access, not with Save. |
| `passwordFile` | `./.password` | immediately | Where the users and their password hashes are kept. Changed in Settings, the file is moved to the new place, so the users stay. Changed by hand, move the file yourself. |
| `sessionHours` | `12` | after a restart | How long a sign-in lasts, counted from signing in. 1 to 720. |

### `data`

| Key | Default | Applies | Meaning |
| --- | --- | --- | --- |
| `file` | `./data/links.json` | after a restart | The links and directories. |
| `iconsDir` | `./data/icons` | after a restart | Pictures uploaded for links. |

Changing a path does not move the files. Move them yourself.

### `page`

| Key | Default | Applies | Meaning |
| --- | --- | --- | --- |
| `title` | `App Router` | immediately | The name at the top left and on the browser tab. Up to 40 characters. |
| `rootName` | `Apps` | immediately | The heading over the links that are not in a directory. Up to 40 characters. |
| `allowEditing` | `true` | immediately | `false` hides **Add link** and **New directory** and refuses every change to links and directories. |
| `showSearch` | `true` | immediately | Whether the search box is shown. |

### `health`

| Key | Default | Applies | Meaning |
| --- | --- | --- | --- |
| `enabled` | `true` | immediately | The master switch. `false`: nothing is checked, every light is grey. |
| `intervalSeconds` | `30` | immediately | Time between rounds of checks. 5 to 3600. |
| `timeoutSeconds` | `5` | immediately | How long to wait for an answer. 1 to 60. |
| `recoveredMinutes` | `10` | immediately | How long a link stays yellow after it answers again. 0 to 1440. |
| `failuresBeforeDown` | `2` | immediately | Failed checks in a row before a link turns red. 1 to 10. |

Saving a health setting in Settings starts a round of checks at once.

See [Health checks](HEALTH_CHECKS.md).

### `appearance`

| Key | Default | Applies | Meaning |
| --- | --- | --- | --- |
| `theme` | `system` | immediately | `light`, `dark`, `system`, or the id of one of your `customThemes`. |
| `customThemes` | `[]` | immediately | Themes made in Settings → Appearance: `{ id, name, dark, tokens }`. |

A custom theme's `tokens` are colours as `#rrggbb`: `bg`, `surface`, `surface-2`,
`ink`, `ink-2`, `mute`, `line`, `accent`, `accent-ink`, `accent-soft`, `accent-softer`,
`accent-text`. `dark` says which built-in theme supplies the rest: the status lights,
warning and delete colours, and the fainter text and lines.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `AR_CONFIG` | Path of the config file to use instead of `./config.json`, for a run by hand. `ROUTER.sh` passes the file it uses on to the server. |
| `PORT` | Overrides `server.port` for this run. |
| `AR_NO_OPEN` | Set to `1` so `ROUTER.sh --start` does not open the browser. |
| `AR_NO_AUTOSTART` | Set to `1` so `ROUTER.sh` ignores an installed automatic start. |
