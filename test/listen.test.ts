/** How the server listens (server/src/security.ts): this computer only by default, the network when allowed. */
import http from "node:http";
import net from "node:net";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { isLoopback, listen, networkUrls, urlFor } from "../server/src/security.js";

const servers: http.Server[] = [];
const make = () => { const s = http.createServer((_q, r) => { r.end("ok"); }); servers.push(s); return s; };
afterEach(() => { for (const s of servers.splice(0)) { s.closeAllConnections(); s.close(); } });

/** this computer's own network address, if it has one */
const lanAddress = () => Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal)?.address;
/** "ok" when a page comes back, "refused" when the connection is dropped or never made */
const reach = (host: string, port: number) => new Promise<string>((resolve) => {
  const req = http.get({ host, port, path: "/", timeout: 1500 }, (res) => { res.resume(); res.on("end", () => resolve("ok")); });
  req.on("error", () => resolve("refused")); req.on("timeout", () => { req.destroy(); resolve("refused"); });
});

describe("network access off", () => {
  it("listens on 127.0.0.1 only", async () => {
    const l = await listen(make(), 0, false);
    expect(l).toMatchObject({ host: "127.0.0.1", localOnlyFilter: false });
    expect(await reach("127.0.0.1", l.port)).toBe("ok");
    const lan = lanAddress();
    if (lan) expect(await reach(lan, l.port)).toBe("refused");
  });
  it("on a low port (where the system only allows every address) it accepts this computer's own connections and drops the rest", async () => {
    const l = await listen(make(), 0, false, { forceFilter: true });
    expect(l).toMatchObject({ host: "0.0.0.0", localOnlyFilter: true });
    expect(await reach("127.0.0.1", l.port)).toBe("ok");
    const lan = lanAddress();
    // a connection to this computer's network address arrives FROM that address — exactly what another device looks like
    if (lan) expect(await reach(lan, l.port)).toBe("refused");
  });
  it("a port that is taken is reported, not swallowed", async () => {
    const first = await listen(make(), 0, false);
    await expect(listen(make(), first.port, false)).rejects.toMatchObject({ code: "EADDRINUSE" });
  });
});

describe("network access on", () => {
  it("listens on every address, with no filter", async () => {
    const l = await listen(make(), 0, true);
    expect(l).toMatchObject({ host: "0.0.0.0", localOnlyFilter: false });
    expect(await reach("127.0.0.1", l.port)).toBe("ok");
    const lan = lanAddress();
    if (lan) expect(await reach(lan, l.port)).toBe("ok");
  });
});

describe("helpers", () => {
  it("knows which addresses are this computer itself", () => {
    for (const a of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1"]) expect(isLoopback(a), a).toBe(true);
    for (const a of ["192.168.1.20", "100.101.102.103", "::ffff:192.168.1.20", "fe80::1", "", undefined]) expect(isLoopback(a), String(a)).toBe(false);
    expect(net.isIP("127.0.0.1")).toBe(4);
  });
  it("leaves :80 out of addresses", () => {
    expect(urlFor("mac-mini.local", 80)).toBe("http://mac-mini.local");
    expect(urlFor("mac-mini.local", 8080)).toBe("http://mac-mini.local:8080");
    expect(networkUrls(80).every((u) => !/:80$/.test(u))).toBe(true);
    expect(networkUrls(8080).every((u) => /:8080$/.test(u))).toBe(true);
  });
});
