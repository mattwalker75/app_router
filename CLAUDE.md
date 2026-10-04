# CLAUDE.md — working on App Router

Read this before changing anything. `Docs/` has the detail.

## What it is
One front page for the web apps Matt runs on one Mac (a Mac mini, reached over Tailscale),
each on its own port: tiles to click, grouped in directories, with status lights. Server:
Node 22+ / Express 5 / TypeScript. Page: React 19 + Vite + Tailwind v4 + dnd-kit + Radix.
Data: JSON files. The person using it is not a developer — every message the page shows is
a plain sentence.

## Map
- `server/src/service.ts` — ALL rules for links and directories. `store.ts` only reads and
  writes `data/links.json`. `app.ts` routes + guards; `health.ts` the status lights;
  `auth.ts` + `users.ts` the login; `security.ts` host check and how it listens; `config.ts`.
- `shared/types.ts` the data model; `shared/address.ts` where a link goes (both sides use it).
- `web/src/components/Launchpad.tsx` the page + drag and drop; `Tiles.tsx`; `LinkDialog.tsx`;
  `settings/` the Settings sections.

## Rules that exist for a reason
1. **Matt's chosen design is "A · Launchpad"** (mockups artifact G2Bgrb2zpjvqoYZgAkqPeL): tiles in
   a grid, the main page's links first, then one section per top-level directory; a directory
   inside a directory is a tile. Figtree, blue accent, 14px tile corners. Keep it.
2. **It is a launcher, not a proxy.** Links open the apps on their own ports. Never route
   traffic through App Router, and never require a change to the other apps. Each app keeping
   its own login is intentional (Matt: access to App Router is not access to the apps).
3. **A link is either "on this computer" (port + optional path) or "elsewhere" (full address +
   optional port).** A local link opens on `window.location.hostname`, so it works from
   localhost, the LAN address and the Tailscale name. Do not store a host for local links.
4. **Health lights** (Matt agreed): any reply below HTTP 500 = online; yellow for
   `recoveredMinutes` after coming back; red after `failuresBeforeDown` failures; grey when
   off. Per link, plus a master switch. Lights differ in shape as well as colour.
5. **Settings Matt asked for**: `page.allowEditing` (off hides Add link / New directory AND the
   server refuses every change to links and directories — the `editing` guard in `app.ts`),
   `page.rootName` (the "Apps" heading), `page.showSearch`, themes (light / dark / system /
   custom). Starts EMPTY: never seed links.
6. **Login like my_business_manager**: `.password` = `{users: [{loginName, passwordHash}]}`
   bcrypt 0600; several users, one shared page, everyone an admin; 8+ characters; an eye button
   on every password box; deleting the file asks for a new first login and touches nothing
   else. Turning the login on creates the first user in the same step; off needs DISABLE.
   Network access is a separate switch (warn when it is on with the login off).
7. **Port 80 is the default and must work without sudo.** macOS allows that only on every
   address, so with network access off `security.listen` binds 0.0.0.0 and drops non-loopback
   connections. Do not "simplify" this to 127.0.0.1.
8. **Every config key is in `config.json` AND in Settings**, marked Applies immediately /
   Needs restart. New key checklist in `Docs/DEVELOPMENT.md`.
9. **The click after a drop must be cancelled on the document** (`dragGuard` in `Tiles.tsx`):
   dnd-kit only stops it spreading, and the browser would still open the link.
10. **Docs**: detail goes in `Docs/`; `README.md` stays high-level and links there (Matt's rule).
11. **Testing**: `npm test`. Test by hand on a scratch config (`AR_CONFIG=…`, another port),
    never on Matt's `config.json` / `data/`. **Never start the server without `AR_CONFIG`**: it
    falls back to the repo's own config.json, and with none there to the defaults — port 80
    (a test once left a server on port 80 this way; `ROUTER.sh` now passes `AR_CONFIG` itself).
    `test/scripts.test.ts` runs the scripts against a stand-in `launchctl` and a scratch HOME. Headless-Chrome checks: Radix menus open on
    pointerdown; a drag needs real mouse events; a link opened in a new tab stalls the driver.
12. **Things a review found that must stay fixed**: sessions end on the server (`at` + `sid` in
    the cookie; sign-out revokes); changing `security.passwordFile` MOVES the file; the Host
    check uses `allowNetwork` as it was at start; `res.sendFile` is always called with `root`
    (a dot-folder in the path otherwise breaks it); `Service.repair()` makes hand-edited data
    whole on load; a Settings box resets only when ITS saved value changes; a link is never
    health-checked twice at once; `ROUTER.sh` trusts a pid only if that process is App Router.
13. **Commits**: one per feature with a dated CHANGELOG entry; explicit `git add <paths>`;
    never push — Matt pushes.
