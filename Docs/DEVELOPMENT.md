# Development

## Run it while working

```bash
./ROUTER.sh --dev     # server with reload + the page with live reload on http://localhost:5174
npm run typecheck     # server and page
npm test              # every suite
npm run build         # dist/web and dist/node
```

Never test on your real `config.json` or `data/`. Always give the server its config
file: started with no `AR_CONFIG`, it uses the app's own `config.json`, and with none
there, the defaults — port 80. Point a scratch copy somewhere else:

```bash
mkdir -p /some/scratch && echo '{ "server": { "port": 18200 } }' > /some/scratch/config.json
AR_CONFIG=/some/scratch/config.json node dist/node/server/src/index.js
```

Every path in a config is relative to that config's folder, so the scratch copy keeps
its links, pictures and password file to itself.

## Tests

`npm test` runs Vitest. No suite needs the internet, a database or port 80, and none
installs anything on the computer.

| Suite | Covers |
| --- | --- |
| `service.test.ts` | Links, directories, order and moving, pictures, the file on disk, export and import |
| `health.test.ts` | Real checks against stand-in apps; green, yellow, red and grey |
| `api.test.ts` | The routes, the changes switch, settings (a config edited by hand, places that cannot be used), guards |
| `users.test.ts` | The login, users, the password file and where it may be kept, the theme before signing in, the sign-in limit |
| `listen.test.ts` | Listening on this computer only, the low-port filter, the network |
| `page.test.ts` | Light labels, tile colours, and that a drop on screen matches the server |
| `scripts.test.ts` | `ROUTER.sh` and `AUTOSTART.sh` run for real in a scratch copy, with a stand-in `launchctl` and a scratch home folder. macOS only, and skipped until the app is built. |

`test/helpers.ts` starts the real app on a spare port with scratch data
(`startServer`), keeps cookies like a browser (`cookieClient`), and makes stand-in apps
(`fakeApp`) and a port nothing listens on (`deadPort`).

The page itself is checked by hand, or with a headless browser against a scratch copy.
Things to know when driving it: Radix menus open on `pointerdown`, not on `.click()`;
a mouse drag needs real mouse events moved more than 8 pixels; a touch drag needs a
press held for a quarter of a second first; and a link that opens in a new tab stalls
a single-tab driver.

## Conventions

- **Rules live in `service.ts`.** Routes route, the store stores.
- **Messages are plain sentences** a non-developer can act on. Throw `UserError` with
  the sentence; the route wrapper turns it into `{ error }`.
- **Every setting is in `config.json` and in Settings**, marked "Applies immediately"
  or "Needs restart". A new key needs: a default in `DEFAULTS` (`config.ts`), a line in
  `config.example.json`, validation in `settingsPatch` (`app.ts`), a field in Settings,
  the type in `web/src/lib/hooks.ts`, a row in `Docs/CONFIGURATION.md`, and
  `RESTART_REQUIRED` if it needs a restart.
- **A route that changes links or directories takes the `editing` guard** in `app.ts`.
- **Colours come from theme tokens only**, so every theme restyles everything. Two
  exceptions: tile colours are a fixed palette that white letters read on, and the knob
  of a switch is white.
- **A box in Settings follows its own saved value** (`useEffect` on that one value), so
  saving something else never wipes what is being typed.
- **Destructive actions need a typed word** in the page and on the server: `DELETE`,
  `REPLACE`, `DISABLE`.
- **Three sizes, one page.** Buttons and fields are 44 px tall. The few smaller
  controls (a tile's ⋯, a window's ✕, small buttons, colour swatches) grow to 40 px
  under a finger with `pointer-coarse:`, and text boxes use 16 px text there — a phone
  zooms the whole page in when a smaller box is tapped. Layout changes use Tailwind's
  breakpoints: below `lg` (1024 px) the header's search box gets its own line; below
  `md` (768 px) Settings shows its sections as a sliding row; below `sm` (640 px) the
  header leaves out the computer's name. Field grids inside Settings use container
  queries (`@xl:`), because the room they have depends on the menu beside them, not on
  the screen. Anything shown only on hover needs another way on a touch screen (a
  link's **Details…**). Heights use `dvh`, never `vh`. Check a change at 1440, 820 and
  390 px wide, with and without touch.
- **README stays high-level.** Detail goes in `Docs/`.
- **One commit per feature**, with a dated entry in `CHANGELOG.md`.
