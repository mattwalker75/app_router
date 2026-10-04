/** The status lights (server/src/health.ts): real checks against stand-in apps, and the rules for green / yellow / red / grey. */
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HealthChecker, probe } from "../server/src/health.js";
import { Service } from "../server/src/service.js";
import type { Config } from "../server/src/config.js";
import { deadPort, fakeApp, scratchConfig, scratchDir, type FakeApp } from "./helpers.js";

let dir: string; let config: Config; let svc: Service; let apps: FakeApp[] = [];
let clock = 0;
const minutes = (n: number) => { clock += n * 60_000; };
const checker = () => new HealthChecker(config, svc, { now: () => clock });
const app = async (status = 200) => { const a = await fakeApp(status); apps.push(a); return a; };
beforeEach(() => { dir = scratchDir(); config = scratchConfig(dir); svc = new Service(config); clock = Date.parse("2026-10-04T12:00:00Z"); });
afterEach(async () => { for (const a of apps) await a.close(); apps = []; fs.rmSync(dir, { recursive: true, force: true }); });

describe("one check", () => {
  it("an app that answers is up, and says how fast", async () => {
    const a = await app();
    const r = await probe(a.url + "/", 1000);
    expect(r.up).toBe(true); expect(r.ms).toBeGreaterThanOrEqual(0); expect(r.detail).toMatch(/^Answered in \d+ ms$/);
    expect(a.hits).toEqual(["GET /"]);
  });
  it("a sign-in page, a missing page or a redirect still counts as up", async () => {
    for (const status of [401, 403, 404, 302]) expect((await probe((await app(status)).url, 1000)).up, `HTTP ${status}`).toBe(true);
  });
  it("a server error counts as down", async () => {
    const r = await probe((await app(503)).url, 1000);
    expect(r).toMatchObject({ up: false, detail: "Answered with an error (HTTP 503)" });
  });
  it("nothing listening, a name that does not exist, a bad address and no answer in time are all down, in plain words", async () => {
    expect(await probe(`http://127.0.0.1:${await deadPort()}/`, 1000)).toMatchObject({ up: false, detail: "No answer — nothing is listening there" });
    expect((await probe("http://no-such-computer.invalid/", 3000)).detail).toMatch(/could not be (found|looked up)/);
    expect(await probe("not an address", 1000)).toMatchObject({ up: false, detail: "The address is not valid" });
    const slow = await app(); slow.mode.hang = true;
    const started = Date.now();
    expect(await probe(slow.url, 1000)).toMatchObject({ up: false, ms: null, detail: "No answer within 1 seconds" });
    expect(Date.now() - started).toBeLessThan(2500);
  });
});

describe("the light", () => {
  it("green when it answers; the check goes to the port on this computer", async () => {
    const a = await app();
    const l = svc.createLink({ name: "App", port: a.port, path: "/home" });
    const h = checker();
    expect(h.statusOf(l)).toMatchObject({ light: "pending", detail: "Not checked yet" });
    await h.checkAll();
    expect(h.statusOf(l)).toMatchObject({ light: "online", since: "2026-10-04T12:00:00.000Z", checkedAt: "2026-10-04T12:00:00.000Z" });
    expect(a.hits).toEqual(["GET /home"]);
    expect(h.report()).toMatchObject({ enabled: true, checkedAt: "2026-10-04T12:00:00.000Z", intervalSeconds: 5 });
  });
  it("uses the link's own check address when it has one", async () => {
    const a = await app();
    svc.createLink({ name: "App", port: a.port, health: { path: "/api/health" } });
    await checker().checkAll();
    expect(a.hits).toEqual(["GET /api/health"]);
  });
  it("red only after two failed checks in a row (one miss is forgiven)", async () => {
    const a = await app();
    const l = svc.createLink({ name: "App", port: a.port });
    const h = checker();
    await h.checkAll(); expect(h.statusOf(l).light).toBe("online");
    a.mode.status = 500; minutes(1);
    await h.checkAll();
    expect(h.statusOf(l)).toMatchObject({ light: "online", since: "2026-10-04T12:00:00.000Z" });
    expect(h.statusOf(l).detail).toMatch(/HTTP 500.*it answered before/);
    minutes(1); await h.checkAll();
    expect(h.statusOf(l)).toMatchObject({ light: "down", since: "2026-10-04T12:02:00.000Z", detail: "Answered with an error (HTTP 500)" });
    minutes(5); await h.checkAll();
    expect(h.statusOf(l)).toMatchObject({ light: "down", since: "2026-10-04T12:02:00.000Z" }); // "down since" does not move
  });
  it("yellow when it comes back, for the yellow time, then green", async () => {
    const a = await app(500);
    const l = svc.createLink({ name: "App", port: a.port });
    const h = checker();
    await h.checkAll(); expect(h.statusOf(l).light).toBe("pending");   // one failure: no verdict yet
    await h.checkAll(); expect(h.statusOf(l).light).toBe("down");
    a.mode.status = 200; minutes(3);
    await h.checkAll();
    expect(h.statusOf(l)).toMatchObject({ light: "recovered", since: "2026-10-04T12:03:00.000Z" });
    minutes(9); await h.checkAll();
    expect(h.statusOf(l).light).toBe("recovered");                     // 9 of 10 minutes
    minutes(1);
    expect(h.statusOf(l)).toMatchObject({ light: "online", since: "2026-10-04T12:03:00.000Z" });
  });
  it("a link that was never down starts green, not yellow", async () => {
    const l = svc.createLink({ name: "App", port: (await app()).port });
    const h = checker(); await h.checkAll();
    expect(h.statusOf(l).light).toBe("online");
  });
  it("the yellow time and the number of failures come from Settings and apply at once", async () => {
    const a = await app(500);
    const l = svc.createLink({ name: "App", port: a.port });
    const h = checker();
    config.update({ health: { failuresBeforeDown: 1, recoveredMinutes: 1 } });
    await h.checkAll(); expect(h.statusOf(l).light).toBe("down");
    a.mode.status = 200; await h.checkAll(); expect(h.statusOf(l).light).toBe("recovered");
    minutes(1); expect(h.statusOf(l).light).toBe("online");
    config.update({ health: { recoveredMinutes: 0 } });
    a.mode.status = 500; await h.checkAll(); a.mode.status = 200; await h.checkAll();
    expect(h.statusOf(l).light).toBe("online");                        // yellow time 0 = straight back to green
  });
});

describe("grey", () => {
  it("a link with its checks off is never asked", async () => {
    const a = await app();
    const l = svc.createLink({ name: "App", port: a.port, health: { enabled: false } });
    const h = checker(); await h.checkAll();
    expect(h.statusOf(l)).toMatchObject({ light: "unchecked", detail: "Health checks are off for this link" });
    expect(a.hits).toEqual([]);
  });
  it("the master switch turns every light grey and stops all checks", async () => {
    const a = await app();
    const l = svc.createLink({ name: "App", port: a.port });
    const h = checker(); await h.checkAll(); expect(a.hits).toHaveLength(1);
    config.update({ health: { enabled: false } });
    expect(h.statusOf(l)).toMatchObject({ light: "unchecked", detail: "Health checks are turned off in Settings" });
    expect(h.report().enabled).toBe(false);
    await h.checkAll(); expect(a.hits).toHaveLength(1);
    config.update({ health: { enabled: true } });
    await h.checkAll(); expect(h.statusOf(l).light).toBe("online"); expect(a.hits).toHaveLength(2);
  });
});

describe("one moment of trouble is one failed check", () => {
  it("a link is never asked twice at the same time, so overlapping checks can't count double", async () => {
    let asked = 0; let release: () => void = () => {};
    const slow = () => new Promise<{ up: boolean; ms: null; detail: string }>((res) => { asked++; release = () => res({ up: false, ms: null, detail: "No answer" }); });
    const l = svc.createLink({ name: "App", port: 1 });
    const h = new HealthChecker(config, svc, { now: () => clock, probe: slow });
    const first = h.checkAll();
    await new Promise((r) => setTimeout(r, 20));
    svc.updateLink(l.id, { description: "changed while the check is out" }); // would start a second check of the same link
    h.start(); await new Promise((r) => setTimeout(r, 20)); h.stop();          // and so would the timer
    expect(asked).toBe(1);
    release(); await first;
    expect(h.statusOf(svc.page().links[0]).light).toBe("pending");            // one failure, not two: not red yet
  });
  it("saving a health setting starts a round at once", async () => {
    const a = await app();
    const l = svc.createLink({ name: "App", port: a.port });
    config.update({ health: { enabled: false } });
    const h = checker(); h.start();
    try {
      await new Promise((r) => setTimeout(r, 60));
      expect(a.hits).toHaveLength(0); expect(h.statusOf(l).light).toBe("unchecked");
      config.update({ health: { enabled: true, intervalSeconds: 3600 } }); h.settingsChanged();
      for (let i = 0; i < 40 && h.statusOf(l).light !== "online"; i++) await new Promise((r) => setTimeout(r, 25));
      expect(h.statusOf(l).light).toBe("online");                             // not "Checking…" for the next hour
    } finally { h.stop(); }
  });
});

describe("when links change", () => {
  it("a new link is checked straight away once checking has started, and a removed one is forgotten", async () => {
    const a = await app();
    const h = checker(); h.start();
    try {
      const l = svc.createLink({ name: "App", port: a.port });
      for (let i = 0; i < 40 && h.statusOf(l).light === "pending"; i++) await new Promise((r) => setTimeout(r, 25));
      expect(h.statusOf(l).light).toBe("online");
      svc.deleteLink(l.id);
      expect(h.report().links).toEqual({});
    } finally { h.stop(); }
  });
  it("changing a link's address starts its verdict from scratch", async () => {
    const a = await app(); const dead = await deadPort();
    const l = svc.createLink({ name: "App", port: a.port });
    const h = checker(); await h.checkAll(); expect(h.statusOf(l).light).toBe("online");
    const moved = svc.updateLink(l.id, { port: dead });
    await h.checkAll();
    expect(h.statusOf(moved).light).toBe("pending");                   // one failure on the NEW address — not "online" left over from the old one
    await h.checkAll();
    expect(h.statusOf(moved)).toMatchObject({ light: "down", detail: "No answer — nothing is listening there" });
  });
  it("checks many links in one round", async () => {
    const a = await app();
    for (let i = 0; i < 25; i++) svc.createLink({ name: `App ${i}`, port: a.port, path: `/${i}` });
    const h = checker(); await h.checkAll();
    expect(a.hits).toHaveLength(25);
    expect(Object.values(h.report().links).every((s) => s.light === "online")).toBe(true);
  });
});
