/**
 * Every rule about links and directories, written once:
 *
 *  - what a link must have (a name; a port when the app is on this computer,
 *    a full address when it is elsewhere), and how what you type is tidied;
 *  - order: each directory (and the main page) keeps its links in the order
 *    you put them, and its sub-directories likewise;
 *  - moving: a link can go to any directory; a directory can go into any
 *    other, except into itself or something inside it;
 *  - deleting a directory deletes what is in it — so a directory that is not
 *    empty needs the word DELETE;
 *  - pictures for links are files in the icons folder;
 *  - export and import of the whole page as one JSON document.
 *
 * Whether changes are allowed at all (Settings → Page → Allow changes) is
 * checked in app.ts, before any of this runs.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { withScheme } from "../../shared/address.js";
import type { Directory, Link, LinkInput, LinksDocument, PageData } from "../../shared/types.js";
import type { Config } from "./config.js";
import { EMPTY, Store } from "./store.js";
import { newId, now, UserError } from "./util.js";

const MAX_DEPTH = 8;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
export const MAX_ICON_BYTES = 1024 * 1024;

const byPosition = <T extends { position: number; name: string }>(a: T, b: T) => a.position - b.position || a.name.localeCompare(b.name);

function text(v: unknown, what: string, max: number, required = false): string {
  const s = String(v ?? "").trim();
  if (required && !s) throw new UserError(`${what} can't be empty.`);
  if (s.length > max) throw new UserError(`Keep ${what.toLowerCase()} under ${max} characters.`);
  return s;
}
function portNumber(v: unknown, what: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new UserError(`${what} must be a whole number from 1 to 65535.`);
  return n;
}

/** "example.com" → "https://example.com"; "192.168.1.1", "nas.local" and "printer" → "http://…". */
export function tidyAddress(raw: unknown): string {
  let s = String(raw ?? "").trim();
  if (!s) throw new UserError("Enter the address the link opens, for example https://example.com.");
  if (s.length > 2000) throw new UserError("That address is too long.");
  s = withScheme(s);
  if (!/^https?:\/\//i.test(s)) throw new UserError("Only http:// and https:// addresses can be opened from App Router.");
  let u: URL;
  try { u = new URL(s); } catch { throw new UserError(`“${String(raw).trim()}” is not an address a browser can open. Use something like https://example.com or 192.168.1.20.`); }
  if (!u.hostname) throw new UserError("That address has no computer name in it.");
  return s;
}

function tidyPath(raw: unknown, what: string): string {
  let s = String(raw ?? "").trim();
  if (!s || s === "/") return "";
  if (/\s/.test(s)) throw new UserError(`${what} can't contain spaces.`);
  if (s.includes("://")) throw new UserError(`${what} is only the part after the port, such as /admin.`);
  if (!s.startsWith("/")) s = "/" + s;
  if (s.length > 500) throw new UserError(`${what} is too long.`);
  return s;
}

function tidyCheck(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) { try { new URL(s); } catch { throw new UserError("The address to check is not a valid address."); } if (s.length > 2000) throw new UserError("The address to check is too long."); return s; }
  if (s.includes("://")) throw new UserError("The address to check must start with http:// or https://, or be a path such as /api/health.");
  return tidyPath(s, "The address to check");
}

export class Service {
  readonly store: Store;
  private listeners: (() => void)[] = [];

  /** like the links file, the pictures folder is fixed when the server starts (a changed path needs a restart) */
  private readonly icons: string;

  constructor(readonly config: Config) {
    this.store = new Store(config.resolve(config.get().data.file));
    this.icons = config.resolve(config.get().data.iconsDir);
  }

  /** Called after every change to links or directories (the health checker listens). */
  onChange(fn: () => void): void { this.listeners.push(fn); }
  private changed(): void { this.store.save(); for (const fn of this.listeners) { try { fn(); } catch {} } }

  dataFile(): string { return this.store.file; }
  iconsDir(): string { return this.icons; }

  page(): PageData {
    return { directories: [...this.store.directories].sort(byPosition), links: [...this.store.links].sort(byPosition) };
  }

  // ------------------------------------------------------------------ helpers
  private dir(id: string): Directory {
    const d = this.store.directories.find((x) => x.id === id);
    if (!d) throw new UserError("That directory no longer exists. Reload the page.", 404);
    return d;
  }
  private link(id: string): Link {
    const l = this.store.links.find((x) => x.id === id);
    if (!l) throw new UserError("That link no longer exists. Reload the page.", 404);
    return l;
  }
  private parentOf(v: unknown): string | null {
    if (v === null || v === undefined || v === "" || v === "root") return null;
    return this.dir(String(v)).id;
  }
  private depthOf(id: string | null): number { let n = 0; for (let d = id; d; d = this.dir(d).parentId) n++; return n; }
  /** `id` and every directory inside it. */
  private within(id: string): Set<string> {
    const out = new Set([id]);
    for (let grew = true; grew; ) { grew = false; for (const d of this.store.directories) if (d.parentId && out.has(d.parentId) && !out.has(d.id)) { out.add(d.id); grew = true; } }
    return out;
  }
  private heightOf(id: string): number {
    const kids = this.store.directories.filter((d) => d.parentId === id);
    return 1 + Math.max(0, ...kids.map((k) => this.heightOf(k.id)));
  }
  private siblingDirs(parentId: string | null): Directory[] { return this.store.directories.filter((d) => d.parentId === parentId).sort(byPosition); }
  private siblingLinks(directoryId: string | null): Link[] { return this.store.links.filter((l) => l.directoryId === directoryId).sort(byPosition); }
  private static renumber(list: { position: number }[]): void { list.forEach((x, i) => { x.position = i; }); }
  private static place<T>(list: T[], item: T, index: unknown): T[] {
    const rest = list.filter((x) => x !== item);
    const n = Number(index);
    const at = Number.isInteger(n) ? Math.min(Math.max(n, 0), rest.length) : rest.length;
    rest.splice(at, 0, item);
    return rest;
  }

  // ------------------------------------------------------------------ directories
  createDirectory(input: { name?: unknown; parentId?: unknown }): Directory {
    const name = text(input.name, "The directory name", 80, true);
    const parentId = this.parentOf(input.parentId);
    if (this.depthOf(parentId) + 1 > MAX_DEPTH) throw new UserError(`Directories can be nested ${MAX_DEPTH} deep at most.`);
    const d: Directory = { id: newId(), name, parentId, position: this.siblingDirs(parentId).length, createdAt: now(), updatedAt: now() };
    this.store.directories.push(d);
    this.changed();
    return d;
  }

  renameDirectory(id: string, input: { name?: unknown }): Directory {
    const d = this.dir(id);
    d.name = text(input.name, "The directory name", 80, true);
    d.updatedAt = now();
    this.changed();
    return d;
  }

  /** Put a directory under `parentId` (null = the main page) at `index` among its new siblings. */
  moveDirectory(id: string, to: { parentId?: unknown; index?: unknown }): Directory {
    const d = this.dir(id);
    const parentId = to.parentId === undefined ? d.parentId : this.parentOf(to.parentId);
    if (parentId && this.within(id).has(parentId)) throw new UserError("A directory can't be moved into itself or into a directory inside it.");
    if (this.depthOf(parentId) + this.heightOf(id) > MAX_DEPTH) throw new UserError(`Directories can be nested ${MAX_DEPTH} deep at most.`);
    const from = d.parentId;
    d.parentId = parentId; d.updatedAt = now();
    Service.renumber(Service.place(this.siblingDirs(parentId), d, to.index));
    if (from !== parentId) Service.renumber(this.siblingDirs(from));
    this.changed();
    return d;
  }

  /** What deleting this directory would take with it. */
  contents(id: string): { directories: number; links: number } {
    const inside = this.within(this.dir(id).id);
    return { directories: inside.size - 1, links: this.store.links.filter((l) => l.directoryId && inside.has(l.directoryId)).length };
  }

  deleteDirectory(id: string, confirm?: unknown): { directories: number; links: number } {
    const d = this.dir(id);
    const c = this.contents(id);
    if ((c.links || c.directories) && confirm !== "DELETE")
      throw new UserError(`“${d.name}” is not empty. Type DELETE to remove it together with ${describe(c)}.`, 409, c);
    const inside = this.within(id);
    for (const l of this.store.links.filter((x) => x.directoryId && inside.has(x.directoryId))) this.dropIconFile(l.icon.image);
    this.store.links.splice(0, this.store.links.length, ...this.store.links.filter((l) => !(l.directoryId && inside.has(l.directoryId))));
    this.store.directories.splice(0, this.store.directories.length, ...this.store.directories.filter((x) => !inside.has(x.id)));
    Service.renumber(this.siblingDirs(d.parentId));
    this.changed();
    return c;
  }

  // ------------------------------------------------------------------ links
  /** Check and tidy what was typed. `base` is the link being changed, or nothing for a new one. */
  private tidy(input: LinkInput, base?: Link): Omit<Link, "id" | "position" | "createdAt" | "updatedAt"> {
    const has = (k: keyof LinkInput) => k in input && input[k] !== undefined;
    const local = has("local") ? !!input.local : base?.local ?? true;
    const name = has("name") ? text(input.name, "The name", 80, true) : base?.name ?? text("", "The name", 80, true);
    const description = has("description") ? text(input.description, "The description", 200) : base?.description ?? "";
    const directoryId = has("directoryId") ? this.parentOf(input.directoryId) : base?.directoryId ?? null;
    const openIn = has("openIn") ? (input.openIn === "same" ? "same" : "new") : base?.openIn ?? "new";
    let scheme: Link["scheme"] = "http", port: number | null = null, p = "", url = "";
    if (local) {
      scheme = (has("scheme") ? input.scheme : base?.scheme) === "https" ? "https" : "http";
      const rawPort = has("port") ? input.port : base?.local ? base.port : null;
      if (rawPort === null || rawPort === undefined || String(rawPort).trim() === "") throw new UserError("Enter the port the app listens on, for example 3030.");
      port = portNumber(rawPort, "The port");
      p = has("path") ? tidyPath(input.path, "The path") : base?.local ? base.path : "";
    } else {
      url = tidyAddress(has("url") ? input.url : base && !base.local ? base.url : "");
      const rawPort = has("port") ? input.port : base && !base.local ? base.port : null;
      port = rawPort === null || rawPort === undefined || String(rawPort).trim() === "" ? null : portNumber(rawPort, "The port");
    }
    const iconText = input.icon && "text" in input.icon ? text(input.icon.text, "The tile letters", 3) : base?.icon.text ?? "";
    let color = input.icon && "color" in input.icon ? String(input.icon.color ?? "").trim().toLowerCase() : base?.icon.color ?? "";
    if (color && !/^#[0-9a-f]{6}$/.test(color)) throw new UserError("The tile colour must look like #2b59d9.");
    const health = {
      enabled: input.health && "enabled" in input.health ? !!input.health.enabled : base?.health.enabled ?? true,
      path: input.health && "path" in input.health ? tidyCheck(input.health.path) : base?.health.path ?? "",
    };
    return { name, description, directoryId, local, scheme, port, path: p, url, openIn, icon: { text: iconText, color, image: base?.icon.image ?? null }, health };
  }

  createLink(input: LinkInput): Link {
    const v = this.tidy(input || {});
    const l: Link = { id: newId(), ...v, position: this.siblingLinks(v.directoryId).length, createdAt: now(), updatedAt: now() };
    this.store.links.push(l);
    this.changed();
    return l;
  }

  updateLink(id: string, input: LinkInput): Link {
    const l = this.link(id);
    const from = l.directoryId;
    const v = this.tidy(input || {}, l);
    Object.assign(l, v, { updatedAt: now() });
    if (from !== l.directoryId) { // moved by the Directory box: goes to the end of its new place
      Service.renumber(Service.place(this.siblingLinks(l.directoryId), l, undefined));
      Service.renumber(this.siblingLinks(from));
    }
    this.changed();
    return l;
  }

  /** Put a link in `directoryId` (null = the main page) at `index`. */
  moveLink(id: string, to: { directoryId?: unknown; index?: unknown }): Link {
    const l = this.link(id);
    const directoryId = to.directoryId === undefined ? l.directoryId : this.parentOf(to.directoryId);
    const from = l.directoryId;
    l.directoryId = directoryId; l.updatedAt = now();
    Service.renumber(Service.place(this.siblingLinks(directoryId), l, to.index));
    if (from !== directoryId) Service.renumber(this.siblingLinks(from));
    this.changed();
    return l;
  }

  deleteLink(id: string): void {
    const l = this.link(id);
    this.dropIconFile(l.icon.image);
    this.store.links.splice(this.store.links.indexOf(l), 1);
    Service.renumber(this.siblingLinks(l.directoryId));
    this.changed();
  }

  // ------------------------------------------------------------------ pictures
  private dropIconFile(name: string | null): void {
    if (!name) return;
    try { fs.rmSync(path.join(this.iconsDir(), path.basename(name)), { force: true }); } catch {}
  }

  setIcon(id: string, body: unknown, contentType: unknown): Link {
    const l = this.link(id);
    const ext = IMAGE_TYPES[String(contentType || "").split(";")[0].trim().toLowerCase()];
    if (!ext) throw new UserError("Choose a PNG, JPEG, WebP or GIF picture.");
    if (!Buffer.isBuffer(body) || !body.length) throw new UserError("Choose a picture first.");
    if (body.length > MAX_ICON_BYTES) throw new UserError("That picture is larger than 1 MB. Choose a smaller one.", 413);
    fs.mkdirSync(this.iconsDir(), { recursive: true });
    const name = `${l.id}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    fs.writeFileSync(path.join(this.iconsDir(), name), body);
    this.dropIconFile(l.icon.image);
    l.icon.image = name; l.updatedAt = now();
    this.changed();
    return l;
  }

  removeIcon(id: string): Link {
    const l = this.link(id);
    this.dropIconFile(l.icon.image);
    l.icon.image = null; l.updatedAt = now();
    this.changed();
    return l;
  }

  /** The file for /icons/<name>, or null when there is no such picture. */
  iconFile(name: string): string | null {
    if (!/^[a-z0-9]+-[a-f0-9]{8}\.(png|jpg|webp|gif)$/.test(name)) return null;
    const f = path.join(this.iconsDir(), name);
    return fs.existsSync(f) ? f : null;
  }

  // ------------------------------------------------------------------ export / import
  exportDocument(): LinksDocument { return this.store.document(); }

  /**
   * Bring in an exported document. "replace" swaps the whole page for it;
   * "add" keeps what is here and adds the document's directories and links
   * alongside (with new ids). Uploaded pictures are not part of an export.
   */
  importDocument(raw: unknown, mode: "replace" | "add"): { directories: number; links: number } {
    const d = raw as Partial<LinksDocument> | null;
    if (!d || typeof d !== "object" || d.format !== "app-router-links" || !Array.isArray(d.directories) || !Array.isArray(d.links))
      throw new UserError("That file is not an App Router export. Choose a file made with Settings → Backup → Export.");
    const keep = mode === "add" ? this.store.document() : EMPTY();
    const ids = new Map<string, string>();
    const idFor = (old: unknown) => { const k = String(old); if (!ids.has(k)) ids.set(k, newId()); return ids.get(k)!; };
    const known = new Set(d.directories.map((x) => String((x as Directory)?.id)));
    const dirs: Directory[] = d.directories.map((x, i) => {
      const s = x as Partial<Directory>;
      return { id: idFor(s.id), name: text(s.name, `The name of directory ${i + 1}`, 80, true),
        parentId: s.parentId && known.has(String(s.parentId)) ? idFor(s.parentId) : null,
        position: Number.isFinite(Number(s.position)) ? Number(s.position) : i, createdAt: String(s.createdAt || now()), updatedAt: now() };
    });
    // a file edited by hand could make a directory its own ancestor: such a directory goes to the main page
    const parent = new Map(dirs.map((x) => [x.id, x.parentId]));
    for (const x of dirs) { const seen = new Set([x.id]); for (let p = x.parentId; p; p = parent.get(p) ?? null) { if (seen.has(p)) { x.parentId = null; parent.set(x.id, null); break; } seen.add(p); } }
    const links: Link[] = d.links.map((x, i) => {
      const s = x as Partial<Link>;
      let v;
      try {
        // the directory is set afterwards: it belongs to the document, not (yet) to this page
        v = this.tidy({ name: s.name, description: s.description, local: s.local, scheme: s.scheme, port: s.port, path: s.path, url: s.url, openIn: s.openIn,
          icon: { text: s.icon?.text ?? "", color: s.icon?.color ?? "" }, health: { enabled: s.health?.enabled ?? true, path: s.health?.path ?? "" } });
        v.directoryId = s.directoryId && known.has(String(s.directoryId)) ? idFor(s.directoryId) : null;
      } catch (e) { throw new UserError(`Link ${i + 1}${s.name ? ` (“${String(s.name).slice(0, 40)}”)` : ""} can't be imported: ${(e as Error).message}`); }
      return { id: newId(), ...v, position: Number.isFinite(Number(s.position)) ? Number(s.position) : i, createdAt: String(s.createdAt || now()), updatedAt: now() };
    });
    if (mode === "replace") for (const l of this.store.links) this.dropIconFile(l.icon.image);
    // imported top-level directories and main-page links go after what is already there
    const offD = keep.directories.filter((x) => !x.parentId).length, offL = keep.links.filter((x) => !x.directoryId).length;
    for (const x of dirs) if (!x.parentId) x.position += offD;
    for (const x of links) if (!x.directoryId) x.position += offL;
    this.store.replace({ format: "app-router-links", version: 1, directories: [...keep.directories, ...dirs], links: [...keep.links, ...links] });
    for (const p of new Set<string | null>([null, ...this.store.directories.map((x) => x.id)])) { Service.renumber(this.siblingDirs(p)); Service.renumber(this.siblingLinks(p)); }
    this.changed();
    return { directories: dirs.length, links: links.length };
  }
}

export function describe(c: { directories: number; links: number }): string {
  const parts = [];
  if (c.links) parts.push(`${c.links} link${c.links === 1 ? "" : "s"}`);
  if (c.directories) parts.push(`${c.directories} director${c.directories === 1 ? "y" : "ies"}`);
  return parts.join(" and ") || "nothing";
}
