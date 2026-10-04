# Configuration

Every setting lives in `config.json`, next to the scripts. **Settings** in the app
reads and writes the same file, so editing it by hand and editing it in the app are the
same thing.

- `INSTALL_APP.sh` creates it from `config.example.json`. It is never committed.
- Missing keys use the defaults below. Unknown keys, including `_comment` notes, are kept.
- Paths are relative to the folder `config.json` is in. `~` means your home folder.
- The file is written with owner-only permissions.
- To use a different file, set `AR_CONFIG=/path/to/config.json`.

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
| `passwordFile` | `./.password` | immediately | Where the users and their password hashes are kept. |
| `sessionHours` | `12` | after a restart | How long a sign-in lasts. 1 to 720. |

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
| `intervalSeconds` | `30` | next round | Time between rounds of checks. 5 to 3600. |
| `timeoutSeconds` | `5` | next round | How long to wait for an answer. 1 to 60. |
| `recoveredMinutes` | `10` | immediately | How long a link stays yellow after it answers again. 0 to 1440. |
| `failuresBeforeDown` | `2` | next round | Failed checks in a row before a link turns red. 1 to 10. |

See [Health checks](HEALTH_CHECKS.md).

### `appearance`

| Key | Default | Applies | Meaning |
| --- | --- | --- | --- |
| `theme` | `system` | immediately | `light`, `dark`, `system`, or the id of one of your `customThemes`. |
| `customThemes` | `[]` | immediately | Themes made in Settings → Appearance: `{ id, name, dark, tokens }`. |

A custom theme's `tokens` are colours as `#rrggbb`: `bg`, `surface`, `surface-2`,
`ink`, `ink-2`, `mute`, `line`, `accent`, `accent-ink`, `accent-soft`, `accent-softer`,
`accent-text`. `dark` says which built-in theme supplies the rest.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `AR_CONFIG` | Path of the config file to use instead of `./config.json`. |
| `PORT` | Overrides `server.port` for this run. |
| `AR_NO_OPEN` | Set to `1` so `ROUTER.sh --start` does not open the browser. |
| `AR_NO_AUTOSTART` | Set to `1` so `ROUTER.sh` ignores an installed automatic start. |
