import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { Config } from "../server/src/config.js";
import { createApp, type AppHandle } from "../server/src/app.js";

export function scratchDir(label = "ar-test"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
}

/** A config.json in a scratch folder, with every path inside that folder. */
export function scratchConfig(dir: string, over: Record<string, unknown> = {}): Config {
  const file = path.join(dir, "config.json");
  const base: Record<string, unknown> = {
    server: { port: 0, allowNetwork: false },
    security: { loginEnabled: false, passwordFile: "./.password", sessionHours: 1 },
    data: { file: "./data/links.json", iconsDir: "./data/icons" },
    health: { enabled: true, intervalSeconds: 5, timeoutSeconds: 1, recoveredMinutes: 10, failuresBeforeDown: 2 },
  };
  for (const [k, v] of Object.entries(over)) base[k] = { ...(base[k] as object), ...(v as object) };
  fs.writeFileSync(file, JSON.stringify(base, null, 2));
  return new Config(file);
}

export interface Running extends AppHandle { base: string; dir: string; close(): Promise<void>; call: Caller }
export type Caller = ((method: string, url: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; json: any; headers: Headers }>)
  /** the cookies this "browser" holds */
  & { cookie(): string };

/** Run the real app on a spare port against scratch data. The health timer is NOT started; tests call health.checkAll(). */
export async function startServer(over: Record<string, unknown> = {}): Promise<Running> {
  const dir = scratchDir();
  const config = scratchConfig(dir, over);
  const handle = createApp(config, { rateLimit: false });
  const server = await new Promise<http.Server>((res) => { const s = handle.app.listen(0, "127.0.0.1", () => res(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = cookieClient(base);
  return { ...handle, base, dir, call, close: async () => { handle.health.stop(); server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/** A tiny browser: keeps its own cookies, sends JSON. */
export function cookieClient(base: string): Caller {
  let cookie = "";
  return Object.assign(async (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
    const isBuf = Buffer.isBuffer(body);
    const r = await fetch(base + url, {
      method, headers: { ...(body !== undefined && !isBuf ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : isBuf ? (body as unknown as BodyInit) : JSON.stringify(body),
    });
    const set = r.headers.getSetCookie?.() || [];
    if (set.length) {
      const jar = new Map(cookie.split("; ").filter(Boolean).map((c) => [c.split("=")[0], c]));
      for (const c of set) { const kv = c.split(";")[0]; jar.set(kv.split("=")[0], kv); }
      cookie = [...jar.values()].filter((c) => c.slice(c.indexOf("=") + 1) !== "").join("; ");
    }
    const text = await r.text();
    let json: unknown = text; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, headers: r.headers };
  }, { cookie: () => cookie });
}

/** A small valid PNG (solid colour), for picture uploads. */
export function tinyPng(): Buffer {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNk+M8ABIwMDAz/GRgYAAANIgH/8m2TSgAAAABJRU5ErkJggg==", "base64");
}

export interface FakeApp { port: number; url: string; hits: string[]; mode: { status: number; hang: boolean }; close(): Promise<void> }
/** A stand-in for one of your apps: answers every request with `mode.status`, or never answers when `mode.hang`. */
export async function fakeApp(status = 200): Promise<FakeApp> {
  const mode = { status, hang: false };
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    if (mode.hang) return; // leave the request open: a check must time out
    res.writeHead(mode.status, { "content-type": "text/plain" }); res.end("hello");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return { port, url: `http://127.0.0.1:${port}`, hits, mode, close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }) };
}

/** A port nothing is listening on. */
export async function deadPort(): Promise<number> {
  const s = http.createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as AddressInfo).port;
  await new Promise((r) => s.close(r));
  return port;
}
