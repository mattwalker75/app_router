/**
 * Themes: light and dark are token sets in index.css; "system" follows the
 * computer; a custom theme sets the same CSS variables inline on <html>.
 */
export interface CustomTheme { id: string; name: string; dark: boolean; tokens: Record<string, string> }

/** The tokens a custom theme can set, with the label Settings shows. */
export const THEME_TOKENS: [string, string][] = [
  ["bg", "Page background"], ["surface", "Tiles & panels"], ["surface-2", "Soft panels"], ["ink", "Text"], ["ink-2", "Secondary text"],
  ["mute", "Muted text"], ["line", "Lines"], ["accent", "Accent"], ["accent-ink", "Text on accent"], ["accent-soft", "Accent tint"],
  ["accent-softer", "Accent wash"], ["accent-text", "Accent text"],
];

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function applyTheme(theme: string, custom: CustomTheme[], preview?: CustomTheme | null): void {
  const root = document.documentElement;
  for (const [k] of THEME_TOKENS) root.style.removeProperty(`--${k}`);
  const ct = preview || custom.find((t) => t.id === theme);
  if (ct) {
    root.dataset.theme = ct.dark ? "dark" : "light";
    for (const [k] of THEME_TOKENS) if (ct.tokens[k]) root.style.setProperty(`--${k}`, ct.tokens[k]);
    return;
  }
  root.dataset.theme = theme === "dark" || (theme !== "light" && media?.matches) ? "dark" : "light";
}

/**
 * The theme is kept in this browser as well, and put on before the server has answered, so a
 * reload (or the sign-in screen) does not flash the default look first. Storage can be
 * unavailable — then the page simply waits for the server.
 */
const REMEMBERED = "ar.appearance";
export function rememberTheme(theme: string, custom: CustomTheme[]): void {
  try { localStorage.setItem(REMEMBERED, JSON.stringify({ theme, customThemes: custom.filter((t) => t.id === theme) })); } catch {}
}
export function applyRememberedTheme(): void {
  try {
    const a = JSON.parse(localStorage.getItem(REMEMBERED) || "null") as { theme?: unknown; customThemes?: unknown } | null;
    if (a && typeof a.theme === "string") applyTheme(a.theme, Array.isArray(a.customThemes) ? (a.customThemes as CustomTheme[]) : []);
  } catch {}
}

export function onSystemThemeChange(fn: () => void): () => void {
  media?.addEventListener("change", fn);
  return () => media?.removeEventListener("change", fn);
}

/** The current colours, read back from the page — a custom theme starts from these. */
export function currentTokens(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const [k] of THEME_TOKENS) out[k] = toHex(cs.getPropertyValue(`--${k}`).trim());
  return out;
}
function toHex(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("").toLowerCase();
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("") : "#888888";
}
