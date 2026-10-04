import type { Light, LinkStatus } from "../../../shared/types";

/** Tile colours: white letters read on every one of these (4.5:1 or better). */
export const TILE_COLORS = ["#2b59d9", "#0f766e", "#7a3fc4", "#3f5468", "#b4491f", "#1f6f43", "#9b2c5e", "#5a4fcf", "#8a5a00", "#0b6a8f"];

/** "My Business Manager" → "MB", "JARVIS" → "JA", "NAS" → "NA". */
export function initials(name: string): string {
  const words = name.trim().split(/[\s_\-./]+/).filter(Boolean);
  if (!words.length) return "?";
  const pick = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return pick.toUpperCase();
}

/** The same name always gets the same colour. */
export function colorFor(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

/** "moments", "4 min", "3 h", "2 days" */
export function span(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "moments";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} days`;
}

export function lightLabel(s: LinkStatus | undefined, now = Date.now()): string {
  if (!s) return "Checking…";
  const since = s.since ? Math.max(0, now - Date.parse(s.since)) : null;
  switch (s.light) {
    case "online": return "Online";
    case "recovered": return since === null ? "Just back" : since < 60_000 ? "Back just now" : `Back ${span(since)} ago`;
    case "down": return since === null || since < 60_000 ? "Down" : `Down for ${span(since)}`;
    case "unchecked": return "Not checked";
    default: return "Checking…";
  }
}

/** The line shown when you hover a light. */
export function lightTitle(s: LinkStatus | undefined, now = Date.now()): string {
  if (!s) return "";
  const checked = s.checkedAt ? ` · checked ${span(Math.max(0, now - Date.parse(s.checkedAt)))} ago`.replace("moments ago", "just now") : "";
  return `${s.detail}${checked}`;
}

export interface Tally { online: number; recovered: number; down: number; unchecked: number; pending: number }
export const tally = (lights: (Light | undefined)[]): Tally => {
  const t: Tally = { online: 0, recovered: 0, down: 0, unchecked: 0, pending: 0 };
  for (const l of lights) t[l ?? "pending"]++;
  return t;
};
/** "8 online · 1 just back · 1 down" — only what there is. */
export function tallyText(t: Tally): string {
  const parts = [];
  if (t.online) parts.push(`${t.online} online`);
  if (t.recovered) parts.push(`${t.recovered} just back`);
  if (t.down) parts.push(`${t.down} down`);
  return parts.join(" · ");
}
/** One short verdict for a directory tile. */
export function tallyVerdict(t: Tally): { text: string; light: Light } {
  const checked = t.online + t.recovered + t.down;
  if (t.down) return { text: `${t.down} down`, light: "down" };
  if (t.recovered) return { text: `${t.recovered} just back`, light: "recovered" };
  if (checked) return { text: checked === 1 ? "Online" : "All online", light: "online" };
  if (t.pending) return { text: "Checking…", light: "pending" };
  return { text: "Not checked", light: "unchecked" };
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
