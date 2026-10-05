/** The rules for links and directories (server/src/service.ts), straight against the service. */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkUrl, displayAddress, linkHref } from "../shared/address.js";
import { Service, tidyAddress } from "../server/src/service.js";
import { scratchConfig, scratchDir, tinyPng } from "./helpers.js";

let dir: string; let svc: Service;
beforeEach(() => { dir = scratchDir(); svc = new Service(scratchConfig(dir)); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
const fail = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as Error).message; } return "(no error)"; };
const names = (list: { name: string }[]) => list.map((x) => x.name);
const linksIn = (d: string | null) => names(svc.page().links.filter((l) => l.directoryId === d));
const dirsIn = (d: string | null) => names(svc.page().directories.filter((x) => x.parentId === d));

describe("a link to an app on this computer", () => {
  it("needs only a name and a port", () => {
    const l = svc.createLink({ name: "  My Business Manager ", port: 3030 });
    expect(l).toMatchObject({ name: "My Business Manager", local: true, scheme: "http", port: 3030, path: "", url: "", openIn: "new", directoryId: null, position: 0 });
    expect(l.health).toEqual({ enabled: true, path: "" });
    expect(l.icon).toEqual({ text: "", color: "", image: null });
    expect(l.id).toMatch(/^[a-z0-9]{12}$/);
  });
  it("opens on whatever name the browser used to reach App Router", () => {
    const l = svc.createLink({ name: "MBM", port: 3030 });
    expect(linkHref(l, "localhost")).toBe("http://localhost:3030/");
    expect(linkHref(l, "192.168.1.20")).toBe("http://192.168.1.20:3030/");
    expect(linkHref(l, "mini.tail1234.ts.net")).toBe("http://mini.tail1234.ts.net:3030/");
    expect(linkHref(l, "::1")).toBe("http://[::1]:3030/");
  });
  it("takes an optional path, tidied to start with a slash", () => {
    const l = svc.createLink({ name: "Pi-hole", port: 8081, path: "admin" });
    expect(l.path).toBe("/admin");
    expect(linkHref(l, "mac-mini.local")).toBe("http://mac-mini.local:8081/admin");
    expect(svc.createLink({ name: "Root", port: 1, path: "/" }).path).toBe("");
    expect(displayAddress(l, "mac-mini")).toBe("Port 8081 on mac-mini · /admin");
  });
  it("can be https, and leaves out a standard port", () => {
    const l = svc.createLink({ name: "Secure", port: 443, scheme: "https" });
    expect(linkHref(l, "mini")).toBe("https://mini/");
    expect(linkHref(svc.createLink({ name: "Plain", port: 80 }), "mini")).toBe("http://mini/");
  });
  it("refuses a missing or impossible port, an empty name, a path with spaces", () => {
    expect(fail(() => svc.createLink({ name: "x" }))).toMatch(/Enter the port/);
    expect(fail(() => svc.createLink({ name: "x", port: 0 }))).toMatch(/1 to 65535/);
    expect(fail(() => svc.createLink({ name: "x", port: 70000 }))).toMatch(/1 to 65535/);
    expect(fail(() => svc.createLink({ name: "x", port: 3.5 as number }))).toMatch(/whole number/);
    expect(fail(() => svc.createLink({ name: "  ", port: 80 }))).toMatch(/name can't be empty/);
    expect(fail(() => svc.createLink({ name: "x", port: 80, path: "/a b" }))).toMatch(/spaces/);
    expect(fail(() => svc.createLink({ name: "x", port: 80, path: "http://other/" }))).toMatch(/after the port/);
    expect(fail(() => svc.createLink({ name: "n".repeat(81), port: 80 }))).toMatch(/80 characters or fewer/);
    expect(svc.page().links).toHaveLength(0);
  });
  it("counts a name the way a person does: an emoji or an accented letter is one character", () => {
    expect(svc.createLink({ name: "🎬".repeat(80), port: 80 }).name).toHaveLength(160);     // 80 characters, twice that in code units
    expect(fail(() => svc.createLink({ name: "🎬".repeat(81), port: 80 }))).toMatch(/80 characters or fewer/);
  });
  it("a port is a number or digits — and a mistake sent by a script is a plain sentence, not a crash", () => {
    expect(svc.createLink({ name: "typed", port: "3030" as unknown as number }).port).toBe(3030);
    expect(fail(() => svc.createLink({ name: "x", port: true as unknown as number }))).toMatch(/1 to 65535/);
    expect(fail(() => svc.createLink({ name: "x", port: [80] as unknown as number }))).toMatch(/1 to 65535/);
    expect(fail(() => svc.createLink({ name: "x", port: 80, icon: "abc" as never }))).toMatch(/“icon” must be a group/);
    expect(fail(() => svc.createLink({ name: "x", port: 80, health: true as never }))).toMatch(/“health” must be a group/);
  });
});

describe("a link to somewhere else", () => {
  it("takes a full address and an optional port", () => {
    const l = svc.createLink({ name: "NAS", local: false, url: "https://nas.example.com/login", port: 5001 });
    expect(l).toMatchObject({ local: false, url: "https://nas.example.com/login", port: 5001, path: "" });
    expect(linkHref(l, "ignored")).toBe("https://nas.example.com:5001/login");
    expect(displayAddress(l, "mac-mini")).toBe("nas.example.com:5001/login");
    const g = svc.createLink({ name: "GitHub", local: false, url: "https://github.com" });
    expect(g.port).toBeNull();
    expect(linkHref(g, "ignored")).toBe("https://github.com/");
    expect(displayAddress(g, "mac-mini")).toBe("github.com");
  });
  it("never turns anything but http or https into something clickable, even from a links file edited by hand", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///etc/passwd", "ftp://files.example", "not an address", ""]) {
      const edited = { local: false, scheme: "http" as const, port: null, path: "", url };
      expect(linkHref(edited, "mini"), url).toBe("about:blank");
    }
    expect(linkHref({ local: false, scheme: "http", port: null, path: "", url: "HTTPS://Example.com/x" }, "mini")).toBe("https://example.com/x");
  });
  it("adds the missing http:// or https://", () => {
    expect(tidyAddress("github.com")).toBe("https://github.com");
    expect(tidyAddress("192.168.1.1")).toBe("http://192.168.1.1");
    expect(tidyAddress("nas.local:5001/x")).toBe("http://nas.local:5001/x");
    expect(tidyAddress("printer")).toBe("http://printer");
    expect(tidyAddress("HTTP://Example.com")).toBe("HTTP://Example.com");
  });
  it("refuses an empty address and anything that is not http or https", () => {
    expect(fail(() => svc.createLink({ name: "x", local: false }))).toMatch(/Enter the address/);
    expect(fail(() => svc.createLink({ name: "x", local: false, url: "ftp://files" }))).toMatch(/Only http/);
    expect(fail(() => svc.createLink({ name: "x", local: false, url: "javascript://alert(1)" }))).toMatch(/Only http/);
    expect(fail(() => svc.createLink({ name: "x", local: false, url: "http://" }))).toMatch(/not an address/);
    expect(fail(() => svc.createLink({ name: "x", local: false, url: "https://ok.example", port: 99999 }))).toMatch(/1 to 65535/);
  });
  it("…including the kinds with no // in them, while a name and a port is still fine", () => {
    expect(fail(() => svc.createLink({ name: "x", local: false, url: "mailto:someone@example.com" }))).toMatch(/Only http/);
    expect(fail(() => svc.createLink({ name: "x", local: false, url: "javascript:alert(1)" }))).toMatch(/Only http/);
    expect(svc.createLink({ name: "nas", local: false, url: "nas.local:5001/files" }).url).toBe("http://nas.local:5001/files");
    expect(svc.createLink({ name: "lh", local: false, url: "localhost:8080" }).url).toBe("http://localhost:8080");
  });
});

describe("changing a link", () => {
  it("changes only what was sent", () => {
    const l = svc.createLink({ name: "JARVIS", port: 8110, description: "Assistant", openIn: "same" });
    const u = svc.updateLink(l.id, { name: "Jarvis" });
    expect(u).toMatchObject({ name: "Jarvis", port: 8110, description: "Assistant", openIn: "same" });
    expect(svc.updateLink(l.id, { health: { enabled: false } }).health).toEqual({ enabled: false, path: "" });
    expect(svc.updateLink(l.id, { icon: { text: "JV", color: "#3F5468" } }).icon).toEqual({ text: "JV", color: "#3f5468", image: null });
    expect(fail(() => svc.updateLink(l.id, { icon: { color: "blue" } }))).toMatch(/#2b59d9/);
    expect(fail(() => svc.updateLink(l.id, { icon: { text: "LONG" } }))).toMatch(/3 characters or fewer/);
    // what a person sees as one character counts once: an emoji, a flag, an accented letter
    expect(svc.updateLink(l.id, { icon: { text: "🎬" } }).icon.text).toBe("🎬");
    expect(svc.updateLink(l.id, { icon: { text: "🇺🇸é1" } }).icon.text).toBe("🇺🇸é1");
    expect(fail(() => svc.updateLink(l.id, { icon: { text: "🎬🎬🎬🎬" } }))).toMatch(/3 characters or fewer/);
  });
  it("can switch between this computer and somewhere else", () => {
    const l = svc.createLink({ name: "App", port: 3000, path: "/x" });
    const r = svc.updateLink(l.id, { local: false, url: "example.com", port: null });
    expect(r).toMatchObject({ local: false, url: "https://example.com", port: null, path: "", scheme: "http" });
    expect(fail(() => svc.updateLink(l.id, { local: true }))).toMatch(/Enter the port/);
    expect(svc.updateLink(l.id, { local: true, port: 4000 })).toMatchObject({ local: true, port: 4000, url: "", path: "" });
  });
  it("a link that is gone says so", () => {
    expect(fail(() => svc.updateLink("nope", { name: "x" }))).toMatch(/no longer exists/);
    expect(fail(() => svc.deleteLink("nope"))).toMatch(/no longer exists/);
  });
});

describe("the address a health check asks for", () => {
  it("is the link itself, through localhost for an app on this computer", () => {
    expect(checkUrl(svc.createLink({ name: "a", port: 3030 }))).toBe("http://localhost:3030/");
    expect(checkUrl(svc.createLink({ name: "b", port: 8081, path: "/admin" }))).toBe("http://localhost:8081/admin");
    expect(checkUrl(svc.createLink({ name: "c", local: false, url: "https://nas.example.com/x", port: 5001 }))).toBe("https://nas.example.com:5001/x");
  });
  it("or its own check address: a path, or a full address", () => {
    expect(checkUrl(svc.createLink({ name: "a", port: 3030, health: { path: "api/health" } }))).toBe("http://localhost:3030/api/health");
    expect(checkUrl(svc.createLink({ name: "b", local: false, url: "https://nas.example.com/app/", health: { path: "/ping" } }))).toBe("https://nas.example.com/ping");
    expect(checkUrl(svc.createLink({ name: "c", port: 1, health: { path: "https://status.example.com/up" } }))).toBe("https://status.example.com/up");
    expect(fail(() => svc.createLink({ name: "d", port: 1, health: { path: "ftp://x" } }))).toMatch(/http:\/\/ or https:\/\//);
  });
});

describe("directories", () => {
  it("nest like bookmark folders, and links can sit in any of them or on the main page", () => {
    const lab = svc.createDirectory({ name: "Home lab" });
    const cams = svc.createDirectory({ name: "Cameras", parentId: lab.id });
    svc.createLink({ name: "MBM", port: 3030 });
    svc.createLink({ name: "NAS", local: false, url: "nas.local", directoryId: lab.id });
    svc.createLink({ name: "Front door", local: false, url: "192.168.1.61", directoryId: cams.id });
    expect(linksIn(null)).toEqual(["MBM"]); expect(linksIn(lab.id)).toEqual(["NAS"]); expect(linksIn(cams.id)).toEqual(["Front door"]);
    expect(dirsIn(null)).toEqual(["Home lab"]); expect(dirsIn(lab.id)).toEqual(["Cameras"]);
    expect(fail(() => svc.createLink({ name: "x", port: 1, directoryId: "nope" }))).toMatch(/directory no longer exists/);
    expect(fail(() => svc.createDirectory({ name: "" }))).toMatch(/can't be empty/);
    expect(svc.renameDirectory(lab.id, { name: "Lab" }).name).toBe("Lab");
  });
  it("stop at 8 levels", () => {
    let parent: string | null = null;
    for (let i = 1; i <= 8; i++) parent = svc.createDirectory({ name: `L${i}`, parentId: parent }).id;
    expect(fail(() => svc.createDirectory({ name: "L9", parentId: parent }))).toMatch(/8 deep/);
    const other = svc.createDirectory({ name: "Other" });
    svc.createDirectory({ name: "Child", parentId: other.id });
    expect(fail(() => svc.moveDirectory(other.id, { parentId: parent }))).toMatch(/8 deep/);
  });
  it("can't move into themselves or into something inside them", () => {
    const a = svc.createDirectory({ name: "A" }); const b = svc.createDirectory({ name: "B", parentId: a.id }); const c = svc.createDirectory({ name: "C", parentId: b.id });
    expect(fail(() => svc.moveDirectory(a.id, { parentId: a.id }))).toMatch(/into itself/);
    expect(fail(() => svc.moveDirectory(a.id, { parentId: c.id }))).toMatch(/into itself/);
    svc.moveDirectory(c.id, { parentId: null });
    expect(dirsIn(null)).toEqual(["A", "C"]); expect(dirsIn(b.id)).toEqual([]);
  });
  it("an empty one deletes at once; one with things in it needs DELETE and takes them with it", () => {
    const lab = svc.createDirectory({ name: "Home lab" }); const cams = svc.createDirectory({ name: "Cameras", parentId: lab.id });
    svc.createLink({ name: "NAS", local: false, url: "nas.local", directoryId: lab.id });
    svc.createLink({ name: "Cam", local: false, url: "192.168.1.61", directoryId: cams.id });
    const keep = svc.createLink({ name: "Keep", port: 1 });
    const empty = svc.createDirectory({ name: "Empty" });
    expect(svc.deleteDirectory(empty.id)).toEqual({ directories: 0, links: 0 });
    expect(svc.contents(lab.id)).toEqual({ directories: 1, links: 2 });
    expect(fail(() => svc.deleteDirectory(lab.id))).toMatch(/not empty. Type DELETE to remove it together with 2 links and 1 directory/);
    expect(svc.page().links).toHaveLength(3);
    expect(svc.deleteDirectory(lab.id, "DELETE")).toEqual({ directories: 1, links: 2 });
    expect(svc.page().directories).toHaveLength(0);
    expect(names(svc.page().links)).toEqual([keep.name]);
  });
});

describe("order and moving", () => {
  it("new things go to the end; a move puts a link exactly where it was dropped", () => {
    for (const n of ["A", "B", "C", "D"]) svc.createLink({ name: n, port: 1 });
    const id = (n: string) => svc.page().links.find((l) => l.name === n)!.id;
    expect(linksIn(null)).toEqual(["A", "B", "C", "D"]);
    svc.moveLink(id("D"), { index: 0 }); expect(linksIn(null)).toEqual(["D", "A", "B", "C"]);
    svc.moveLink(id("D"), { index: 2 }); expect(linksIn(null)).toEqual(["A", "B", "D", "C"]);
    svc.moveLink(id("A"), { index: 99 }); expect(linksIn(null)).toEqual(["B", "D", "C", "A"]);
    expect(svc.page().links.map((l) => l.position)).toEqual([0, 1, 2, 3]);
  });
  it("moving to another directory closes the gap behind it", () => {
    const d = svc.createDirectory({ name: "Dir" });
    for (const n of ["A", "B", "C"]) svc.createLink({ name: n, port: 1 });
    svc.createLink({ name: "X", port: 1, directoryId: d.id });
    const b = svc.page().links.find((l) => l.name === "B")!;
    svc.moveLink(b.id, { directoryId: d.id, index: 0 });
    expect(linksIn(null)).toEqual(["A", "C"]); expect(linksIn(d.id)).toEqual(["B", "X"]);
    expect(svc.page().links.filter((l) => l.directoryId === null).map((l) => l.position)).toEqual([0, 1]);
    svc.updateLink(b.id, { directoryId: null }); // the Directory box in the form: goes to the end
    expect(linksIn(null)).toEqual(["A", "C", "B"]); expect(linksIn(d.id)).toEqual(["X"]);
    svc.deleteLink(svc.page().links.find((l) => l.name === "A")!.id);
    expect(svc.page().links.filter((l) => l.directoryId === null).map((l) => l.position)).toEqual([0, 1]);
  });
  it("directories keep their order too", () => {
    for (const n of ["One", "Two", "Three"]) svc.createDirectory({ name: n });
    const three = svc.page().directories.find((d) => d.name === "Three")!;
    svc.moveDirectory(three.id, { index: 0 });
    expect(dirsIn(null)).toEqual(["Three", "One", "Two"]);
    const one = svc.page().directories.find((d) => d.name === "One")!;
    svc.moveDirectory(one.id, { parentId: three.id });
    expect(dirsIn(null)).toEqual(["Three", "Two"]); expect(dirsIn(three.id)).toEqual(["One"]);
  });
});

describe("pictures", () => {
  it("a picture is a file in the icons folder; replacing or removing it, or deleting the link, removes the file", () => {
    const l = svc.createLink({ name: "App", port: 1 });
    const first = svc.setIcon(l.id, tinyPng(), "image/png").icon.image!;
    expect(first).toMatch(new RegExp(`^${l.id}-[a-f0-9]{8}\\.png$`));
    expect(fs.existsSync(path.join(svc.iconsDir(), first))).toBe(true);
    expect(svc.iconFile(first)).toBe(path.join(svc.iconsDir(), first));
    const second = svc.setIcon(l.id, tinyPng(), "image/jpeg; charset=binary").icon.image!;
    expect(second).toMatch(/\.jpg$/);
    expect(fs.existsSync(path.join(svc.iconsDir(), first))).toBe(false);
    expect(svc.removeIcon(l.id).icon.image).toBeNull();
    expect(fs.readdirSync(svc.iconsDir())).toEqual([]);
    const third = svc.setIcon(l.id, tinyPng(), "image/png").icon.image!;
    svc.deleteLink(l.id);
    expect(fs.existsSync(path.join(svc.iconsDir(), third))).toBe(false);
  });
  it("refuses other file types, nothing at all, and more than 1 MB; never serves a path outside the folder", () => {
    const l = svc.createLink({ name: "App", port: 1 });
    expect(fail(() => svc.setIcon(l.id, tinyPng(), "image/svg+xml"))).toMatch(/PNG, JPEG, WebP or GIF/);
    expect(fail(() => svc.setIcon(l.id, Buffer.alloc(0), "image/png"))).toMatch(/Choose a picture/);
    expect(fail(() => svc.setIcon(l.id, Buffer.alloc(1024 * 1024 + 1), "image/png"))).toMatch(/larger than 1 MB/);
    expect(svc.iconFile("../config.json")).toBeNull();
    expect(svc.iconFile("..%2Fconfig.json")).toBeNull();
    expect(svc.iconFile("abc-12345678.png")).toBeNull(); // right shape, no such file
  });
});

describe("the file on disk", () => {
  it("is written after every change and read back at the next start", () => {
    const d = svc.createDirectory({ name: "Dir" });
    svc.createLink({ name: "A", port: 3030, directoryId: d.id });
    const file = svc.dataFile();
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(saved).toMatchObject({ format: "app-router-links", version: 1 });
    expect(saved.links[0].name).toBe("A");
    const again = new Service(scratchConfig(dir));
    expect(names(again.page().links)).toEqual(["A"]); expect(names(again.page().directories)).toEqual(["Dir"]);
  });
  it("a missing file is an empty page; a damaged one is refused with a plain reason", () => {
    expect(svc.page()).toEqual({ directories: [], links: [] });
    fs.mkdirSync(path.dirname(svc.dataFile()), { recursive: true });
    fs.writeFileSync(svc.dataFile(), "{ not json");
    expect(fail(() => new Service(scratchConfig(dir)))).toMatch(/not valid JSON/);
    fs.writeFileSync(svc.dataFile(), JSON.stringify({ hello: 1 }));
    expect(fail(() => new Service(scratchConfig(dir)))).toMatch(/does not look like an App Router file/);
  });
});

describe("a links file edited by hand", () => {
  const write = (doc: unknown) => { fs.mkdirSync(path.dirname(svc.dataFile()), { recursive: true }); fs.writeFileSync(svc.dataFile(), JSON.stringify(doc)); return new Service(scratchConfig(dir)); };
  it("missing fields are filled in, so the page always gets whole records", () => {
    const s = write({ directories: [{ id: "d1", name: "Lab" }], links: [{ id: "l1", name: "Bare", port: 3030 }, { id: "l2", url: "https://example.com", directoryId: "d1" }, { id: "l3", name: "Lost", port: "abc", directoryId: "gone", icon: "x", health: null, openIn: "sideways" }] });
    const [bare, remote, lost] = ["l1", "l2", "l3"].map((id) => s.page().links.find((l) => l.id === id)!);
    expect(bare).toMatchObject({ name: "Bare", local: true, scheme: "http", port: 3030, path: "", url: "", description: "", directoryId: null, openIn: "new", icon: { text: "", color: "", image: null }, health: { enabled: true, path: "" } });
    expect(remote).toMatchObject({ name: "Unnamed link", local: false, url: "https://example.com", directoryId: "d1" });
    expect(lost).toMatchObject({ port: null, directoryId: null, openIn: "new", icon: { text: "", color: "", image: null }, health: { enabled: true, path: "" } });
    expect(s.page().directories[0]).toMatchObject({ id: "d1", name: "Lab", parentId: null });
    expect(typeof bare.createdAt).toBe("string");
  });
  it("an id typed by hand that the app would not have made gets a new one, and what pointed at it follows", () => {
    const s = write({ directories: [{ id: "My Lab", name: "Lab" }, { id: "../../up", name: "Inner", parentId: "My Lab" }],
      links: [{ id: "../../escape", name: "Odd", port: 1, directoryId: "../../up", icon: { image: "../../etc/passwd" } }, { id: "fine1", name: "Fine", port: 2, directoryId: "My Lab" }] });
    const p = s.page();
    for (const x of [...p.directories, ...p.links]) expect(x.id).toMatch(/^[a-z0-9]{1,40}$/);
    const lab = p.directories.find((d) => d.name === "Lab")!, inner = p.directories.find((d) => d.name === "Inner")!;
    expect(inner.parentId).toBe(lab.id);
    expect(p.links.find((l) => l.name === "Odd")).toMatchObject({ directoryId: inner.id, icon: { image: null } });   // a picture name the app never made is no picture
    expect(p.links.find((l) => l.name === "Fine")).toMatchObject({ id: "fine1", directoryId: lab.id });
    const odd = p.links.find((l) => l.name === "Odd")!;
    s.setIcon(odd.id, tinyPng(), "image/png");                                                                           // …and its picture lands inside the pictures folder
    expect(fs.readdirSync(s.iconsDir())).toEqual([s.page().links.find((l) => l.id === odd.id)!.icon.image]);
  });
  it("things that are not records, and second copies of an id, are left out", () => {
    const s = write({ directories: [null, "x", { id: "d1", name: "A" }, { id: "d1", name: "Twin" }, { name: "No id" }], links: [null, 7, { id: "l1", name: "Ok", port: 1 }, { id: "l1", name: "Twin", port: 2 }] });
    expect(s.page().directories.map((d) => d.name)).toEqual(["A"]);
    expect(s.page().links.map((l) => l.name)).toEqual(["Ok"]);
  });
  it("directories tied in a knot are untied instead of hanging the app", () => {
    const s = write({ directories: [{ id: "a", name: "A", parentId: "b" }, { id: "b", name: "B", parentId: "c" }, { id: "c", name: "C", parentId: "a" }, { id: "self", name: "Self", parentId: "self" }], links: [{ id: "l1", name: "In", port: 1, directoryId: "c" }] });
    const dirs = s.page().directories;
    expect(dirs).toHaveLength(4);
    expect(dirs.filter((d) => d.parentId === null).length).toBeGreaterThanOrEqual(2);
    // every rule that walks up the tree finishes
    expect(s.contents("a").links + s.contents("b").links + s.contents("c").links).toBeGreaterThanOrEqual(1);
    expect(s.createDirectory({ name: "New", parentId: "c" }).parentId).toBe("c");
    expect(s.moveDirectory("self", { parentId: "a" }).parentId).toBe("a");
  });
});

describe("export and import", () => {
  const build = () => {
    const lab = svc.createDirectory({ name: "Home lab" }); const cams = svc.createDirectory({ name: "Cameras", parentId: lab.id });
    svc.createLink({ name: "MBM", port: 3030, description: "Ledger" });
    svc.createLink({ name: "NAS", local: false, url: "nas.local:5001", directoryId: lab.id, health: { enabled: false } });
    svc.createLink({ name: "Cam", local: false, url: "192.168.1.61", directoryId: cams.id });
    return svc.exportDocument();
  };
  it("replace: the page becomes the document, structure and order kept", () => {
    const doc = build();
    const other = new Service(scratchConfig(scratchDir()));
    other.createLink({ name: "Old", port: 9 });
    expect(other.importDocument(doc, "replace")).toEqual({ directories: 2, links: 3 });
    const p = other.page();
    expect(names(p.links).sort()).toEqual(["Cam", "MBM", "NAS"]);
    const lab = p.directories.find((d) => d.name === "Home lab")!; const cams = p.directories.find((d) => d.name === "Cameras")!;
    expect(cams.parentId).toBe(lab.id);
    expect(p.links.find((l) => l.name === "NAS")).toMatchObject({ directoryId: lab.id, url: "http://nas.local:5001", health: { enabled: false, path: "" } });
    expect(p.links.find((l) => l.name === "Cam")!.directoryId).toBe(cams.id);
    expect(p.links.find((l) => l.name === "MBM")).toMatchObject({ directoryId: null, description: "Ledger", port: 3030 });
  });
  it("add: what is here stays, the document's things arrive alongside with new ids", () => {
    const doc = build();
    expect(svc.importDocument(doc, "add")).toEqual({ directories: 2, links: 3 });
    const p = svc.page();
    expect(p.links).toHaveLength(6); expect(p.directories).toHaveLength(4);
    expect(new Set(p.links.map((l) => l.id)).size).toBe(6);
    expect(linksIn(null)).toEqual(["MBM", "MBM"]); expect(dirsIn(null)).toEqual(["Home lab", "Home lab"]);
    expect(p.links.filter((l) => l.directoryId === null).map((l) => l.position)).toEqual([0, 1]);
  });
  it("refuses a file that is not an export, or one with a link that can't be opened — and changes nothing", () => {
    svc.createLink({ name: "Here", port: 1 });
    expect(fail(() => svc.importDocument({ hello: 1 }, "replace"))).toMatch(/not an App Router export/);
    expect(fail(() => svc.importDocument(null, "replace"))).toMatch(/not an App Router export/);
    const bad = { format: "app-router-links", version: 1, directories: [], links: [{ name: "Bad", local: false, url: "ftp://x" }] };
    expect(fail(() => svc.importDocument(bad, "replace"))).toMatch(/Link 1 \(“Bad”\) can't be imported: Only http/);
    expect(names(svc.page().links)).toEqual(["Here"]);
  });
  it("refuses entries that are not records, two directories with one id, and nesting deeper than 8 — and changes nothing", () => {
    svc.createLink({ name: "Here", port: 1 });
    const base = { format: "app-router-links", version: 1 };
    expect(fail(() => svc.importDocument({ ...base, directories: [], links: [null] }, "replace"))).toMatch(/Entry 1 under “links” in that file is not a link/);
    expect(fail(() => svc.importDocument({ ...base, directories: [{ id: "a", name: "A" }, "x"], links: [] }, "add"))).toMatch(/Entry 2 under “directories” in that file is not a directory/);
    expect(fail(() => svc.importDocument({ ...base, directories: [{ id: "a", name: "A" }, { id: "a", name: "B" }], links: [] }, "add"))).toMatch(/same id/);
    const deep = Array.from({ length: 9 }, (_, i) => ({ id: `d${i}`, name: `L${i + 1}`, parentId: i ? `d${i - 1}` : null }));
    expect(fail(() => svc.importDocument({ ...base, directories: deep, links: [] }, "replace"))).toMatch(/more than 8 deep/);
    expect(svc.importDocument({ ...base, directories: deep.slice(0, 8), links: [] }, "add")).toEqual({ directories: 8, links: 0 });
    expect(names(svc.page().links)).toEqual(["Here"]);
  });
  it("a hand-edited loop of directories is flattened instead of hanging", () => {
    const doc = { format: "app-router-links", version: 1, links: [],
      directories: [{ id: "a", name: "A", parentId: "b", position: 0 }, { id: "b", name: "B", parentId: "a", position: 0 }] };
    svc.importDocument(doc, "replace");
    expect(svc.page().directories.some((d) => d.parentId === null)).toBe(true);
    expect(svc.page().directories).toHaveLength(2);
  });
});
