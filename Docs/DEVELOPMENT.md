# Development

## Run it while working

```bash
./ROUTER.sh --dev     # server with reload + the page with live reload on http://localhost:5174
npm run typecheck     # server and page
npm test              # every suite
npm run build         # dist/web and dist/node
```

Never test on your real `config.json` or `data/`. Point a scratch copy somewhere else:

```bash
mkdir -p /some/scratch && echo '{ "server": { "port": 18200 } }' > /some/scratch/config.json
AR_CONFIG=/some/scratch/config.json node dist/node/server/src/index.js
```

Every path in a config is relative to that config's folder, so the scratch copy keeps
its links, pictures and password file to itself.

## Tests

`npm test` runs Vitest. No suite needs the internet, a database or port 80.

| Suite | Covers |
| --- | --- |
| `service.test.ts` | Links, directories, order and moving, pictures, the file on disk, export and import |
| `health.test.ts` | Real checks against stand-in apps; green, yellow, red and grey |
| `api.test.ts` | The routes, the changes switch, settings, guards |
| `users.test.ts` | The login, users, the password file, the sign-in limit |
| `listen.test.ts` | Listening on this computer only, the low-port filter, the network |
| `page.test.ts` | Light labels, tile colours, and that a drop on screen matches the server |

`test/helpers.ts` starts the real app on a spare port with scratch data
(`startServer`), keeps cookies like a browser (`cookieClient`), and makes stand-in apps
(`fakeApp`) and a port nothing listens on (`deadPort`).

The page itself is checked by hand, or with a headless browser against a scratch copy.
Two things to know when driving it: Radix menus open on `pointerdown`, not on
`.click()`, and a drag needs real mouse events moved more than 8 pixels.

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
- **Colours come from theme tokens only**, so every theme restyles everything.
- **Destructive actions need a typed word** in the page and on the server: `DELETE`,
  `REPLACE`, `DISABLE`.
- **Buttons and fields are 44 px tall**; the page must work at phone width.
- **README stays high-level.** Detail goes in `Docs/`.
- **One commit per feature**, with a dated entry in `CHANGELOG.md`.
