/** The page's own small rules: what a light says, how a tile is drawn, and that a dropped tile lands where the server puts it. */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { LinkStatus, PageData } from "../shared/types.js";
import { Service } from "../server/src/service.js";
import { colorFor, initials, lightLabel, lightTitle, span, tally, tallyText, tallyVerdict, TILE_COLORS } from "../web/src/lib/format.js";
import { buildTree, moveDirectoryLocally, moveLinkLocally, pathText } from "../web/src/lib/tree.js";
import { scratchConfig, scratchDir } from "./helpers.js";

const now = Date.parse("2026-10-04T12:00:00Z");
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const st = (light: LinkStatus["light"], since: string | null, extra: Partial<LinkStatus> = {}): LinkStatus => ({ light, since, checkedAt: ago(0.2), ms: 18, detail: "Answered in 18 ms", ...extra });

describe("what a light says", () => {
  it("online, back, down, not checked, checking", () => {
    expect(lightLabel(st("online", ago(900)), now)).toBe("Online");
    expect(lightLabel(st("recovered", ago(4)), now)).toBe("Back 4 min ago");
    expect(lightLabel(st("recovered", ago(0.3)), now)).toBe("Back just now");
    expect(lightLabel(st("down", ago(12)), now)).toBe("Down for 12 min");
    expect(lightLabel(st("down", ago(0.5)), now)).toBe("Down");
    expect(lightLabel(st("down", ago(200)), now)).toBe("Down for 3 h");
    expect(lightLabel(st("down", ago(60 * 72)), now)).toBe("Down for 3 days");
    expect(lightLabel(st("unchecked", null), now)).toBe("Not checked");
    expect(lightLabel(st("pending", null), now)).toBe("Checking…");
    expect(lightLabel(undefined, now)).toBe("Checking…");
  });
  it("the hover line gives the reason and how fresh it is", () => {
    expect(lightTitle(st("online", ago(900)), now)).toBe("Answered in 18 ms · checked just now");
    expect(lightTitle(st("down", ago(12), { detail: "No answer — nothing is listening there", checkedAt: ago(2) }), now)).toBe("No answer — nothing is listening there · checked 2 min ago");
    expect(lightTitle(st("unchecked", null, { detail: "Health checks are off for this link", checkedAt: null }), now)).toBe("Health checks are off for this link");
    expect(span(59_000)).toBe("moments"); expect(span(47 * 3600_000)).toBe("47 h"); expect(span(48 * 3600_000)).toBe("2 days");
  });
  it("the summary in the header and on a directory", () => {
    const t = tally(["online", "online", "recovered", "down", "unchecked", undefined]);
    expect(t).toEqual({ online: 2, recovered: 1, down: 1, unchecked: 1, pending: 1 });
    expect(tallyText(t)).toBe("2 online · 1 just back · 1 down");
    expect(tallyText(tally(["unchecked"]))).toBe("");
    expect(tallyVerdict(t)).toEqual({ text: "1 down", light: "down" });
    expect(tallyVerdict(tally(["online", "recovered"]))).toEqual({ text: "1 just back", light: "recovered" });
    expect(tallyVerdict(tally(["online", "online", "unchecked"]))).toEqual({ text: "All online", light: "online" });
    expect(tallyVerdict(tally(["online"]))).toEqual({ text: "Online", light: "online" });
    expect(tallyVerdict(tally(["unchecked"]))).toEqual({ text: "Not checked", light: "unchecked" });
    expect(tallyVerdict(tally([]))).toEqual({ text: "Not checked", light: "unchecked" });
  });
});

describe("a tile without a picture", () => {
  it("shows two letters made from the name", () => {
    expect(initials("My Business Manager")).toBe("MB"); expect(initials("JARVIS")).toBe("JA"); expect(initials("ai_data_depot")).toBe("AD");
    expect(initials("x")).toBe("X"); expect(initials("  ")).toBe("?");
    // an emoji is one character, never half of one
    expect(initials("🎬 Plex")).toBe("🎬P"); expect(initials("🇺🇸")).toBe("🇺🇸"); expect(initials("Éclair")).toBe("ÉC");
  });
  it("always gets the same colour for the same name, from colours white letters read on", () => {
    expect(colorFor("People Manager")).toBe(colorFor("people manager"));
    expect(TILE_COLORS).toContain(colorFor("Anything at all"));
    const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    for (const c of TILE_COLORS) expect(1.05 / (lum(c) + 0.05), `white on ${c}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the tree the page draws", () => {
  const dir = scratchDir(); const svc = new Service(scratchConfig(dir));
  const lab = svc.createDirectory({ name: "Home lab" }); const cams = svc.createDirectory({ name: "Cameras", parentId: lab.id }); svc.createDirectory({ name: "Work" });
  for (const n of ["A", "B", "C"]) svc.createLink({ name: n, port: 1 });
  svc.createLink({ name: "NAS", port: 1, directoryId: lab.id }); svc.createLink({ name: "Cam", port: 1, directoryId: cams.id });
  const page = (): PageData => structuredClone(svc.page());
  const names = (p: PageData, d: string | null) => buildTree(p).linksIn(d).map((l) => l.name);

  it("knows what is where", () => {
    const t = buildTree(page());
    expect(t.dirsIn(null).map((d) => d.name)).toEqual(["Home lab", "Work"]);
    expect(t.linksUnder(lab.id).map((l) => l.name).sort()).toEqual(["Cam", "NAS"]);
    expect(pathText(t, cams.id)).toBe("Home lab / Cameras");
    expect(t.options()).toEqual([{ id: lab.id, label: "Home lab", depth: 0 }, { id: cams.id, label: "Cameras", depth: 1 }, { id: t.dirsIn(null)[1].id, label: "Work", depth: 0 }]);
    expect([...t.within(lab.id)].sort()).toEqual([lab.id, cams.id].sort());
  });
  it("a dropped link lands on screen exactly where the server then puts it", () => {
    const cases: [string, string | null, number | null][] = [["C", null, 0], ["A", null, 2], ["B", lab.id, 0], ["B", null, null], ["A", cams.id, null], ["A", null, 1]];
    for (const [name, to, index] of cases) {
      const before = page();
      const id = before.links.find((l) => l.name === name)!.id;
      const guess = moveLinkLocally(before, id, to, index);
      svc.moveLink(id, { directoryId: to ?? "root", ...(index === null ? {} : { index }) });
      const real = page();
      for (const d of [null, lab.id, cams.id]) expect(names(guess, d), `${name} → ${to ?? "main page"} @${index}`).toEqual(names(real, d));
    }
  });
  it("and so does a dropped directory", () => {
    const before = page();
    const work = before.directories.find((d) => d.name === "Work")!;
    const guess = moveDirectoryLocally(before, work.id, null, 0);
    svc.moveDirectory(work.id, { parentId: "root", index: 0 });
    expect(buildTree(guess).dirsIn(null).map((d) => d.name)).toEqual(buildTree(page()).dirsIn(null).map((d) => d.name));
    expect(buildTree(page()).dirsIn(null).map((d) => d.name)).toEqual(["Work", "Home lab"]);
    const guess2 = moveDirectoryLocally(page(), work.id, lab.id, null);
    svc.moveDirectory(work.id, { parentId: lab.id });
    expect(buildTree(guess2).dirsIn(lab.id).map((d) => d.name)).toEqual(buildTree(page()).dirsIn(lab.id).map((d) => d.name));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
