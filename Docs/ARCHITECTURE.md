# Architecture

## Stack

| Layer | What |
| --- | --- |
| Server | Node.js 22+, **Express 5**, TypeScript compiled with `tsc` |
| Storage | One JSON file for links and directories, one for settings, one for passwords |
| Page | **React 19**, **Vite**, **Tailwind CSS v4**, TanStack Query, **dnd-kit** (drag and drop), Radix (dialogs, menus), lucide icons, sonner (toasts) |
| Font | Figtree, bundled. No internet needed. |
| Login | bcryptjs, cookie-session, express-rate-limit; helmet for headers |
| Tests | Vitest, against the real app on spare ports with scratch data |

There is no database and no build step at run time: `npm run build` produces
`dist/web` (the page) and `dist/node` (the server), and `node` runs the latter.

## Folders

```
server/src/
  index.ts      start: read config, open the links file, listen, start the health checks
  app.ts        the Express app: guards, login gate, every /api route, pictures, the built page
  config.ts     config.json: defaults, deep merge, atomic owner-only save, restart-needed keys
  auth.ts       the password file (several logins, bcrypt) and sessions
  users.ts      what users may do: add, remove, reset, turn the login on and off
  security.ts   Host check, same-origin writes, and how the server listens (the port-80 rule)
  store.ts      the links file: load, save atomically
  service.ts    every rule about links and directories, pictures, export and import
  health.ts     the health checker and the rules for green / yellow / red / grey
  util.ts       ids, UserError (a mistake said as a plain sentence), atomic file writes
shared/
  types.ts      the data model, used by server and page
  address.ts    where a link goes and what a check asks for, worked out the same on both sides
web/src/
  main.tsx      starts the page; puts the remembered theme on before anything is drawn
  index.css     the theme tokens (light and dark) every colour comes from
  App.tsx       theme, sign-in screens or the page; hash routes (#/, #/d/<id>, #/settings/<section>)
  components/   Shell (header), Launchpad (the page + drag and drop), Tiles, LinkDialog,
                DirectoryDialogs, AuthScreens, ErrorBoundary, ui, confirm
  settings/     SettingsPage and its sections: Page, Appearance, Health, Access, Users, Backup
  lib/          api client, query hooks, tree, format, theme
test/           service, health, api, users, listen, page and scripts suites + helpers
```

## Request flow

```
browser ──► hostGuard ──► helmet ──► json ──► cookie-session ──► sameOriginWrites
        ──► /api/health, /api/appearance, /api/auth/me|login|setup|logout   (always open)
        ──► login gate (401 when the login is on and you are not signed in)
        ──► /api/* routes ──► Service ──► Store (links.json)
                          └─► HealthChecker (status)
        ──► /icons/:name
        ──► dist/web (the built page; every other path gets index.html)
```

## How a few things work

**A launcher, not a proxy.** A tile is a plain link. For an app on the same computer
the page builds the address from `window.location.hostname` plus the link's port, so
one saved link works from `localhost`, the network address and a VPN name. Nothing is
forwarded through App Router, so the apps are untouched and keep their own logins.

**One place for rules.** `service.ts` checks and tidies everything about links and
directories, including a links file edited by hand: when it starts it fills in missing
fields and unties directories that contain each other, so the page always gets whole
records. Should the page still fail to draw, an error boundary offers a reload instead
of a blank page. `store.ts` only reads and writes. `app.ts` only routes, and holds the one
check for "are changes allowed" in front of every route that changes links or
directories.

**Order.** Each directory, and the main page, keeps its links and its sub-directories
by an integer `position`. A move takes the item out, puts it at the given index among
its new neighbours, and renumbers both groups from 0. The page applies the same move to
what is on screen before the server answers (`lib/tree.ts`), so a dropped tile stays
put; `test/page.test.ts` checks both agree.

**Health checks.** `HealthChecker` keeps one small record per link in memory: the
verdict, when it last changed, when it last recovered, and how many checks failed in a
row. A timer runs a round, eight links at a time. `statusOf` turns a record into a
light. A link is never asked twice at once, and saving a health setting starts a round. Changing a link's address starts its record again. The service tells the checker
when links change, so a new link is checked at once.

**Listening.** `security.listen` binds `0.0.0.0` when network access is on, and
`127.0.0.1` when it is off. If the system refuses that for a low port (`EACCES`, as
macOS does for port 80), it binds `0.0.0.0` and destroys any connection whose remote
address is not loopback.

**Settings.** `PUT /api/settings` accepts only known keys with their types checked,
merges them into `config.json`, and returns which changed keys still need a restart.
Turning the login on or off is not a setting but an action, so the first user is
created in the same step.

**Login.** Users are the entries of the password file. A session cookie carries the
login name, a fingerprint of the password hash, when it was made and a random id.
`Auth.current` checks all of it on every request: removing a user or changing a
password ends their sessions, a session older than `sessionHours` is refused, and
signing out puts its id on a list of ended sessions kept until it would have expired.
The cookie is signed with a key made at start, so a restart signs everyone out.

**Drag and drop.** One `DndContext` wraps the page, with a mouse sensor (a drag starts
after 8 pixels) and a touch sensor (after a 250 ms press, so a swipe still scrolls).
Link tiles, directory tiles,
top-level sections and each grid are droppable; a custom collision rule makes a tile
under the pointer win over the grid, and the grid over its section. The click the
browser sends after a drop is cancelled on the document, because the drag library only
stops it from spreading, which would still follow the link.

**Themes.** Every colour is a CSS variable. Light and dark are two sets in
`index.css`; a custom theme sets the same variables inline on `<html>`.
