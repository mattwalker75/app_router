/**
 * Health checks: is each link answering?
 *
 * The server asks every link that has checks turned on for its page (or for
 * its own check address, e.g. /api/health) on a timer, and remembers:
 *
 *   green  "online"     it answered;
 *   yellow "recovered"  it answers again, but was down within the last
 *                       health.recoveredMinutes;
 *   red    "down"       it did not answer health.failuresBeforeDown times in a row;
 *   grey   "unchecked"  checks are off for this link, or for everything;
 *   grey   "pending"    on, but there is no verdict yet.
 *
 * "Answered" means any reply below HTTP 500 — a sign-in page (401) or a
 * redirect is an app that is up. Nothing is kept between restarts; the first
 * round runs a moment after start.
 *
 * A check only records whether and how fast something answered. It never
 * follows redirects, sends cookies, or keeps what came back. Certificates are
 * not verified: an app on your own network with a self-made certificate is
 * still "up".
 */
import http from "node:http";
import https from "node:https";
import { checkUrl } from "../../shared/address.js";
import type { Link, LinkStatus, StatusReport } from "../../shared/types.js";
import type { Config } from "./config.js";
import type { Service } from "./service.js";

export interface ProbeResult { up: boolean; ms: number | null; detail: string }

const REASONS: Record<string, string> = {
  ECONNREFUSED: "No answer — nothing is listening there",
  ENOTFOUND: "No answer — that name could not be found",
  EAI_AGAIN: "No answer — that name could not be looked up",
  EHOSTUNREACH: "No answer — that computer can't be reached",
  ENETUNREACH: "No answer — that network can't be reached",
  ECONNRESET: "No answer — the connection was dropped",
  EHOSTDOWN: "No answer — that computer is off or asleep",
  ETIMEDOUT: "No answer — it took too long",
};

/** Ask `url` once. Resolves; never throws. */
export function probe(url: string, timeoutMs: number): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let u: URL;
    try { u = new URL(url); } catch { resolve({ up: false, ms: null, detail: "The address is not valid" }); return; }
    const started = Date.now();
    let done = false;
    const finish = (r: ProbeResult) => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, { method: "GET", headers: { "user-agent": "app-router-health-check", accept: "*/*" }, agent: false,
      ...(u.protocol === "https:" ? { rejectUnauthorized: false } : {}) }, (res) => {
      const ms = Date.now() - started, code = res.statusCode || 0;
      res.destroy();
      finish(code < 500 ? { up: true, ms, detail: `Answered in ${ms} ms` } : { up: false, ms, detail: `Answered with an error (HTTP ${code})` });
    });
    const timer = setTimeout(() => { req.destroy(); finish({ up: false, ms: null, detail: `No answer within ${Math.round(timeoutMs / 1000)} seconds` }); }, timeoutMs);
    req.on("error", (e: NodeJS.ErrnoException & { errors?: NodeJS.ErrnoException[] }) => {
      const code = e.code || e.errors?.[0]?.code || "";
      finish({ up: false, ms: null, detail: REASONS[code] || `No answer (${e.message || code || "unknown reason"})` });
    });
    req.end();
  });
}

interface Tracked {
  /** the verdict: null until there is one */
  up: boolean | null;
  /** when the verdict last changed */
  since: number | null;
  /** when it last came back from being down */
  recoveredAt: number | null;
  failures: number;
  checkedAt: number | null;
  ms: number | null;
  detail: string;
  /** the address that was checked — a changed address starts from scratch */
  url: string;
}

const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());

export class HealthChecker {
  private tracked = new Map<string, Tracked>();
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  /** links being asked right now — a link is never asked twice at once, so one moment of trouble counts as one failed check */
  private inFlight = new Set<string>();
  private lastRun: number | null = null;
  private stopped = true;

  constructor(private readonly config: Config, private readonly service: Service,
    private readonly opts: { now?: () => number; probe?: typeof probe } = {}) {
    service.onChange(() => this.linksChanged());
  }

  private now(): number { return this.opts.now ? this.opts.now() : Date.now(); }
  private settings() {
    const h = this.config.get().health;
    const n = (v: unknown, min: number, max: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(Math.max(x, min), max) : d; };
    return { enabled: h.enabled !== false, interval: n(h.intervalSeconds, 5, 3600, 30) * 1000, timeout: n(h.timeoutSeconds, 1, 60, 5) * 1000,
      recovered: n(h.recoveredMinutes, 0, 1440, 10) * 60_000, failures: Math.round(n(h.failuresBeforeDown, 1, 10, 2)) };
  }
  private wanted(): Link[] { return this.settings().enabled ? this.service.page().links.filter((l) => l.health?.enabled) : []; }

  /** Begin checking on the timer. The first round starts right away. */
  start(): void {
    this.stopped = false;
    this.schedule(0);
  }
  stop(): void { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.timer = null; }
  /** A health setting was saved: run a round now (so a switched-on page is not "Checking…" for a whole interval) and time the next one by the new interval. */
  settingsChanged(): void { if (!this.stopped) this.schedule(0); }
  private schedule(ms: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.checkAll().finally(() => this.schedule(this.settings().interval)); }, ms);
    this.timer.unref?.();
  }

  /** A link was added, changed or removed: forget the gone ones, and check new or changed ones now. */
  private linksChanged(): void {
    const links = this.wanted();
    const ids = new Set(links.map((l) => l.id));
    for (const id of this.tracked.keys()) if (!ids.has(id)) this.tracked.delete(id);
    if (this.stopped) return;
    const fresh = links.filter((l) => this.tracked.get(l.id)?.url !== checkUrl(l));
    if (fresh.length) void Promise.all(fresh.map((l) => this.checkOne(l)));
  }

  /** Check every link that has checks on. Runs one round at a time. */
  checkAll(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      const links = this.wanted();
      const ids = new Set(links.map((l) => l.id));
      for (const id of this.tracked.keys()) if (!ids.has(id)) this.tracked.delete(id);
      const queue = [...links];
      const worker = async () => { for (let l = queue.shift(); l; l = queue.shift()) await this.checkOne(l); };
      await Promise.all(Array.from({ length: Math.min(8, queue.length) }, worker));
      this.lastRun = this.now();
    })().finally(() => { this.running = null; });
    return this.running;
  }

  private async checkOne(link: Link): Promise<void> {
    if (this.inFlight.has(link.id)) return;
    this.inFlight.add(link.id);
    try { await this.ask(link); } finally { this.inFlight.delete(link.id); }
  }

  private async ask(link: Link): Promise<void> {
    const s = this.settings();
    const url = checkUrl(link);
    let t = this.tracked.get(link.id);
    if (!t || t.url !== url) { t = { up: null, since: null, recoveredAt: null, failures: 0, checkedAt: null, ms: null, detail: "", url }; this.tracked.set(link.id, t); }
    const r = await (this.opts.probe || probe)(url, s.timeout);
    if (this.tracked.get(link.id) !== t) return; // removed or changed while the check was out
    const at = this.now();
    t.checkedAt = at; t.ms = r.ms; t.detail = r.detail;
    if (r.up) {
      if (t.up === false) t.recoveredAt = at;
      if (t.up !== true) { t.up = true; t.since = at; }
      t.failures = 0;
    } else {
      t.failures++;
      if (t.up !== false && t.failures >= s.failures) { t.up = false; t.since = at; t.recoveredAt = null; }
    }
  }

  statusOf(link: Link): LinkStatus {
    const s = this.settings();
    if (!s.enabled) return { light: "unchecked", since: null, checkedAt: null, ms: null, detail: "Health checks are turned off in Settings" };
    if (!link.health?.enabled) return { light: "unchecked", since: null, checkedAt: null, ms: null, detail: "Health checks are off for this link" };
    const t = this.tracked.get(link.id);
    if (!t || t.up === null) return { light: "pending", since: null, checkedAt: iso(t?.checkedAt ?? null), ms: null, detail: t?.detail || "Not checked yet" };
    if (!t.up) return { light: "down", since: iso(t.since), checkedAt: iso(t.checkedAt), ms: t.ms, detail: t.detail };
    // answering now; a single missed check does not turn it red, but say so
    const detail = t.failures ? `${t.detail} (the last check; it answered before)` : t.detail;
    const recovered = t.recoveredAt !== null && this.now() - t.recoveredAt < s.recovered;
    return { light: recovered ? "recovered" : "online", since: iso(recovered ? t.recoveredAt : t.since), checkedAt: iso(t.checkedAt), ms: t.ms, detail };
  }

  report(): StatusReport {
    const s = this.settings();
    const links: Record<string, LinkStatus> = {};
    for (const l of this.service.page().links) links[l.id] = this.statusOf(l);
    return { enabled: s.enabled, checkedAt: iso(this.lastRun), intervalSeconds: s.interval / 1000, links };
  }
}
