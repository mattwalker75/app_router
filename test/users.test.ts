/** The optional login and users: the same rules as my_business_manager — several logins, one shared page, everyone an admin. */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cookieClient, startServer, type Caller, type Running } from "./helpers.js";

let s: Running;
beforeEach(async () => { s = await startServer(); });
afterEach(async () => { await s.close(); });
const pwFile = () => path.join(s.dir, ".password");
const stored = () => JSON.parse(fs.readFileSync(pwFile(), "utf8")).users as { loginName: string; passwordHash: string }[];
const me = async (c: Caller) => (await c("GET", "/api/auth/me")).json;
async function loginOn(c: Caller = s.call, loginName = "matt", password = "matt-password") {
  const r = await c("POST", "/api/auth/enable", { loginName, password });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r;
}
const visitor = () => cookieClient(s.base);

describe("with the login off (the default)", () => {
  it("anyone who can reach the page uses it, and there are no users", async () => {
    expect(await me(s.call)).toEqual({ status: "disabled" });
    expect((await s.call("GET", "/api/page")).status).toBe(200);
    expect((await s.call("GET", "/api/users")).json.error).toMatch(/login is turned off/);
    expect((await s.call("POST", "/api/auth/setup", { loginName: "x", password: "password-1" })).status).toBe(409);
    expect(fs.existsSync(pwFile())).toBe(false);
  });
});

describe("turning the login on", () => {
  it("creates the first user and signs them in, in one step", async () => {
    const r = await loginOn();
    expect(r.json).toEqual({ status: "authenticated", loginName: "matt" });
    expect(stored()).toHaveLength(1);
    expect(stored()[0].passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(fs.statSync(pwFile()).mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(path.join(s.dir, "config.json"), "utf8")).security.loginEnabled).toBe(true);
    expect((await s.call("GET", "/api/page")).status).toBe(200);
  });
  it("needs a name and a password of 8 or more characters — and stays off when they are missing", async () => {
    expect((await s.call("POST", "/api/auth/enable", { loginName: "matt", password: "short" })).json.error).toMatch(/at least 8 characters/);
    expect((await s.call("POST", "/api/auth/enable", { loginName: " ", password: "long-enough" })).json.error).toMatch(/Choose a login name/);
    expect(await me(s.call)).toEqual({ status: "disabled" });
    expect(fs.existsSync(pwFile())).toBe(false);
  });
  it("from then on everything needs a sign-in: the page, the lights, the pictures, the settings", async () => {
    await loginOn();
    const v = visitor();
    expect(await me(v)).toEqual({ status: "unauthenticated" });
    for (const u of ["/api/page", "/api/status", "/api/state", "/api/settings", "/api/users", "/api/export/download", "/icons/abc-12345678.png"]) {
      const r = await v("GET", u);
      expect(r.status, u).toBe(401); expect(r.json).toEqual({ error: "Sign in first.", auth: { status: "unauthenticated" } });
    }
    expect((await v("POST", "/api/links", { name: "x", port: 1 })).status).toBe(401);
    expect((await v("PUT", "/api/settings", { page: { title: "Hacked" } })).status).toBe(401);
    expect((await v("POST", "/api/auth/disable", { confirm: "DISABLE" })).status).toBe(401);
    expect((await v("GET", "/api/health")).status).toBe(200);          // the start script's "is it up?" stays open
    expect((await v("GET", "/")).status).not.toBe(401);                // the page itself loads and shows the sign-in screen
  });
  it("nobody can create a login from the sign-in page once one exists", async () => {
    await loginOn();
    const v = visitor();
    expect((await v("POST", "/api/auth/setup", { loginName: "intruder", password: "intruder-pw" })).status).toBe(409);
    expect((await v("POST", "/api/auth/enable", { loginName: "intruder", password: "intruder-pw" })).status).toBe(401);
    expect(stored().map((u) => u.loginName)).toEqual(["matt"]);
  });
});

describe("signing in and out", () => {
  it("right name and password in, wrong ones out — with the same message either way", async () => {
    await loginOn();
    const v = visitor();
    const wrongPw = await v("POST", "/api/auth/login", { loginName: "matt", password: "wrong-password" });
    const wrongName = await v("POST", "/api/auth/login", { loginName: "nobody", password: "matt-password" });
    expect(wrongPw.status).toBe(401); expect(wrongName.json).toEqual(wrongPw.json);
    expect((await v("POST", "/api/auth/login", { loginName: "MATT", password: "matt-password" })).json).toEqual({ status: "authenticated", loginName: "matt" });
    expect((await v("GET", "/api/page")).status).toBe(200);
    await v("POST", "/api/auth/logout");
    expect(await me(v)).toEqual({ status: "unauthenticated" });
    expect((await v("GET", "/api/page")).status).toBe(401);
  });
  it("a made-up session cookie is not a sign-in", async () => {
    await loginOn();
    const forged = Buffer.from(JSON.stringify({ loginName: "matt", credTag: "0000000000000000" })).toString("base64");
    const r = await fetch(s.base + "/api/page", { headers: { cookie: `ar_session=${forged}; ar_session.sig=nonsense` } });
    expect(r.status).toBe(401);
  });
});

describe("users — every user may do all of this", () => {
  it("add a user; both see and change the same page", async () => {
    await loginOn();
    expect((await s.call("POST", "/api/users", { loginName: "sarah", password: "sarah-password" })).json).toEqual({ loginName: "sarah" });
    expect((await s.call("GET", "/api/users")).json.users).toEqual([{ loginName: "matt", you: true }, { loginName: "sarah", you: false }]);
    const sarah = visitor();
    expect((await sarah("POST", "/api/auth/login", { loginName: "sarah", password: "sarah-password" })).status).toBe(200);
    await s.call("POST", "/api/links", { name: "From matt", port: 1 });
    await sarah("POST", "/api/links", { name: "From sarah", port: 2 });
    expect((await s.call("GET", "/api/page")).json.links.map((l: any) => l.name)).toEqual(["From matt", "From sarah"]);
    expect((await sarah("GET", "/api/page")).json.links.map((l: any) => l.name)).toEqual(["From matt", "From sarah"]);
    expect((await sarah("GET", "/api/users")).json.users).toEqual([{ loginName: "matt", you: false }, { loginName: "sarah", you: true }]);
    expect((await sarah("POST", "/api/users", { loginName: "tom", password: "tom-password" })).status).toBe(200); // sarah is an admin too
  });
  it("names are unique whatever their capitals; passwords need 8 characters", async () => {
    await loginOn();
    expect((await s.call("POST", "/api/users", { loginName: "Matt", password: "another-password" })).json.error).toMatch(/already a user called “Matt”/);
    expect((await s.call("POST", "/api/users", { loginName: "sarah", password: "1234567" })).json.error).toMatch(/at least 8/);
    expect((await s.call("POST", "/api/users", { loginName: "", password: "long-enough" })).json.error).toMatch(/Choose a login name/);
    expect(stored()).toHaveLength(1);
  });
  it("reset another user's password: the old one stops working and their session ends", async () => {
    await loginOn();
    await s.call("POST", "/api/users", { loginName: "sarah", password: "sarah-password" });
    const sarah = visitor();
    await sarah("POST", "/api/auth/login", { loginName: "sarah", password: "sarah-password" });
    expect((await s.call("PUT", "/api/users/sarah/password", { password: "new-password-1" })).status).toBe(200);
    expect((await sarah("GET", "/api/page")).status).toBe(401);
    expect((await sarah("POST", "/api/auth/login", { loginName: "sarah", password: "sarah-password" })).status).toBe(401);
    expect((await sarah("POST", "/api/auth/login", { loginName: "sarah", password: "new-password-1" })).status).toBe(200);
    expect((await s.call("PUT", "/api/users/sarah/password", { password: "short" })).json.error).toMatch(/at least 8/);
    expect((await s.call("PUT", "/api/users/ghost/password", { password: "long-enough" })).status).toBe(404);
  });
  it("change your own password: needs the current one, and you stay signed in", async () => {
    await loginOn();
    expect((await s.call("POST", "/api/auth/password", { currentPassword: "wrong", newPassword: "new-password-1" })).json.error).toMatch(/not your current password/);
    expect((await s.call("POST", "/api/auth/password", { currentPassword: "matt-password", newPassword: "new-password-1" })).status).toBe(200);
    expect((await s.call("GET", "/api/page")).status).toBe(200);
    const v = visitor();
    expect((await v("POST", "/api/auth/login", { loginName: "matt", password: "matt-password" })).status).toBe(401);
    expect((await v("POST", "/api/auth/login", { loginName: "matt", password: "new-password-1" })).status).toBe(200);
    // resetting your own from the users list keeps you signed in too
    expect((await s.call("PUT", "/api/users/matt/password", { password: "third-password" })).status).toBe(200);
    expect((await s.call("GET", "/api/page")).status).toBe(200);
  });
  it("remove another user (type DELETE): they are signed out at once and can't come back; not yourself", async () => {
    await loginOn();
    await s.call("POST", "/api/users", { loginName: "sarah", password: "sarah-password" });
    const sarah = visitor();
    await sarah("POST", "/api/auth/login", { loginName: "sarah", password: "sarah-password" });
    expect((await s.call("DELETE", "/api/users/sarah")).json.error).toMatch(/Type DELETE/);
    expect((await s.call("DELETE", "/api/users/matt", { confirm: "DELETE" })).json.error).toMatch(/can't remove yourself/);
    expect((await s.call("DELETE", "/api/users/sarah", { confirm: "DELETE" })).status).toBe(200);
    expect((await sarah("GET", "/api/page")).status).toBe(401);
    expect((await sarah("POST", "/api/auth/login", { loginName: "sarah", password: "sarah-password" })).status).toBe(401);
    expect(stored().map((u) => u.loginName)).toEqual(["matt"]);
  });
});

describe("the password file", () => {
  it("deleting it asks for a new first login; links and settings are untouched", async () => {
    await loginOn();
    await s.call("POST", "/api/links", { name: "Keep me", port: 3030 });
    await s.call("PUT", "/api/settings", { page: { rootName: "My apps" } });
    fs.rmSync(pwFile());
    expect(await me(s.call)).toEqual({ status: "not_initialized" });
    expect((await s.call("GET", "/api/page")).status).toBe(401);
    const v = visitor();
    expect((await v("POST", "/api/auth/setup", { loginName: "matt", password: "brand-new-pw" })).json).toEqual({ status: "authenticated", loginName: "matt" });
    expect((await v("GET", "/api/page")).json.links.map((l: any) => l.name)).toEqual(["Keep me"]);
    expect((await v("GET", "/api/state")).json.config.page.rootName).toBe("My apps");
  });
  it("a damaged file locks everyone out with a reason, instead of letting everyone in", async () => {
    await loginOn();
    fs.writeFileSync(pwFile(), "{ broken");
    expect((await s.call("GET", "/api/page")).status).toBe(401);
    expect((await visitor()("POST", "/api/auth/login", { loginName: "matt", password: "matt-password" })).json.error).toMatch(/password file .* is damaged/);
  });
  it("a file left from before is honoured when the login is turned on again by hand", async () => {
    await loginOn();
    // someone sets loginEnabled back to false in config.json but keeps the file
    s.config.update({ security: { loginEnabled: false } });
    const v = visitor();
    expect((await v("POST", "/api/auth/enable", { loginName: "someone", password: "someone-else" })).status).toBe(401); // must be a user in the file
    expect((await v("POST", "/api/auth/enable", { loginName: "matt", password: "matt-password" })).json).toEqual({ status: "authenticated", loginName: "matt" });
  });
});

describe("turning the login off", () => {
  it("needs DISABLE, removes every user and the password file, and opens the page", async () => {
    await loginOn();
    await s.call("POST", "/api/users", { loginName: "sarah", password: "sarah-password" });
    expect((await s.call("POST", "/api/auth/disable", {})).json.error).toMatch(/Type DISABLE/);
    expect((await s.call("POST", "/api/auth/disable", { confirm: "DISABLE" })).json).toEqual({ status: "disabled" });
    expect(fs.existsSync(pwFile())).toBe(false);
    expect(await me(visitor())).toEqual({ status: "disabled" });
    expect((await visitor()("GET", "/api/page")).status).toBe(200);
    // and on again starts fresh
    expect((await loginOn(visitor(), "newname", "newname-password")).json).toEqual({ status: "authenticated", loginName: "newname" });
    expect(stored().map((u) => u.loginName)).toEqual(["newname"]);
  });
});

describe("too many tries", () => {
  it("sign-in attempts are limited to 10 in five minutes", async () => {
    await s.close();
    const { createApp } = await import("../server/src/app.js");
    const { scratchConfig, scratchDir } = await import("./helpers.js");
    const dir = scratchDir(); const handle = createApp(scratchConfig(dir));           // the rate limit on, as in real use
    const server = await new Promise<import("node:http").Server>((res) => { const x = handle.app.listen(0, "127.0.0.1", () => res(x)); });
    const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
    try {
      const c = cookieClient(base);
      await c("POST", "/api/auth/enable", { loginName: "matt", password: "matt-password" });
      let last = 0;
      for (let i = 0; i < 11; i++) last = (await cookieClient(base)("POST", "/api/auth/login", { loginName: "matt", password: "wrong-password" })).status;
      expect(last).toBe(429);
    } finally { server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); s = await startServer(); }
  });
});
