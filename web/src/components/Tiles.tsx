/**
 * The tiles on the page: a link (click it and you are in the app), a
 * directory (click it to look inside), and the status light they carry.
 */
import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Folder, MoreHorizontal } from "lucide-react";
import { displayAddress, linkHref } from "../../../shared/address";
import type { Directory, Light, Link, LinkStatus } from "../../../shared/types";
import { colorFor, initials, lightLabel, lightTitle } from "../lib/format";
import { cx, Menu, type MenuItem } from "./ui";

const LIGHT_TEXT: Record<Light, string> = { online: "text-ok", recovered: "text-warn", down: "text-danger", unchecked: "text-mute", pending: "text-mute" };

/** The light itself. Each state has its own shape as well as its own colour. */
export function LightDot({ light, size = 10 }: { light: Light; size?: number }) {
  const s = { width: size, height: size };
  if (light === "online") return <span aria-hidden className="shrink-0 rounded-full bg-ok-light" style={s} />;
  if (light === "recovered") return <span aria-hidden className="shrink-0 rounded-full border-[3px] border-warn-light" style={s} />;
  if (light === "down") return <span aria-hidden className="shrink-0 rounded-[2px] bg-danger-light" style={s} />;
  return <span aria-hidden className={cx("shrink-0 rounded-full border-2 border-off-light", light === "pending" && "border-dashed")} style={s} />;
}

export function StatusLine({ status, now }: { status: LinkStatus | undefined; now: number }) {
  const light = status?.light ?? "pending";
  return (
    <span className={cx("flex items-center gap-[7px] text-[13px] font-semibold", LIGHT_TEXT[light])} title={lightTitle(status, now)}>
      <LightDot light={light} />{lightLabel(status, now)}
    </span>
  );
}

export function TileIcon({ link, size = 48 }: { link: Pick<Link, "name" | "icon">; size?: number }) {
  if (link.icon.image) return <img src={`/icons/${link.icon.image}`} alt="" width={size} height={size} draggable={false} className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />;
  return (
    <span aria-hidden className="flex shrink-0 select-none items-center justify-center rounded-xl font-bold text-white"
      style={{ width: size, height: size, background: link.icon.color || colorFor(link.name), fontSize: Math.round(size * 0.35) }}>
      {link.icon.text || initials(link.name)}
    </span>
  );
}

/**
 * Set by the drag code while a tile is dragged and when the drag ends: the click that the
 * browser sends after a drop must not open the link. The drag library stops that click from
 * reaching the tile's own handlers, but stopping is not cancelling — the browser would still
 * follow the link — so it is cancelled here, on the document, before anything else sees it.
 */
export const dragGuard = { active: false, endedAt: 0 };
const justDragged = () => dragGuard.active || Date.now() - dragGuard.endedAt < 350;
if (typeof document !== "undefined") document.addEventListener("click", (e) => { if (justDragged()) e.preventDefault(); }, true);
const swallowAfterDrag = (e: { preventDefault(): void }) => { if (justDragged()) e.preventDefault(); };

function Sortable({ id, data, disabled, children }: { id: string; data: Record<string, unknown>; disabled: boolean; children: ReactNode }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id, data, disabled });
  return (
    <div ref={setNodeRef} {...(disabled ? {} : listeners)} className={cx("group relative min-w-0", isDragging && "z-10 opacity-60")}
      // a long press starts a drag on a touch screen: keep the browser's own long-press menu for links out of the way
      style={{ transform: CSS.Translate.toString(transform), transition, ...(disabled ? {} : { touchAction: "manipulation", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }) }}>
      {children}
    </div>
  );
}

function TileMenu({ label, items }: { label: string; items: (MenuItem | "sep")[] }) {
  return (
    <div className="absolute right-1.5 top-1.5" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
      <Menu items={items} trigger={
        <button type="button" aria-label={label} title={label}
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-faint opacity-70 transition hover:bg-surface-2 hover:text-ink hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100">
          <MoreHorizontal size={18} />
        </button>} />
    </div>
  );
}

export function LinkTile({ link, status, now, hostname, computer, container, editing, menu, caption }: {
  link: Link; status: LinkStatus | undefined; now: number; hostname: string; computer: string; container: string;
  editing: boolean; menu?: (MenuItem | "sep")[]; caption?: string;
}) {
  const href = linkHref(link, hostname);
  return (
    <Sortable id={`L:${link.id}`} data={{ kind: "link", id: link.id, container }} disabled={!editing}>
      {/* the tile does not spell out where it goes (Matt: not needed) — hovering it does */}
      <a href={href} draggable={false} onClick={swallowAfterDrag} title={displayAddress(link, computer)}
        {...(link.openIn === "new" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={cx("flex h-full items-center gap-3.5 rounded-[14px] border border-line bg-surface p-4 text-ink no-underline transition hover:border-line-2 hover:shadow-lift", editing && menu && "pr-10")}>
        <TileIcon link={link} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-[16px] font-semibold leading-snug [overflow-wrap:anywhere]">{link.name}</span>
          {/* in search results: which directory it is in */}
          {caption && <span className="truncate text-[13px] text-faint">{caption}</span>}
          {link.description && <span className="line-clamp-2 text-[13px] leading-snug text-mute [overflow-wrap:anywhere]">{link.description}</span>}
          <StatusLine status={status} now={now} />
        </span>
      </a>
      {editing && menu && <TileMenu label={`Change ${link.name}`} items={menu} />}
    </Sortable>
  );
}

export function FolderTile({ dir, summary, verdict, container, editing, menu }: {
  dir: Directory; summary: string; verdict: { text: string; light: Light }; container: string; editing: boolean; menu?: (MenuItem | "sep")[];
}) {
  return (
    <Sortable id={`D:${dir.id}`} data={{ kind: "folder", id: dir.id, container }} disabled={!editing}>
      <a href={`#/d/${dir.id}`} draggable={false} onClick={swallowAfterDrag}
        className={cx("flex h-full items-center gap-3.5 rounded-[14px] border border-dashed border-line-2 bg-accent-softer p-4 text-ink no-underline transition hover:border-accent hover:shadow-lift", editing && menu && "pr-10")}>
        <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface text-accent"><Folder size={24} /></span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-[16px] font-semibold leading-snug [overflow-wrap:anywhere]">{dir.name}</span>
          <span className="truncate text-[13px] text-ink-2">Directory · {summary}</span>
          <span className={cx("flex items-center gap-[7px] text-[13px] font-semibold", LIGHT_TEXT[verdict.light])}><LightDot light={verdict.light} />{verdict.text}</span>
        </span>
      </a>
      {editing && menu && <TileMenu label={`Change ${dir.name}`} items={menu} />}
    </Sortable>
  );
}
