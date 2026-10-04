/**
 * The HTTP app: security middleware, the optional login, every /api route,
 * the link pictures, and the built page. `createApp` is used by index.ts and
 * by the tests (which run it on a spare port against scratch data).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieSession from "cookie-session";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { Auth } from "./auth.js";
import { Config, ConfigError, ROOT } from "./config.js";
import { HealthChecker } from "./health.js";
import { hostGuard, networkUrls, sameOriginWrites, shortHostname, type Listening } from "./security.js";
import { Service } from "./service.js";
import { Users } from "./users.js";
import { stamp, UserError } from "./util.js";

export const VERSION: string = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

type Handler = (req: Request, res: Response) => unknown;
/** Wrap a route so a thrown UserError becomes { error } with its status, and anything else a logged 500. */
const h = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try { const out = await fn(req, res); if (!res.headersSent) res.json(out ?? { ok: true }); } catch (e) { next(e); }
};
const param = (req: Request, k: string) => String(req.params[k]);

export interface AppHandle {
  app: express.Express; service: Service; auth: Auth; users: Users; health: HealthChecker; config: Config;
  /** filled in by whoever starts listening, so Settings can say how the page is reachable */
  listening: Listening | null;
}

export function createApp(config = new Config(), opts: { rateLimit?: boolean } = {}): AppHandle {
  const service = new Service(config);
  const auth = new Auth(config);
  const users = new Users(config, auth);
  const health = new HealthChecker(config, service);
  const app = express();
  const handle: AppHandle = { app, service, auth, users, health, config, listening: null };
  app.disable("x-powered-by");
  app.set("etag", false);

  app.use(hostGuard(config));
  app.use(helmet({
    contentSecurityPolicy: { useDefaults: true, directives: {
      "default-src": ["'self'"], "img-src": ["'self'", "data:", "blob:"], "style-src": ["'self'", "'unsafe-inline'"],
      "font-src": ["'self'", "data:"], "connect-src": ["'self'"], "script-src": ["'self'"], "upgrade-insecure-requests": null,
      "form-action": ["'self'"],
    } },
    strictTransportSecurity: false, // plain http on a home network must keep working
    crossOriginOpenerPolicy: false, // links open other apps in new tabs
  }));
  app.use(express.json({ limit: "5mb" }));
  app.use(cookieSession({ name: "ar_session", keys: [crypto.randomBytes(32).toString("hex")], httpOnly: true, sameSite: "strict",
    maxAge: Math.max(1, config.get().security.sessionHours) * 3600_000 }));
  app.use(sameOriginWrites);

  const limiter = opts.rateLimit === false ? (_r: Request, _s: Response, n: NextFunction) => n()
    : rateLimit({ windowMs: 5 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts. Wait five minutes and try again." } });

  // ---------------------------------------------------------------- open routes
  app.get("/api/health", (_req, res) => { res.json({ ok: true, app: "app-router", version: VERSION }); });
  app.get("/api/auth/me", h((req) => users.state(req)));
  // After the password file was deleted (or on a fresh copy with the login already on): create a login.
  app.post("/api/auth/setup", limiter, h(async (req) => {
    if (!auth.enabled()) throw new UserError("The login is turned off — turn it on in Settings → Access first.", 409);
    users.signIn(req, await auth.setup(req.body?.loginName, req.body?.password));
    return users.state(req);
  }));
  app.post("/api/auth/login", limiter, h(async (req) => {
    users.signIn(req, await auth.login(req.body?.loginName, req.body?.password));
    return users.state(req);
  }));
  app.post("/api/auth/logout", h((req) => { auth.revoke(req); req.session = null; return { ok: true }; }));

  // ---------------------------------------------------------------- everything else needs a login when the login is on
  app.use(["/api", "/icons"], (req, res, next) => {
    if (auth.allowed(req)) return next();
    res.status(401).json({ error: "Sign in first.", auth: users.state(req) });
  });

  // ---------------------------------------------------------------- login and users (every user may do all of this)
  app.post("/api/auth/enable", limiter, h(async (req) => { await users.enable(req, req.body?.loginName, req.body?.password); return users.state(req); }));
  app.post("/api/auth/disable", h((req) => { users.disable(req, req.body?.confirm); return users.state(req); }));
  app.post("/api/auth/password", limiter, h(async (req) => { await users.changeOwnPassword(req, req.body?.currentPassword, req.body?.newPassword); }));
  app.get("/api/users", h((req) => users.list(req)));
  app.post("/api/users", h((req) => users.add(req.body?.loginName, req.body?.password)));
  app.put("/api/users/:name/password", h(async (req) => { await users.resetPassword(req, param(req, "name"), req.body?.password); }));
  app.delete("/api/users/:name", h((req) => { users.remove(req, param(req, "name"), req.body?.confirm); }));

  app.get("/api/state", h((req) => {
    const c = config.get();
    return { version: VERSION, auth: users.state(req), config: c, restartRequired: config.restartRequired(), configFile: config.file,
      dataFile: service.dataFile(), iconsDir: service.iconsDir(), passwordFile: auth.file(), hostname: shortHostname(),
      listening: handle.listening, networkUrls: c.server.allowNetwork ? networkUrls(handle.listening?.port ?? c.server.port) : [] };
  }));

  // ---------------------------------------------------------------- the page: links, directories, status lights
  app.get("/api/page", h(() => service.page()));
  app.get("/api/status", h(() => health.report()));
  app.post("/api/status/check", h(async () => { await health.checkAll(); return health.report(); }));

  /** Settings → Page → "Allow changes to the page" off: nothing about links or directories can be changed. */
  const editing = (_req: Request, res: Response, next: NextFunction) => {
    if (config.get().page.allowEditing) return next();
    res.status(403).json({ error: "Changes to the page are turned off. Turn them on in Settings → Page." });
  };
  app.post("/api/links", editing, h((req) => service.createLink(req.body || {})));
  app.patch("/api/links/:id", editing, h((req) => service.updateLink(param(req, "id"), req.body || {})));
  app.delete("/api/links/:id", editing, h((req) => { service.deleteLink(param(req, "id")); }));
  app.post("/api/links/:id/move", editing, h((req) => service.moveLink(param(req, "id"), req.body || {})));
  app.post("/api/links/:id/icon", editing, express.raw({ type: () => true, limit: "2mb" }), h((req) => service.setIcon(param(req, "id"), req.body, req.headers["content-type"])));
  app.delete("/api/links/:id/icon", editing, h((req) => service.removeIcon(param(req, "id"))));

  app.post("/api/directories", editing, h((req) => service.createDirectory(req.body || {})));
  app.patch("/api/directories/:id", editing, h((req) => service.renameDirectory(param(req, "id"), req.body || {})));
  app.get("/api/directories/:id/contents", h((req) => service.contents(param(req, "id"))));
  app.delete("/api/directories/:id", editing, h((req) => service.deleteDirectory(param(req, "id"), req.body?.confirm)));
  app.post("/api/directories/:id/move", editing, h((req) => service.moveDirectory(param(req, "id"), req.body || {})));

  app.get("/icons/:name", (req, res) => {
    const f = service.iconFile(param(req, "name"));
    if (!f) { res.status(404).end(); return; }
    res.set("cache-control", "private, max-age=86400");
    // with `root`, only the file's own name is checked for a leading dot — not the folders above it
    res.sendFile(path.basename(f), { root: path.dirname(f) });
  });

  // ---------------------------------------------------------------- export / import
  app.get("/api/export/download", h((_req, res) => {
    res.set("content-disposition", `attachment; filename="app-router-links-${stamp()}.json"`);
    res.type("application/json").send(JSON.stringify(service.exportDocument(), null, 2));
  }));
  app.post("/api/import", editing, h((req) => {
    const mode = req.body?.mode === "add" ? "add" : "replace";
    if (mode === "replace" && req.body?.confirm !== "REPLACE") throw new UserError("Type REPLACE to confirm — this replaces every link and directory on the page.");
    return service.importDocument(req.body?.document, mode);
  }));

  // ---------------------------------------------------------------- settings
  app.get("/api/settings", h(() => ({ config: config.get(), restartRequired: config.restartRequired(), configFile: config.file })));
  app.put("/api/settings", h((req) => {
    const patch = settingsPatch(req.body) as { security?: { passwordFile?: string }; health?: unknown };
    // the users live in the password file: when its place changes, the file goes with it
    if (patch.security?.passwordFile !== undefined) auth.moveFile(config.resolve(patch.security.passwordFile));
    const r = config.update(patch);
    // new timing, or the master switch back on: start a round now instead of waiting out the old interval
    if (patch.health) health.settingsChanged();
    return { config: config.get(), restartRequired: r.restartRequired, restartNow: r.restartNow };
  }));

  app.use("/api", (_req, res) => { res.status(404).json({ error: "No such action." }); });

  // ---------------------------------------------------------------- the page itself
  const web = path.join(ROOT, "dist", "web");
  app.use(express.static(web, { index: false, maxAge: "1h", setHeaders: (res, f) => { if (f.endsWith(".html")) res.set("cache-control", "no-cache"); } }));
  app.get(/^\/(?!api\/|icons\/).*/, (_req, res) => {
    const index = path.join(web, "index.html");
    if (fs.existsSync(index)) { res.set("cache-control", "no-cache"); res.sendFile("index.html", { root: web }); }
    else res.status(503).type("text").send("The page is not built yet. Run ./INSTALL_APP.sh (or npm run build).");
  });

  // ---------------------------------------------------------------- errors
  app.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (e instanceof UserError) { res.status(e.status).json({ error: e.message, details: e.details }); return; }
    if (e instanceof ConfigError) { res.status(409).json({ error: `Nothing was saved: ${e.message}` }); return; }
    const err = e as { type?: string; message?: string };
    if (err.type === "entity.parse.failed") { res.status(400).json({ error: "The request was not valid JSON." }); return; }
    if (err.type === "entity.too.large") { res.status(413).json({ error: "That is too large to send. A picture can be up to 1 MB, an import file up to 5 MB." }); return; }
    console.error("[error]", e);
    res.status(500).json({ error: `Something went wrong: ${err.message || e}` });
  });

  return handle;
}

/** Only the settings a person may change, with types checked. The login switch has its own actions (/api/auth/enable, /disable). */
export function settingsPatch(body: unknown): Record<string, unknown> {
  const b = (body && typeof body === "object" && !Array.isArray(body) ? { ...body } : {}) as Record<string, Record<string, unknown>>;
  // each group must itself be a group of settings — {"server": "x"} is a mistake, said plainly
  for (const k of ["server", "security", "data", "page", "health", "appearance"]) {
    if (b[k] === undefined) continue;
    if (!b[k] || typeof b[k] !== "object" || Array.isArray(b[k])) throw new UserError(`“${k}” must be a group of settings, like {"${k}": { … }}.`);
  }
  const out: Record<string, unknown> = {};
  const num = (v: unknown, min: number, max: number, what: string) => {
    const n = Number(v);
    if (v === "" || v === null || !Number.isInteger(n) || n < min || n > max) throw new UserError(`${what} must be a whole number from ${min} to ${max}.`);
    return n;
  };
  const text = (v: unknown, what: string, max = 500) => {
    const s = String(v ?? "").trim();
    if (!s) throw new UserError(`${what} can't be empty.`);
    if (s.length > max) throw new UserError(`Keep ${what.toLowerCase()} under ${max} characters.`);
    return s;
  };
  if (b.server) {
    const s: Record<string, unknown> = {};
    if ("port" in b.server) s.port = num(b.server.port, 1, 65535, "The port");
    if ("allowNetwork" in b.server) s.allowNetwork = !!b.server.allowNetwork;
    if ("extraHosts" in b.server) {
      if (!Array.isArray(b.server.extraHosts)) throw new UserError("Other names must be a list.");
      // "https://Mini.tail1234.ts.net:8080/" → "mini.tail1234.ts.net"
      const names = (b.server.extraHosts as unknown[]).map((v) => String(v ?? "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/:].*$/, "")).filter(Boolean);
      for (const n of names) if (!/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(n)) throw new UserError(`“${n}” is not a name a computer can have. Use something like my-mac.tailnet.ts.net.`);
      if (names.length > 20) throw new UserError("Keep the list of other names to 20 or fewer.");
      s.extraHosts = [...new Set(names)];
    }
    out.server = s;
  }
  if (b.security) {
    if ("loginEnabled" in b.security) throw new UserError("Use “Turn the login on” or “Turn the login off” in Settings → Access.", 409);
    const s: Record<string, unknown> = {};
    if ("passwordFile" in b.security) s.passwordFile = text(b.security.passwordFile, "The password file");
    if ("sessionHours" in b.security) s.sessionHours = num(b.security.sessionHours, 1, 720, "Stay signed in (hours)");
    out.security = s;
  }
  if (b.data) {
    const s: Record<string, unknown> = {};
    if ("file" in b.data) s.file = text(b.data.file, "The links file");
    if ("iconsDir" in b.data) s.iconsDir = text(b.data.iconsDir, "The pictures folder");
    out.data = s;
  }
  if (b.page) {
    const s: Record<string, unknown> = {};
    if ("title" in b.page) s.title = text(b.page.title, "The title", 40);
    if ("rootName" in b.page) s.rootName = text(b.page.rootName, "The main page's name", 40);
    if ("allowEditing" in b.page) s.allowEditing = !!b.page.allowEditing;
    if ("showSearch" in b.page) s.showSearch = !!b.page.showSearch;
    out.page = s;
  }
  if (b.health) {
    const s: Record<string, unknown> = {};
    if ("enabled" in b.health) s.enabled = !!b.health.enabled;
    if ("intervalSeconds" in b.health) s.intervalSeconds = num(b.health.intervalSeconds, 5, 3600, "The time between checks (seconds)");
    if ("timeoutSeconds" in b.health) s.timeoutSeconds = num(b.health.timeoutSeconds, 1, 60, "The time to wait for an answer (seconds)");
    if ("recoveredMinutes" in b.health) s.recoveredMinutes = num(b.health.recoveredMinutes, 0, 1440, "The yellow time (minutes)");
    if ("failuresBeforeDown" in b.health) s.failuresBeforeDown = num(b.health.failuresBeforeDown, 1, 10, "Failed checks before red");
    out.health = s;
  }
  if (b.appearance) {
    const s: Record<string, unknown> = {};
    if ("theme" in b.appearance) s.theme = text(b.appearance.theme, "The theme", 120);
    if ("customThemes" in b.appearance) {
      const list = b.appearance.customThemes;
      if (!Array.isArray(list) || list.length > 30) throw new UserError("Custom themes must be a list of 30 or fewer.");
      s.customThemes = list.map((t) => {
        const x = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
        const tokens: Record<string, string> = {};
        for (const [k, v] of Object.entries((x.tokens && typeof x.tokens === "object" ? x.tokens : {}) as Record<string, unknown>))
          if (/^[a-z0-9-]{1,30}$/.test(k) && /^#[0-9a-f]{6}$/i.test(String(v))) tokens[k] = String(v).toLowerCase();
        return { id: text(x.id, "A theme's id", 120), name: text(x.name, "A theme's name", 40), dark: !!x.dark, tokens };
      });
    }
    out.appearance = s;
  }
  return out;
}
