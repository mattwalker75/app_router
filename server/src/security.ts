/**
 * Guards that matter even on a home network, and how the server listens:
 *
 *  1. Host check — the browser must be talking to this computer by a name it
 *     really has (localhost, 127.0.0.1, and with network access on, this
 *     computer's own addresses and hostname — plus any extra names listed in
 *     Settings, e.g. a Tailscale name). Stops "DNS rebinding", where a
 *     web page you visit points a name of its own at your computer.
 *  2. Same-origin writes — a change (POST/PUT/PATCH/DELETE) must come from a
 *     page this app served. Stops another web site from submitting forms to
 *     it in the background.
 *  3. Local only — with network access off the server listens on 127.0.0.1.
 *     macOS does not let a normal user do that on a port below 1024 (port 80
 *     is the default here), only on every address at once. So in that case
 *     the server listens on every address and drops any connection that does
 *     not come from this computer itself, before a single byte is read.
 */
import net from "node:net";
import os from "node:os";
import type http from "node:http";
import type { NextFunction, Request, Response } from "express";
import type { Config } from "./config.js";

function localNames(allowNetwork: boolean): Set<string> {
  const names = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (allowNetwork) {
    const host = os.hostname().toLowerCase();
    names.add(host); names.add(host.replace(/\.local$/, "")); names.add(host.endsWith(".local") ? host : `${host}.local`);
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) names.add(a.family === "IPv6" ? `[${a.address}]` : a.address);
  }
  return names;
}

const hostOnly = (h: string) => (h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0]).toLowerCase();

export function hostGuard(config: Config) {
  // the interface list can change (Wi-Fi reconnects) — refresh it now and then
  let names = localNames(config.get().server.allowNetwork); let at = Date.now();
  return (req: Request, res: Response, next: NextFunction) => {
    if (Date.now() - at > 30_000) { names = localNames(config.get().server.allowNetwork); at = Date.now(); }
    const host = hostOnly(String(req.headers.host || ""));
    // extra names (Settings → Access) apply at once and whether or not network access is on:
    // a VPN that forwards to this computer arrives on localhost but carries the VPN's name
    const extra = (config.get().server.extraHosts || []).some((h) => h.toLowerCase() === host);
    if (!names.has(host) && !extra) { res.status(421).json({ error: "This address is not one this computer answers to. Add the name in Settings → Access → Other names for this computer." }); return; }
    next();
  };
}

export function sameOriginWrites(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") { res.status(403).json({ error: "Changes must come from the App Router page itself." }); return; }
  const origin = req.headers.origin;
  if (origin) {
    let o: string; try { o = new URL(origin).host.toLowerCase(); } catch { o = ""; }
    if (o !== String(req.headers.host || "").toLowerCase()) { res.status(403).json({ error: "Changes must come from the App Router page itself." }); return; }
  }
  next();
}

/** "http://host" for port 80, "http://host:8080" otherwise. */
export const urlFor = (host: string, port: number) => `http://${host}${port === 80 ? "" : `:${port}`}`;

/** Addresses other devices can use, for the startup message and Settings. */
export function networkUrls(port: number): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === "IPv4" && !a.internal) out.push(urlFor(a.address, port));
  const host = os.hostname();
  out.push(urlFor(host.endsWith(".local") ? host : host + ".local", port));
  return out;
}

/** This computer's short name, for the chip next to the title ("mac-mini"). */
export const shortHostname = () => os.hostname().replace(/\.local$/i, "").replace(/\..*$/, "") || "this computer";

export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const a = address.startsWith("::ffff:") ? address.slice(7) : address;
  return a === "::1" || (net.isIPv4(a) && a.startsWith("127."));
}

export interface Listening {
  port: number;
  /** the address the server is bound to */
  host: string;
  /** true = bound to every address, but only this computer's own connections are accepted */
  localOnlyFilter: boolean;
}

/**
 * Start listening. Network access on → every address. Off → 127.0.0.1; and where the
 * system refuses that for a low port (EACCES), every address with the local-only filter.
 * `forceFilter` is for the tests, which cannot open port 80.
 */
export function listen(server: http.Server, port: number, allowNetwork: boolean, opts: { forceFilter?: boolean } = {}): Promise<Listening> {
  const bind = (host: string) => new Promise<number>((resolve, reject) => {
    const onError = (e: Error) => reject(e);
    server.once("error", onError);
    server.listen(port, host, () => { server.off("error", onError); resolve((server.address() as net.AddressInfo).port); });
  });
  const filtered = async (): Promise<Listening> => {
    server.on("connection", (socket) => { if (!isLoopback(socket.remoteAddress)) socket.destroy(); });
    return { port: await bind("0.0.0.0"), host: "0.0.0.0", localOnlyFilter: true };
  };
  if (allowNetwork) return bind("0.0.0.0").then((p) => ({ port: p, host: "0.0.0.0", localOnlyFilter: false }));
  if (opts.forceFilter) return filtered();
  return bind("127.0.0.1").then(
    (p) => ({ port: p, host: "127.0.0.1", localOnlyFilter: false }),
    (e: NodeJS.ErrnoException) => { if (e.code === "EACCES") return filtered(); throw e; },
  );
}
