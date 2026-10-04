# API

Everything the page does goes through these routes. Bodies and replies are JSON unless
noted. An error is `{ "error": "a plain sentence" }` with a fitting status. A request
that arrives under a name the computer does not answer to gets `421`.

With the login on, every route except the first group needs a signed-in session cookie
and otherwise answers `401 { error, auth }`.

Changes (`POST`, `PUT`, `PATCH`, `DELETE`) must come from a page App Router served.
Routes marked ✎ are refused with `403` while **Allow changes to the page** is off.

## Always open

| Route | Does |
| --- | --- |
| `GET /api/health` | `{ ok, app: "app-router", version }`. Used by the scripts. |
| `GET /api/auth/me` | `{ status }`: `disabled`, `not_initialized`, `unauthenticated`, or `authenticated` with `loginName`. |
| `POST /api/auth/login` | `{ loginName, password }` → signs in. Limited to 10 tries per 5 minutes from one address, a limit shared with `setup`, `enable` and `password`. |
| `POST /api/auth/setup` | `{ loginName, password }` → creates the first user. Only while the login is on and there is no password file. |
| `POST /api/auth/logout` | Signs out. That session's cookie stops working, copies included. |

## Login and users

| Route | Does |
| --- | --- |
| `POST /api/auth/enable` | `{ loginName, password }` → turns the login on, creates the first user, signs in. If a password file is already there, the name and password must match a user in it instead. |
| `POST /api/auth/disable` | `{ confirm: "DISABLE" }` → turns the login off and removes every user. |
| `POST /api/auth/password` | `{ currentPassword, newPassword }` → change your own password. |
| `GET /api/users` | `{ users: [{ loginName, you }] }` |
| `POST /api/users` | `{ loginName, password }` → add a user. |
| `PUT /api/users/:name/password` | `{ password }` → set a new password for a user. |
| `DELETE /api/users/:name` | `{ confirm: "DELETE" }` → remove another user. |

## The page

| Route | Does |
| --- | --- |
| `GET /api/state` | Version, login state, the whole config, what needs a restart, file paths, the computer's name, how it is listening, network addresses. |
| `GET /api/page` | `{ directories, links }`, each in order. |
| `GET /api/status` | `{ enabled, checkedAt, intervalSeconds, links: { <id>: { light, since, checkedAt, ms, detail } } }` |
| `POST /api/status/check` | Runs a round of checks now and returns the report. |

## Links

| Route | Does |
| --- | --- |
| `POST /api/links` ✎ | Create. `name` is required; `port` when `local` (the default), `url` otherwise. |
| `PATCH /api/links/:id` ✎ | Change. Only the fields sent change. |
| `DELETE /api/links/:id` ✎ | Delete. |
| `POST /api/links/:id/move` ✎ | `{ directoryId, index }` → place it. `directoryId` `"root"` or `null` is the main page; no `index` means the end. |
| `POST /api/links/:id/icon` ✎ | The body is the picture itself, with its `Content-Type`: PNG, JPEG, WebP or GIF, up to 1 MB. |
| `DELETE /api/links/:id/icon` ✎ | Remove the picture. |
| `GET /icons/:name` | A link's picture. |

Link fields: `name`, `description`, `local`, `scheme`, `port`, `path`, `url`,
`directoryId`, `openIn`, `icon: { text, color }`, `health: { enabled, path }`. See
[Data](DATA.md).

## Directories

| Route | Does |
| --- | --- |
| `POST /api/directories` ✎ | `{ name, parentId }` → create. |
| `PATCH /api/directories/:id` ✎ | `{ name }` → rename. |
| `GET /api/directories/:id/contents` | `{ directories, links }`: how much is inside. |
| `DELETE /api/directories/:id` ✎ | Delete. One that is not empty needs `{ confirm: "DELETE" }` and takes its contents with it. |
| `POST /api/directories/:id/move` ✎ | `{ parentId, index }` → place it. |

## Settings, export, import

| Route | Does |
| --- | --- |
| `GET /api/settings` | `{ config, restartRequired, configFile }` |
| `PUT /api/settings` | A partial config, for example `{ "page": { "rootName": "My apps" } }`. Known keys are checked and saved; unknown keys are ignored. Returns `{ config, restartRequired, restartNow }`: every key waiting for a restart, and those this save changed. `security.loginEnabled` is refused here: use `/api/auth/enable` and `/disable`. Changing `security.passwordFile` moves the file. Saving a `health` key starts a round of checks. |
| `GET /api/export/download` | The links file, as a download. |
| `POST /api/import` ✎ | `{ document, mode: "add" \| "replace", confirm }`. `replace` needs `confirm: "REPLACE"`. Up to 5 MB. |
