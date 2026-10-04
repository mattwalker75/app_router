/**
 * Where links and directories are kept: one JSON file (data/links.json),
 * read once at start and rewritten atomically after every change. It is small
 * (a launcher holds tens of links, not thousands), so there is no database.
 *
 * This file only reads and writes. Every rule is in service.ts.
 */
import fs from "node:fs";
import type { Directory, Link, LinksDocument } from "../../shared/types.js";
import { UserError, writeAtomic } from "./util.js";

export const EMPTY = (): LinksDocument => ({ format: "app-router-links", version: 1, directories: [], links: [] });

export class Store {
  private doc: LinksDocument = EMPTY();

  constructor(readonly file: string) { this.load(); }

  load(): void {
    if (!fs.existsSync(this.file)) { this.doc = EMPTY(); return; }
    let raw: unknown;
    try { raw = JSON.parse(fs.readFileSync(this.file, "utf8")); }
    catch (e) { throw new UserError(`The links file ${this.file} is not valid JSON (${(e as Error).message}). Fix it, or move it away to start with an empty page.`, 500); }
    const d = raw as Partial<LinksDocument> | null;
    if (!d || !Array.isArray(d.directories) || !Array.isArray(d.links)) throw new UserError(`The links file ${this.file} does not look like an App Router file. Move it away to start with an empty page.`, 500);
    this.doc = { format: "app-router-links", version: 1, directories: d.directories as Directory[], links: d.links as Link[] };
  }

  get directories(): Directory[] { return this.doc.directories; }
  get links(): Link[] { return this.doc.links; }
  document(): LinksDocument { return structuredClone(this.doc); }

  replace(doc: LinksDocument): void { this.doc = structuredClone(doc); this.save(); }

  save(): void { writeAtomic(this.file, JSON.stringify(this.doc, null, 2) + "\n"); }
}
