/** The HTTP routes, against the real app on a spare port with scratch data. */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeApp, startServer, tinyPng, type Running } from "./helpers.js";

let s: Running;
beforeEach(async () => { s = await startServer(); });
afterEach(async () => { await s.close(); });

describe("the page", () => {
  it("starts empty", async () => {
    expect((await s.call("GET", "/api/page")).json).toEqual({ directories: [], links: [] });
    expect((await s.call("GET", "/api/health")).json).toMatchObject({ ok: true, app: "app-router" });
  });
  it("links and directories: add, change, move, delete", async () => {
    const dir = (await s.call("POST", "/api/directories", { name: "Home lab" })).json;
    const a = (await s.call("POST", "/api/links", { name: "MBM", port: 3030 })).json;
    const b = (await s.call("POST", "/api/links", { name: "NAS", local: false, url: "nas.local", directoryId: dir.id })).json;
    expect(a).toMatchObject({ name: "MBM", local: true, port: 3030 }); expect(b.url).toBe("http://nas.local");
    expect((await s.call("PATCH", `/api/links/${a.id}`, { description: "Ledger" })).json.description).toBe("Ledger");
    expect((await s.call("POST", `/api/links/${a.id}/move`, { directoryId: dir.id, index: 0 })).status).toBe(200);
    expect((await s.call("PATCH", `/api/directories/${dir.id}`, { name: "Lab" })).json.name).toBe("Lab");
    const page = (await s.call("GET", "/api/page")).json;
    expect(page.links.map((l: any) => [l.name, l.directoryId, l.position])).toEqual([["MBM", dir.id, 0], ["NAS", dir.id, 1]]);
    expect((await s.call("GET", `/api/directories/${dir.id}/contents`)).json).toEqual({ directories: 0, links: 2 });
    const refused = await s.call("DELETE", `/api/directories/${dir.id}`);
    expect(refused.status).toBe(409); expect(refused.json.error).toMatch(/Type DELETE/); expect(refused.json.details).toEqual({ directories: 0, links: 2 });
    expect((await s.call("DELETE", `/api/links/${b.id}`)).status).toBe(200);
    expect((await s.call("DELETE", `/api/directories/${dir.id}`, { confirm: "DELETE" })).json).toEqual({ directories: 0, links: 1 });
    expect((await s.call("GET", "/api/page")).json).toEqual({ directories: [], links: [] });
  });
  it("mistakes come back as plain sentences", async () => {
    expect((await s.call("POST", "/api/links", { name: "x" })).json.error).toMatch(/Enter the port/);
    expect((await s.call("POST", "/api/links", { name: "", port: 1 })).status).toBe(400);
    expect((await s.call("PATCH", "/api/links/nope", { name: "x" })).status).toBe(404);
    expect((await s.call("GET", "/api/nothing-here")).json).toEqual({ error: "No such action." });
    const r = await fetch(s.base + "/api/links", { method: "POST", headers: { "content-type": "application/json" }, body: "{ not json" });
    expect(r.status).toBe(400); expect((await r.json()).error).toBe("The request was not valid JSON.");
  });
});

describe("pictures", () => {
  it("upload, show, replace by removing — and only real pictures", async () => {
    const l = (await s.call("POST", "/api/links", { name: "App", port: 1 })).json;
    const up = await s.call("POST", `/api/links/${l.id}/icon`, tinyPng(), { "content-type": "image/png" });
    expect(up.status).toBe(200);
    const name = up.json.icon.image;
    const got = await fetch(`${s.base}/icons/${name}`);
    expect(got.status).toBe(200); expect(got.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await got.arrayBuffer()).equals(tinyPng())).toBe(true);
    expect((await fetch(`${s.base}/icons/nope.png`)).status).toBe(404);
    expect((await fetch(`${s.base}/icons/..%2Fconfig.json`)).status).toBe(404);
    expect((await s.call("POST", `/api/links/${l.id}/icon`, Buffer.from("<svg/>"), { "content-type": "image/svg+xml" })).json.error).toMatch(/PNG, JPEG, WebP or GIF/);
    const big = await s.call("POST", `/api/links/${l.id}/icon`, Buffer.alloc(1024 * 1024 + 10), { "content-type": "image/png" });
    expect(big.status).toBe(413);
    expect((await s.call("DELETE", `/api/links/${l.id}/icon`)).json.icon.image).toBeNull();
    expect((await fetch(`${s.base}/icons/${name}`)).status).toBe(404);
  });
});

describe("Settings → Page → Allow changes", () => {
  it("off: nothing about links or directories can be changed, but the page still works", async () => {
    const dir = (await s.call("POST", "/api/directories", { name: "Dir" })).json;
    const l = (await s.call("POST", "/api/links", { name: "App", port: 1 })).json;
    expect((await s.call("PUT", "/api/settings", { page: { allowEditing: false } })).json.config.page.allowEditing).toBe(false);
    const tries: [string, string, unknown?][] = [
      ["POST", "/api/links", { name: "New", port: 2 }], ["PATCH", `/api/links/${l.id}`, { name: "Changed" }], ["DELETE", `/api/links/${l.id}`],
      ["POST", `/api/links/${l.id}/move`, { index: 0 }], ["DELETE", `/api/links/${l.id}/icon`],
      ["POST", "/api/directories", { name: "New" }], ["PATCH", `/api/directories/${dir.id}`, { name: "Changed" }], ["DELETE", `/api/directories/${dir.id}`],
      ["POST", `/api/directories/${dir.id}/move`, { index: 0 }], ["POST", "/api/import", { mode: "add", document: { format: "app-router-links", directories: [], links: [] } }],
    ];
    for (const [m, u, b] of tries) {
      const r = await s.call(m, u, b);
      expect(r.status, `${m} ${u}`).toBe(403); expect(r.json.error).toMatch(/Changes to the page are turned off/);
    }
    expect((await s.call("POST", `/api/links/${l.id}/icon`, tinyPng(), { "content-type": "image/png" })).status).toBe(403);
    const page = (await s.call("GET", "/api/page")).json;
    expect(page.links.map((x: any) => x.name)).toEqual(["App"]); expect(page.directories.map((x: any) => x.name)).toEqual(["Dir"]);
    expect((await s.call("GET", "/api/status")).status).toBe(200);
    expect((await s.call("GET", "/api/export/download")).status).toBe(200);
    // turning it back on is always possible
    expect((await s.call("PUT", "/api/settings", { page: { allowEditing: true } })).status).toBe(200);
    expect((await s.call("POST", "/api/links", { name: "New", port: 2 })).status).toBe(200);
  });
});

describe("settings", () => {
  it("are saved to config.json and say what needs a restart", async () => {
    const r = await s.call("PUT", "/api/settings", { page: { title: "Front door", rootName: "My apps", showSearch: false }, health: { intervalSeconds: 60 } });
    expect(r.json.restartRequired).toEqual([]);
    expect(r.json.config.page).toEqual({ title: "Front door", rootName: "My apps", allowEditing: true, showSearch: false });
    const onDisk = JSON.parse(fs.readFileSync(path.join(s.dir, "config.json"), "utf8"));
    expect(onDisk.page.rootName).toBe("My apps"); expect(onDisk.health.intervalSeconds).toBe(60);
    const net = await s.call("PUT", "/api/settings", { server: { port: 8080, allowNetwork: true, extraHosts: ["https://Mini.tail1234.ts.net:8080/", "mini.tail1234.ts.net"] } });
    expect(net.json.restartRequired.sort()).toEqual(["server.allowNetwork", "server.port"]);
    expect(net.json.config.server.extraHosts).toEqual(["mini.tail1234.ts.net"]);
    expect((await s.call("GET", "/api/state")).json.restartRequired.sort()).toEqual(["server.allowNetwork", "server.port"]);
  });
  it("port 80 and other low ports are allowed; nonsense is refused in plain words", async () => {
    expect((await s.call("PUT", "/api/settings", { server: { port: 80 } })).status).toBe(200);
    expect((await s.call("PUT", "/api/settings", { server: { port: 0 } })).json.error).toMatch(/whole number from 1 to 65535/);
    expect((await s.call("PUT", "/api/settings", { page: { rootName: "  " } })).json.error).toMatch(/main page's name can't be empty/);
    expect((await s.call("PUT", "/api/settings", { page: { title: "x".repeat(41) } })).json.error).toMatch(/under 40/);
    expect((await s.call("PUT", "/api/settings", { health: { intervalSeconds: 1 } })).json.error).toMatch(/from 5 to 3600/);
    expect((await s.call("PUT", "/api/settings", { health: { recoveredMinutes: "" } })).json.error).toMatch(/whole number/);
    expect((await s.call("PUT", "/api/settings", { server: { extraHosts: ["bad name!"] } })).json.error).toMatch(/not a name a computer can have/);
    expect((await s.call("PUT", "/api/settings", { security: { loginEnabled: true } })).status).toBe(409);
  });
  it("themes: light, dark, system and your own colours", async () => {
    const theme = { id: "custom-harbor-1", name: "Harbor", dark: true, tokens: { bg: "#101820", accent: "#FFAA00", "not a token!": "#000000", surface: "red" } };
    const r = await s.call("PUT", "/api/settings", { appearance: { theme: "custom-harbor-1", customThemes: [theme] } });
    expect(r.json.config.appearance).toEqual({ theme: "custom-harbor-1", customThemes: [{ id: "custom-harbor-1", name: "Harbor", dark: true, tokens: { bg: "#101820", accent: "#ffaa00" } }] });
    expect((await s.call("PUT", "/api/settings", { appearance: { theme: "dark" } })).json.config.appearance.theme).toBe("dark");
  });
  it("unknown keys are ignored, not written", async () => {
    await s.call("PUT", "/api/settings", { page: { title: "T", evil: 1 }, nonsense: { a: 1 } });
    const onDisk = JSON.parse(fs.readFileSync(path.join(s.dir, "config.json"), "utf8"));
    expect(onDisk.page.evil).toBeUndefined(); expect(onDisk.nonsense).toBeUndefined();
  });
  it("state tells the page what it needs", async () => {
    const st = (await s.call("GET", "/api/state")).json;
    expect(st).toMatchObject({ auth: { status: "disabled" }, restartRequired: [], networkUrls: [] });
    expect(st.config.page).toEqual({ title: "App Router", rootName: "Apps", allowEditing: true, showSearch: true });
    expect(st.config.server.port).toBe(0); expect(typeof st.hostname).toBe("string"); expect(st.hostname).not.toMatch(/\.local$/);
    expect(st.dataFile).toBe(path.join(s.dir, "data", "links.json")); expect(st.passwordFile).toBe(path.join(s.dir, ".password"));
  });
});

describe("status lights over HTTP", () => {
  it("report every link; Check now runs a round", async () => {
    const app = await fakeApp();
    try {
      const up = (await s.call("POST", "/api/links", { name: "Up", port: app.port })).json;
      const off = (await s.call("POST", "/api/links", { name: "Off", port: app.port, health: { enabled: false } })).json;
      const r = await s.call("POST", "/api/status/check");
      expect(r.json.links[up.id].light).toBe("online"); expect(r.json.links[off.id].light).toBe("unchecked");
      expect((await s.call("GET", "/api/status")).json).toMatchObject({ enabled: true, intervalSeconds: 5 });
    } finally { await app.close(); }
  });
});

describe("export and import over HTTP", () => {
  it("download, then replace needs REPLACE, add does not", async () => {
    await s.call("POST", "/api/links", { name: "A", port: 1 });
    const dl = await fetch(s.base + "/api/export/download");
    expect(dl.headers.get("content-disposition")).toMatch(/attachment; filename="app-router-links-\d{8}-\d{6}\.json"/);
    const document = await dl.json();
    expect(document).toMatchObject({ format: "app-router-links", version: 1 });
    expect((await s.call("POST", "/api/import", { mode: "replace", document })).json.error).toMatch(/Type REPLACE/);
    expect((await s.call("POST", "/api/import", { mode: "add", document })).json).toEqual({ directories: 0, links: 1 });
    expect((await s.call("GET", "/api/page")).json.links).toHaveLength(2);
    expect((await s.call("POST", "/api/import", { mode: "replace", confirm: "REPLACE", document })).json).toEqual({ directories: 0, links: 1 });
    expect((await s.call("GET", "/api/page")).json.links).toHaveLength(1);
  });
});

describe("guards", () => {
  it("answers only to names this computer has, plus the extra names from Settings", async () => {
    const port = new URL(s.base).port;
    // a request that arrives here carrying another name is what a "DNS rebinding" attack looks like to the server
    const as = (host: string) => new Promise<number>((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/health", headers: { host } }, (res) => { res.resume(); resolve(res.statusCode || 0); }).on("error", reject);
    });
    expect(await as(`evil.example:${port}`)).toBe(421);
    expect(await as(`localhost:${port}`)).toBe(200);
    expect(await as(`mini.tail1234.ts.net`)).toBe(421);
    await s.call("PUT", "/api/settings", { server: { extraHosts: ["mini.tail1234.ts.net"] } });
    expect(await as(`mini.tail1234.ts.net`)).toBe(200);
    expect(await as(`MINI.tail1234.ts.net:${port}`)).toBe(200);
  });
  it("a change must come from the App Router page itself", async () => {
    const post = (headers: Record<string, string>) => fetch(s.base + "/api/links", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ name: "x", port: 1 }) });
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post({ origin: s.base, "sec-fetch-site": "same-origin" })).status).toBe(200);
    expect((await fetch(s.base + "/api/page", { headers: { origin: "https://evil.example" } })).status).toBe(200); // reading is not a change
  });
  it("sends security headers, and no page of another site may frame it", async () => {
    const r = await fetch(s.base + "/api/health");
    expect(r.headers.get("content-security-policy")).toMatch(/default-src 'self'/);
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(r.headers.get("x-powered-by")).toBeNull();
  });
});
