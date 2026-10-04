/** The page's directories and links as a tree, with the lookups the screen needs. */
import type { Directory, Link, PageData } from "../../../shared/types";

const byPosition = <T extends { position: number; name: string }>(a: T, b: T) => a.position - b.position || a.name.localeCompare(b.name);

export interface Tree {
  page: PageData;
  dir(id: string | null | undefined): Directory | undefined;
  dirsIn(parentId: string | null): Directory[];
  linksIn(directoryId: string | null): Link[];
  /** the directory's ancestors, outermost first, ending with the directory itself */
  pathOf(id: string | null): Directory[];
  /** every link in the directory and in the directories inside it */
  linksUnder(id: string): Link[];
  /** the directory and everything inside it */
  within(id: string): Set<string>;
  /** every directory, in tree order, for a "which directory?" box */
  options(): { id: string; label: string; depth: number }[];
}

export function buildTree(page: PageData): Tree {
  const dirs = new Map(page.directories.map((d) => [d.id, d]));
  const kids = new Map<string | null, Directory[]>();
  for (const d of page.directories) { const k = d.parentId && dirs.has(d.parentId) ? d.parentId : null; kids.set(k, [...(kids.get(k) || []), d]); }
  for (const list of kids.values()) list.sort(byPosition);
  const links = new Map<string | null, Link[]>();
  for (const l of page.links) { const k = l.directoryId && dirs.has(l.directoryId) ? l.directoryId : null; links.set(k, [...(links.get(k) || []), l]); }
  for (const list of links.values()) list.sort(byPosition);
  const within = (id: string): Set<string> => { const out = new Set([id]); const walk = (p: string) => { for (const d of kids.get(p) || []) { out.add(d.id); walk(d.id); } }; walk(id); return out; };
  return {
    page,
    dir: (id) => (id ? dirs.get(id) : undefined),
    dirsIn: (p) => kids.get(p) || [],
    linksIn: (d) => links.get(d) || [],
    pathOf: (id) => { const out: Directory[] = []; const seen = new Set<string>(); for (let d = id ? dirs.get(id) : undefined; d && !seen.has(d.id); d = d.parentId ? dirs.get(d.parentId) : undefined) { seen.add(d.id); out.unshift(d); } return out; },
    linksUnder: (id) => { const inside = within(id); return page.links.filter((l) => l.directoryId && inside.has(l.directoryId)); },
    within,
    options: () => { const out: { id: string; label: string; depth: number }[] = []; const walk = (p: string | null, depth: number) => { for (const d of kids.get(p) || []) { out.push({ id: d.id, label: d.name, depth }); walk(d.id, depth + 1); } }; walk(null, 0); return out; },
  };
}

/** Where a directory sits, in words: "Home lab / Cameras". */
export const pathText = (tree: Tree, id: string | null) => tree.pathOf(id).map((d) => d.name).join(" / ");

/** The same move the server makes, applied to the page on screen so a dropped tile stays where it was dropped. */
export function moveLinkLocally(page: PageData, id: string, directoryId: string | null, index: number | null): PageData {
  const links = page.links.map((l) => ({ ...l }));
  const l = links.find((x) => x.id === id);
  if (!l) return page;
  const from = l.directoryId;
  const dest = links.filter((x) => x.directoryId === directoryId && x.id !== id).sort(byPosition);
  l.directoryId = directoryId;
  dest.splice(index === null ? dest.length : Math.min(Math.max(index, 0), dest.length), 0, l);
  dest.forEach((x, i) => { x.position = i; });
  if (from !== directoryId) links.filter((x) => x.directoryId === from).sort(byPosition).forEach((x, i) => { x.position = i; });
  return { ...page, links };
}
export function moveDirectoryLocally(page: PageData, id: string, parentId: string | null, index: number | null): PageData {
  const directories = page.directories.map((d) => ({ ...d }));
  const d = directories.find((x) => x.id === id);
  if (!d) return page;
  const from = d.parentId;
  const dest = directories.filter((x) => x.parentId === parentId && x.id !== id).sort(byPosition);
  d.parentId = parentId;
  dest.splice(index === null ? dest.length : Math.min(Math.max(index, 0), dest.length), 0, d);
  dest.forEach((x, i) => { x.position = i; });
  if (from !== parentId) directories.filter((x) => x.parentId === from).sort(byPosition).forEach((x, i) => { x.position = i; });
  return { ...page, directories };
}
