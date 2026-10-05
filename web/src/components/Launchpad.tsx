/**
 * The page itself: the links on the main page, then one section per
 * top-level directory. A directory inside a directory is a tile; clicking it
 * shows that directory on its own. With "Allow changes to the page" on
 * (Settings → Page) there are buttons to add things, a ⋯ menu on every tile,
 * and tiles can be dragged: onto another tile to reorder, onto a directory to
 * move inside it.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { closestCenter, DndContext, MouseSensor, pointerWithin, TouchSensor, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Folder, FolderInput, FolderPlus, GripVertical, Info, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { checkUrl, displayAddress, linkHref } from "../../../shared/address";
import type { Directory, Link, PageData, StatusReport } from "../../../shared/types";
import { api, errorText } from "../lib/api";
import { lightLabel, lightTitle, plural, tally, tallyVerdict } from "../lib/format";
import { useLocal, useNow, useRefresh, useTouchScreen, type AppState } from "../lib/hooks";
import { buildTree, moveDirectoryLocally, moveLinkLocally, pathText } from "../lib/tree";
import { useConfirm } from "./confirm";
import { DirectoryDialog, type DirectoryDialogState } from "./DirectoryDialogs";
import { LinkDialog, type LinkDialogState } from "./LinkDialog";
import { dragGuard, FolderTile, LightDot, LinkTile, StatusLine } from "./Tiles";
import { Button, cx, IconButton, Menu, type MenuItem } from "./ui";

const ROOT = "root";
const key = (id: string | null) => id ?? ROOT;
const unkey = (k: string) => (k === ROOT ? null : k);

/** Which thing is the dragged tile over? Tiles win over the empty space of a grid, a grid over its section. */
const collision: CollisionDetection = (args) => {
  const kindOf = (id: unknown) => args.droppableContainers.find((c) => c.id === id)?.data.current?.kind as string | undefined;
  const only = (kinds: string[]) => args.droppableContainers.filter((c) => kinds.includes(c.data.current?.kind) && c.id !== args.active.id);
  if (args.active.data.current?.kind === "section") return closestCenter({ ...args, droppableContainers: only(["section"]) });
  const mine = args.active.data.current?.kind as string; // "link" or "folder"
  const hits = pointerWithin(args);
  const tile = hits.find((h) => ["link", "folder"].includes(kindOf(h.id) || "") && h.id !== args.active.id);
  if (tile) return [tile];
  const grid = hits.find((h) => kindOf(h.id) === "grid");
  if (grid) {
    // In the gaps of the grid the tile came from, the nearest tile OF ITS OWN KIND decides the new
    // place. (A link let go in a gap next to a directory tile must not vanish into that directory.)
    const container = args.droppableContainers.find((c) => c.id === grid.id)?.data.current?.container;
    const tiles = only([mine]).filter((c) => c.data.current?.container === container);
    if (args.active.data.current?.container === container && tiles.length) return closestCenter({ ...args, droppableContainers: tiles }).slice(0, 1);
    return [grid];
  }
  const section = hits.find((h) => kindOf(h.id) === "section" && h.id !== args.active.id);
  return section ? [section] : [];
};

function Grid({ container, editing, children, empty }: { container: string; editing: boolean; children: ReactNode; empty?: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `G:${container}`, data: { kind: "grid", container }, disabled: !editing });
  return (
    <div ref={setNodeRef} className={cx("grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-3.5 rounded-[14px]", isOver && editing && "outline-2 outline-dashed outline-offset-4 outline-accent")}>
      {children}{empty}
    </div>
  );
}

const countText = (links: number, dirs: number) => [links || !dirs ? plural(links, "link", "links") : "", dirs ? plural(dirs, "directory", "directories") : ""].filter(Boolean).join(" · ");

export function Launchpad({ state, page, status, query, dirId }: { state: AppState; page: PageData; status: StatusReport | undefined; query: string; dirId: string | null }) {
  const tree = useMemo(() => buildTree(page), [page]);
  const editing = state.config.page.allowEditing;
  const rootName = state.config.page.rootName;
  const hostname = window.location.hostname, computer = state.hostname;
  const now = useNow();
  const qc = useQueryClient();
  const refresh = useRefresh();
  const confirm = useConfirm();
  const touch = useTouchScreen();
  const [collapsed, setCollapsed] = useLocal<string[]>("collapsed", []);
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null);
  const [dirDialog, setDirDialog] = useState<DirectoryDialogState | null>(null);
  // With a mouse a drag starts after moving 8 pixels, so a plain click still opens the link. On a
  // touch screen it starts after holding a tile for a quarter of a second, so a swipe still scrolls.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  // an address for a directory that is gone (deleted elsewhere, or an old bookmark): back to the main page
  const gone = !!dirId && !tree.dir(dirId);
  useEffect(() => { if (gone) window.location.replace("#/"); }, [gone]);

  const lightOf = (l: Link) => status?.links[l.id]?.light;
  const verdictFor = (d: Directory) => tallyVerdict(tally(tree.linksUnder(d.id).map(lightOf)));
  const summaryFor = (d: Directory) => countText(tree.linksUnder(d.id).length, tree.within(d.id).size - 1);

  // ---------------------------------------------------------------- changes
  /** Do it, say so, refresh. Answers whether it worked. */
  const run = async (what: () => Promise<unknown>, done?: string): Promise<boolean> => {
    try { await what(); if (done) toast(done); return true; } catch (e) { toast.error(errorText(e)); return false; } finally { await refresh(); }
  };
  const moveLink = (l: Link, directoryId: string | null, index: number | null) => {
    qc.setQueryData<PageData>(["page"], (p) => (p ? moveLinkLocally(p, l.id, directoryId, index) : p));
    return run(() => api.post(`/api/links/${l.id}/move`, { directoryId: directoryId ?? "root", ...(index === null ? {} : { index }) }));
  };
  const moveDir = (d: Directory, parentId: string | null, index: number | null) => {
    qc.setQueryData<PageData>(["page"], (p) => (p ? moveDirectoryLocally(p, d.id, parentId, index) : p));
    return run(() => api.post(`/api/directories/${d.id}/move`, { parentId: parentId ?? "root", ...(index === null ? {} : { index }) }));
  };
  const deleteLink = async (l: Link) => {
    if (!(await confirm({ title: `Delete “${l.name}”?`, message: "The link is removed from the page. The app it points to is not touched.", confirmLabel: "Delete link", danger: true }))) return;
    setLinkDialog(null);
    await run(() => api.del(`/api/links/${l.id}`), `Deleted “${l.name}”.`);
  };
  const deleteDir = async (d: Directory) => {
    const links = tree.linksUnder(d.id).length, dirs = tree.within(d.id).size - 1;
    const inside = [links ? plural(links, "link", "links") : "", dirs ? plural(dirs, "directory", "directories") : ""].filter(Boolean).join(" and ");
    const ok = inside
      ? await confirm({ title: `Delete “${d.name}” and everything in it?`, message: <>This also deletes the <b>{inside}</b> inside it. This can't be undone (Settings → Backup can export the page first).</>, confirmLabel: "Delete directory", danger: true, typeToConfirm: "DELETE" })
      : await confirm({ title: `Delete “${d.name}”?`, message: "The directory is empty.", confirmLabel: "Delete directory", danger: true });
    if (!ok) return;
    const gone = await run(() => api.del(`/api/directories/${d.id}`, inside ? { confirm: "DELETE" } : undefined), `Deleted “${d.name}”.`);
    if (gone && dirId && tree.within(d.id).has(dirId)) window.location.hash = d.parentId ? `#/d/${d.parentId}` : "#/";
  };

  // Everything a tile leaves out or cuts short — where the link goes, the whole description, why a
  // light is red. A mouse shows some of it on hover; a finger has nothing to hover with.
  const details = (l: Link): MenuItem => ({ label: "Details…", icon: <Info size={15} />, onSelect: () => {
    const st = status?.links[l.id];
    const row = (label: string, value: ReactNode) => <div className="flex flex-col gap-0.5"><dt className="text-[12.5px] font-semibold text-mute">{label}</dt><dd className="m-0 [overflow-wrap:anywhere]">{value}</dd></div>;
    void confirm({ title: l.name, infoOnly: true, message: (
      <dl className="m-0 flex flex-col gap-3 text-[14.5px] text-ink">
        {l.description && row("Description", l.description)}
        {row("Opens", <><span className="font-mono text-[13.5px]">{linkHref(l, hostname)}</span><span className="block text-[13px] text-mute">{l.local ? `An app on this computer (${computer}), port ${l.port}.` : "Somewhere else."} Opens in {l.openIn === "same" ? "the same tab" : "a new tab"}.</span></>)}
        {row("Where it is on the page", l.directoryId ? pathText(tree, l.directoryId) : `${rootName} (the main page)`)}
        {row("Status", <><StatusLine status={st} now={Date.now()} />{st && lightTitle(st) && <span className="mt-0.5 block text-[13.5px] text-ink-2">{lightTitle(st)}</span>}
          {l.health.enabled && state.config.health.enabled && <span className="mt-0.5 block text-[13px] text-mute">Checks <span className="font-mono text-[12.5px]">{checkUrl(l)}</span></span>}</>)}
      </dl>
    ) });
  } });
  const linkMenu = (l: Link, siblings: Link[]): (MenuItem | "sep")[] => {
    const i = siblings.findIndex((x) => x.id === l.id);
    return [
      details(l),
      { label: "Change…", icon: <Pencil size={15} />, onSelect: () => setLinkDialog({ link: l, directoryId: l.directoryId }) },
      { label: "Move earlier", icon: <ArrowUp size={15} />, disabled: i <= 0, onSelect: () => moveLink(l, l.directoryId, i - 1) },
      { label: "Move later", icon: <ArrowDown size={15} />, disabled: i < 0 || i >= siblings.length - 1, onSelect: () => moveLink(l, l.directoryId, i + 1) },
      "sep",
      { label: "Delete…", icon: <Trash2 size={15} />, danger: true, onSelect: () => deleteLink(l) },
    ];
  };
  const dirMenu = (d: Directory): (MenuItem | "sep")[] => {
    const siblings = tree.dirsIn(d.parentId); const i = siblings.findIndex((x) => x.id === d.id);
    return [
      { label: "Add a link here…", icon: <Plus size={15} />, onSelect: () => setLinkDialog({ directoryId: d.id }) },
      { label: "New directory inside…", icon: <FolderPlus size={15} />, onSelect: () => setDirDialog({ mode: "new", parentId: d.id }) },
      "sep",
      { label: "Rename…", icon: <Pencil size={15} />, onSelect: () => setDirDialog({ mode: "rename", dir: d }) },
      { label: "Move to…", icon: <FolderInput size={15} />, onSelect: () => setDirDialog({ mode: "move", dir: d }) },
      { label: "Move earlier", icon: <ArrowUp size={15} />, disabled: i <= 0, onSelect: () => moveDir(d, d.parentId, i - 1) },
      { label: "Move later", icon: <ArrowDown size={15} />, disabled: i < 0 || i >= siblings.length - 1, onSelect: () => moveDir(d, d.parentId, i + 1) },
      "sep",
      { label: "Delete…", icon: <Trash2 size={15} />, danger: true, onSelect: () => deleteDir(d) },
    ];
  };

  // ---------------------------------------------------------------- drag and drop
  const onDragEnd = (e: DragEndEvent) => {
    dragGuard.active = false; dragGuard.endedAt = Date.now();
    const a = e.active.data.current as { kind: string; id: string; container: string } | undefined;
    const o = e.over?.data.current as { kind: string; id?: string; container: string } | undefined;
    if (!a || !o || e.active.id === e.over?.id) return;
    if (a.kind === "link") {
      const l = page.links.find((x) => x.id === a.id); if (!l) return;
      if (o.kind === "link") { const target = unkey(o.container); const at = tree.linksIn(target).findIndex((x) => x.id === o.id); void moveLink(l, target, at < 0 ? null : at); }
      else if ((o.kind === "folder" || o.kind === "section") && o.id && o.id !== l.directoryId) void moveLink(l, o.id, null);
      else if (o.kind === "grid") void moveLink(l, unkey(o.container), null);
      return;
    }
    const d = page.directories.find((x) => x.id === a.id); if (!d) return;
    if (a.kind === "section") { // a top-level directory, dragged by its handle among the others
      if (o.kind === "section" && o.id) { const at = tree.dirsIn(null).findIndex((x) => x.id === o.id); if (at >= 0) void moveDir(d, null, at); }
      return;
    }
    if (o.kind === "folder" && o.id) {
      if (o.container === a.container) { const at = tree.dirsIn(d.parentId).findIndex((x) => x.id === o.id); if (at >= 0) void moveDir(d, d.parentId, at); }
      else if (!tree.within(d.id).has(o.id)) void moveDir(d, o.id, null);
    } else if (o.kind === "section" && o.id && o.id !== d.parentId && !tree.within(d.id).has(o.id)) void moveDir(d, o.id, null);
    else if (o.kind === "grid" || o.kind === "link") {
      // let go over a section's free space, or over one of its links: the directory goes to where those are
      const target = unkey(o.container);
      if (target !== d.parentId && !(target && tree.within(d.id).has(target))) void moveDir(d, target, null);
    }
  };

  // ---------------------------------------------------------------- pieces
  const tilesFor = (directoryId: string | null, showFolders: boolean) => {
    const dirs = showFolders ? tree.dirsIn(directoryId) : [];
    const links = tree.linksIn(directoryId);
    const container = key(directoryId);
    return {
      count: dirs.length + links.length, links, dirs,
      ids: [...dirs.map((d) => `D:${d.id}`), ...links.map((l) => `L:${l.id}`)],
      nodes: <>
        {dirs.map((d) => <FolderTile key={d.id} dir={d} summary={summaryFor(d)} verdict={verdictFor(d)} container={container} editing={editing} menu={dirMenu(d)} />)}
        {links.map((l) => <LinkTile key={l.id} link={l} status={status?.links[l.id]} now={now} hostname={hostname} computer={computer} container={container} editing={editing} menu={editing ? linkMenu(l, links) : touch ? [details(l)] : undefined} />)}
      </>,
    };
  };
  const addButtons = (directoryId: string | null) => editing && (
    <div className="ml-auto flex flex-wrap gap-2.5">
      <Button icon={<FolderPlus size={17} />} onClick={() => setDirDialog({ mode: "new", parentId: directoryId })}>New directory</Button>
      <Button variant="primary" icon={<Plus size={17} strokeWidth={2.4} />} onClick={() => setLinkDialog({ directoryId })}>Add link</Button>
    </div>
  );
  const dropHint = (text: string) => editing ? <div className="col-span-full rounded-[14px] border border-dashed border-line-2 px-5 py-6 text-center text-[14px] text-mute">{text}</div> : undefined;
  const dialogs = <>
    {linkDialog && <LinkDialog state={linkDialog} tree={tree} computer={computer} rootName={rootName} onClose={() => setLinkDialog(null)} onDelete={deleteLink} />}
    {dirDialog && <DirectoryDialog state={dirDialog} tree={tree} rootName={rootName} onClose={() => setDirDialog(null)} />}
  </>;
  const wrap = (children: ReactNode) => (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={() => { dragGuard.active = true; }} onDragEnd={onDragEnd}
      onDragCancel={() => { dragGuard.active = false; dragGuard.endedAt = Date.now(); }}>
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 px-4 pb-14 pt-7 sm:px-8">{children}</main>
      {dialogs}
    </DndContext>
  );

  // ---------------------------------------------------------------- search results
  const q = query.trim().toLowerCase();
  if (q) {
    const hit = (s: string) => s.toLowerCase().includes(q);
    // the address is searched in full, and as it would open from here (the tile itself does not show it)
    const links = page.links.filter((l) => hit(l.name) || hit(l.description) || hit(displayAddress(l, computer)) || hit(linkHref(l, hostname)) || hit(l.url) || hit(pathText(tree, l.directoryId)));
    const dirs = page.directories.filter((d) => hit(d.name));
    return wrap(
      <section className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline gap-3"><h2 className="text-[20px] font-bold">Search results</h2><span className="min-w-0 text-[13.5px] text-mute [overflow-wrap:anywhere]">{countText(links.length, dirs.length)} for “{query.trim()}”</span></div>
        {links.length + dirs.length === 0
          ? <div className="rounded-[14px] border border-dashed border-line-2 px-6 py-10 text-center text-mute [overflow-wrap:anywhere]">Nothing on the page matches “{query.trim()}”. Search looks at names, descriptions, addresses and directory names.</div>
          : <div className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-3.5">
              {dirs.map((d) => <FolderTile key={d.id} dir={d} summary={summaryFor(d)} verdict={verdictFor(d)} container="search" editing={false} />)}
              {links.map((l) => <LinkTile key={l.id} link={l} status={status?.links[l.id]} now={now} hostname={hostname} computer={computer} container="search" editing={false} menu={touch ? [details(l)] : undefined}
                caption={l.directoryId ? `In ${pathText(tree, l.directoryId)}` : undefined} />)}
            </div>}
      </section>,
    );
  }

  // ---------------------------------------------------------------- one directory on its own
  const here = tree.dir(dirId);
  if (dirId && here) {
    const t = tilesFor(here.id, true);
    const trail = tree.pathOf(here.id);
    return wrap(
      <section className="flex flex-col gap-3.5">
        <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1.5 text-[14px] text-mute">
          <a href="#/" className="rounded px-1 py-0.5 text-accent-text no-underline hover:underline pointer-coarse:py-2.5">{rootName}</a>
          {trail.slice(0, -1).map((d) => <span key={d.id} className="flex min-w-0 items-center gap-1.5"><ChevronRight size={14} className="shrink-0" /><a href={`#/d/${d.id}`} className="rounded px-1 py-0.5 text-accent-text no-underline [overflow-wrap:anywhere] hover:underline pointer-coarse:py-2.5">{d.name}</a></span>)}
          <span className="flex min-w-0 items-center gap-1.5"><ChevronRight size={14} className="shrink-0" /><span className="px-1 text-ink-2 [overflow-wrap:anywhere]">{here.name}</span></span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex min-w-0 items-start gap-3"><Folder size={22} className="mt-0.5 shrink-0 text-mute" aria-hidden /><h2 className="min-w-0 text-[22px] font-bold leading-tight [overflow-wrap:anywhere]">{here.name}</h2></span>
          <span className="text-[13.5px] text-mute">{countText(t.links.length, t.dirs.length)}</span>
          {editing && <Menu items={dirMenu(here).slice(3)} trigger={<IconButton label={`Change ${here.name}`} bordered><MoreHorizontal size={18} /></IconButton>} />}
          {addButtons(here.id)}
        </div>
        <SortableContext items={t.ids} strategy={rectSortingStrategy}>
          <Grid container={key(here.id)} editing={editing} empty={t.count ? undefined : dropHint("This directory is empty. Add a link, or drag one here.")}>{t.nodes}</Grid>
        </SortableContext>
        {!t.count && !editing && <div className="rounded-[14px] border border-dashed border-line-2 px-6 py-10 text-center text-mute">This directory is empty.</div>}
      </section>,
    );
  }

  // ---------------------------------------------------------------- the main page
  const root = tilesFor(null, false);
  const top = tree.dirsIn(null);
  const nothing = !page.links.length && !page.directories.length;
  return wrap(<>
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="min-w-0 text-[22px] font-bold leading-tight [overflow-wrap:anywhere]">{rootName}</h2>
        {!nothing && <span className="text-[13.5px] text-mute">{countText(root.links.length, 0)}</span>}
        {addButtons(null)}
      </div>
      {nothing ? (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-line-2 px-6 py-14 text-center">
          <div className="text-[19px] font-bold">Nothing here yet</div>
          <div className="max-w-[52ch] text-[14.5px] text-mute">
            {editing ? "Add a link for each app you run. For an app on this computer you only need its name and port. Directories group links, like bookmark folders."
              : "Changes to the page are turned off. Turn them on in Settings → Page to add links and directories."}
          </div>
          {editing && <div className="mt-3 flex flex-wrap justify-center gap-2.5">
            <Button icon={<FolderPlus size={17} />} onClick={() => setDirDialog({ mode: "new", parentId: null })}>New directory</Button>
            <Button variant="primary" icon={<Plus size={17} strokeWidth={2.4} />} onClick={() => setLinkDialog({ directoryId: null })}>Add your first link</Button>
          </div>}
        </div>
      ) : (root.count > 0 || editing) && (
        <SortableContext items={root.ids} strategy={rectSortingStrategy}>
          <Grid container={ROOT} editing={editing} empty={root.count ? undefined : dropHint("No links on the main page. Add one, or drag one here.")}>{root.nodes}</Grid>
        </SortableContext>
      )}
    </section>
    <SortableContext items={top.map((d) => `D:${d.id}`)} strategy={verticalListSortingStrategy}>
      {top.map((d) => {
        const t = tilesFor(d.id, true);
        const open = !collapsed.includes(d.id);
        const v = verdictFor(d);
        return (
          <Section key={d.id} dir={d} editing={editing} open={open}
            header={<>
              <a href={`#/d/${d.id}`} className="flex min-w-0 items-center gap-2.5 rounded-lg text-ink no-underline hover:text-accent-text pointer-coarse:py-2">
                <Folder size={20} className="shrink-0 text-mute" aria-hidden /><h2 className="truncate text-[19px] font-bold leading-tight">{d.name}</h2>
              </a>
              <span className="text-[13.5px] text-mute">{summaryFor(d)}</span>
              {tree.linksUnder(d.id).length > 0 && <span className="flex items-center gap-[7px] text-[13px] font-semibold text-ink-2"><LightDot light={v.light} />{v.text}</span>}
              <span className="ml-auto flex items-center gap-2">
                {editing && <IconButton label={`Add a link to ${d.name}`} bordered onClick={() => setLinkDialog({ directoryId: d.id })}><Plus size={18} /></IconButton>}
                {editing && <Menu items={dirMenu(d)} trigger={<IconButton label={`Change ${d.name}`} bordered><MoreHorizontal size={18} /></IconButton>} />}
                <IconButton label={open ? `Collapse ${d.name}` : `Expand ${d.name}`} bordered aria-expanded={open}
                  onClick={() => setCollapsed((c) => (c.includes(d.id) ? c.filter((x) => x !== d.id) : [...c, d.id]))}>
                  {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </IconButton>
              </span>
            </>}>
            {open && (
              <SortableContext items={t.ids} strategy={rectSortingStrategy}>
                <Grid container={key(d.id)} editing={editing} empty={t.count ? undefined : dropHint("This directory is empty. Add a link, or drag one here.")}>{t.nodes}</Grid>
              </SortableContext>
            )}
            {open && !t.count && !editing && <div className="text-[14px] text-mute">This directory is empty.</div>}
          </Section>
        );
      })}
    </SortableContext>
  </>);
}

/** One top-level directory on the main page. With changes on it can be dragged by its handle, and things can be dropped on it. */
function Section({ dir, editing, open, header, children }: { dir: Directory; editing: boolean; open: boolean; header: ReactNode; children: ReactNode }) {
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging, isOver, active } = useSortable({ id: `D:${dir.id}`, data: { kind: "section", id: dir.id, container: "sections" }, disabled: !editing });
  const dropping = isOver && active?.data.current?.kind !== "section";
  return (
    <section ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx("flex flex-col gap-3.5", !open && "rounded-[14px] border border-line bg-surface px-4 py-2", isDragging && "opacity-60", dropping && "rounded-[14px] outline-2 outline-dashed outline-offset-4 outline-accent")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {editing && (
          <button ref={setActivatorNodeRef} type="button" {...listeners} tabIndex={-1} aria-hidden title="Drag to reorder (or use Move earlier / Move later in the ⋯ menu)"
            className="-ml-1.5 inline-flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint hover:text-ink pointer-coarse:-ml-2.5 pointer-coarse:h-11 pointer-coarse:w-10"><GripVertical size={17} /></button>
        )}
        {header}
      </div>
      {children}
    </section>
  );
}
