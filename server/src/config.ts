/**
 * config.json — every setting the app has. Settings in the page reads and
 * writes this same file, so editing it by hand and editing it in the app are
 * the same thing. Missing keys fall back to DEFAULTS (a deep merge), unknown
 * keys (including "_comment" notes) are kept, and the file is written
 * atomically with owner-only permissions.
 *
 * Paths inside it are relative to the folder config.json lives in.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CustomTheme {
  id: string;
  name: string;
  dark: boolean;
  tokens: Record<string, string>;
}

export interface AppConfig {
  /** extraHosts: other names this computer is reached by (a VPN or Tailscale name) that the app should answer to */
  server: { port: number; allowNetwork: boolean; extraHosts: string[] };
  security: { loginEnabled: boolean; passwordFile: string; sessionHours: number };
  data: { file: string; iconsDir: string };
  page: {
    /** the name in the header and the browser tab */
    title: string;
    /** the heading over the links that sit on the main page */
    rootName: string;
    /** false hides Add link / New directory and refuses every change to links and directories */
    allowEditing: boolean;
    showSearch: boolean;
  };
  health: {
    /** the master switch: false = no link is checked, every light is grey */
    enabled: boolean;
    intervalSeconds: number;
    timeoutSeconds: number;
    /** how long a link stays yellow ("just back") after it answers again */
    recoveredMinutes: number;
    /** this many checks in a row must fail before a link turns red */
    failuresBeforeDown: number;
  };
  appearance: { theme: string; customThemes: CustomTheme[] };
}

export const DEFAULTS: AppConfig = {
  server: { port: 80, allowNetwork: false, extraHosts: [] },
  security: { loginEnabled: false, passwordFile: "./.password", sessionHours: 12 },
  data: { file: "./data/links.json", iconsDir: "./data/icons" },
  page: { title: "App Router", rootName: "Apps", allowEditing: true, showSearch: true },
  health: { enabled: true, intervalSeconds: 30, timeoutSeconds: 5, recoveredMinutes: 10, failuresBeforeDown: 2 },
  appearance: { theme: "system", customThemes: [] },
};

/** Settings that only take effect after ./ROUTER.sh --restart. */
export const RESTART_REQUIRED = ["server.port", "server.allowNetwork", "security.sessionHours", "data.file", "data.iconsDir"];

/** The repository folder: the nearest parent holding this app's package.json. */
function findRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try { if (JSON.parse(fs.readFileSync(pkg, "utf8")).name === "app-router") return dir; } catch {}
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}
export const ROOT = findRoot();

/** config.json could not be read when a setting was being saved — nothing was changed. */
export class ConfigError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

export function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : over) as T;
  const out: Obj = { ...(base as Obj) };
  for (const [k, v] of Object.entries(over)) out[k] = k in out ? deepMerge(out[k], v) : v;
  return out as T;
}

/**
 * config.json is edited by hand too. A value of the wrong kind — "extraHosts": "mac.ts.net"
 * where a list belongs, "server": null — must not take the app down: that key goes back to
 * its default, and everything else in the file is kept. Keys the app does not know (notes
 * starting with _, say) are left alone.
 */
export function conform<T>(defaults: T, value: unknown): T {
  if (Array.isArray(defaults)) {
    if (!Array.isArray(value)) return defaults;
    // a list of names holds only text; a list of themes holds only groups
    const kind = defaults.length ? typeof defaults[0] : null;
    return value.filter((x) => (kind ? typeof x === kind : typeof x === "string" || isObj(x))) as T;
  }
  if (isObj(defaults)) {
    if (!isObj(value)) return defaults;
    const out: Obj = { ...value };
    for (const [k, d] of Object.entries(defaults)) out[k] = conform(d, value[k]);
    return out as T;
  }
  if (typeof defaults === "number") return (typeof value === "number" && Number.isFinite(value) ? value : defaults) as T;
  return (typeof value === typeof defaults ? value : defaults) as T;
}

function getPath(o: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((a, k) => (isObj(a) ? a[k] : undefined), o);
}

export class Config {
  readonly file: string;
  private data: AppConfig = structuredClone(DEFAULTS);
  /** keys changed since the server started that need a restart */
  private pending = new Set<string>();
  private readonly startedWith: AppConfig;

  constructor(file = process.env.AR_CONFIG || path.join(ROOT, "config.json")) {
    this.file = path.resolve(file);
    this.load();
    this.startedWith = structuredClone(this.data);
  }

  get dir(): string { return path.dirname(this.file); }
  get(): AppConfig { return this.data; }

  /** Resolve a path setting against the config file's folder (~ = home). */
  resolve(p: string): string {
    if (p.startsWith("~")) p = path.join(process.env.HOME || "", p.slice(1));
    return path.resolve(this.dir, p);
  }

  load(): void {
    let raw: unknown = {};
    if (fs.existsSync(this.file)) {
      try { raw = JSON.parse(fs.readFileSync(this.file, "utf8")); }
      catch (e) { throw new Error(`config.json is not valid JSON (${(e as Error).message}). Fix it or delete it to start from the defaults.`); }
    }
    this.data = conform(DEFAULTS, deepMerge(structuredClone(DEFAULTS), raw));
    // a list of themes: only the ones that are whole
    this.data.appearance.customThemes = this.data.appearance.customThemes.filter((t) => isObj(t) && typeof t.id === "string" && typeof t.name === "string" && isObj(t.tokens));
  }

  save(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    try { fs.chmodSync(this.file, 0o600); } catch {}
  }

  /**
   * Merge a partial change in and save. The file is read again first, so something you typed
   * into config.json by hand while the app was running is kept, not written over.
   * restartRequired = every key waiting for a restart; restartNow = those among them that
   * THIS change touched (what the "restart to apply" message is about).
   */
  update(patch: unknown): { restartRequired: string[]; restartNow: string[] } {
    const before = this.data;
    try { this.load(); } catch (e) { this.data = before; throw new ConfigError((e as Error).message); }
    const was = structuredClone(this.data);
    this.data = deepMerge(this.data, structuredClone(patch));
    this.save();
    const restartNow: string[] = [];
    for (const k of RESTART_REQUIRED) {
      const now = JSON.stringify(getPath(this.data, k));
      if (now !== JSON.stringify(getPath(this.startedWith, k))) this.pending.add(k); else this.pending.delete(k);
      if (now !== JSON.stringify(getPath(was, k)) && this.pending.has(k)) restartNow.push(k);
    }
    return { restartRequired: [...this.pending], restartNow };
  }

  restartRequired(): string[] { return [...this.pending]; }
}
