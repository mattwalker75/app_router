/**
 * Where a link goes, worked out the same way by the server (for health
 * checks) and by the page (for the tile's address).
 */
import type { Link } from "./types.js";

type Addr = Pick<Link, "local" | "scheme" | "port" | "path" | "url">;

const bracket = (host: string) => (host.includes(":") && !host.startsWith("[") ? `[${host}]` : host);

/** A link to an app on the same computer, opened through `hostname` — whatever name the browser used to reach App Router. */
export function localHref(link: Addr, hostname: string): string {
  const standard = link.scheme === "https" ? 443 : 80;
  return `${link.scheme}://${bracket(hostname)}${link.port && link.port !== standard ? `:${link.port}` : ""}${link.path || "/"}`;
}

/**
 * A link somewhere else: its address, with the optional port put in. Only http and https
 * ever come out of here — the server refuses anything else when a link is saved, and this
 * is the second lock for a links file edited by hand ("javascript:…" must never become a
 * tile you can click).
 */
export function remoteHref(link: Addr): string {
  try {
    const u = new URL(link.url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "about:blank";
    if (link.port) u.port = String(link.port);
    return u.href;
  } catch { return "about:blank"; }
}

/**
 * Add the missing http:// or https:// to an address typed without one: things on a home
 * network ("192.168.1.1", "nas.local", "printer") get http, everything else https.
 */
export function withScheme(raw: string): string {
  const s = raw.trim();
  if (!s || /^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  const host = s.split(/[/?#]/)[0].replace(/:\d+$/, "").toLowerCase();
  const homeNetwork = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith(".local") || host.endsWith(".lan") || !host.includes(".") || host === "localhost";
  return `${homeNetwork ? "http" : "https"}://${s}`;
}

export const linkHref = (link: Addr, hostname: string) => (link.local ? localHref(link, hostname) : remoteHref(link));

/** The short address under a tile's name: "Port 3030 on mac-mini", "nas.local:5001", "pihole.local/admin". */
export function displayAddress(link: Addr, computerName: string): string {
  if (link.local) return `Port ${link.port} on ${computerName}${link.path && link.path !== "/" ? ` · ${link.path}` : ""}`;
  try {
    const href = remoteHref(link);
    if (href === "about:blank") return link.url || "no address";
    const u = new URL(href);
    const rest = (u.pathname === "/" ? "" : u.pathname) + u.search;
    return u.host + (rest.length > 28 ? rest.slice(0, 27) + "…" : rest);
  } catch { return link.url; }
}

/** What the health check asks for: the link itself, or its own check address when one is set. */
export function checkUrl(link: Addr & Pick<Link, "health">): string {
  const own = (link.health?.path || "").trim();
  if (/^https?:\/\//i.test(own)) return own;
  // the server checks an app on its own computer through "localhost"
  const base = link.local ? localHref(link, "localhost") : remoteHref(link);
  if (!own) return base;
  try { return new URL(own, base).href; } catch { return base; }
}
