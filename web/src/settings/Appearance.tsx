/** Settings → Appearance: light, dark, follow the computer, or colours of your own. */
import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "../components/confirm";
import { Button, cx, Field, TextInput, Toggle } from "../components/ui";
import type { AppState } from "../lib/hooks";
import { applyTheme, currentTokens, THEME_TOKENS, type CustomTheme } from "../lib/theme";
import { Card, useSaveSettings } from "./SettingsPage";

const PRESETS: [string, string, string, string, string][] = [
  ["light", "Light", "#f2f4f7", "#2b59d9", "Always light."],
  ["dark", "Dark", "#12171d", "#7fa8ff", "Always dark."],
  ["system", "System", "#f2f4f7", "#12171d", "Follows this device's light or dark setting."],
];

export function AppearanceSection({ state }: { state: AppState }) {
  const save = useSaveSettings();
  const confirm = useConfirm();
  const a = state.config.appearance;
  const [editing, setEditing] = useState<CustomTheme | null>(null);
  useEffect(() => () => applyTheme(a.theme, a.customThemes), [a]); // leaving the page ends any preview
  const pick = (id: string) => save({ appearance: { theme: id } }, "Theme changed.");
  const startNew = () => setEditing({ id: "", name: "", dark: document.documentElement.dataset.theme === "dark", tokens: currentTokens() });
  const preview = (t: CustomTheme) => { setEditing(t); applyTheme("", [], t); };
  const saveTheme = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Give the theme a name."); return; }
    const id = editing.id || `custom-${editing.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme"}-${Date.now().toString(36).slice(-4)}`;
    const list = [...a.customThemes.filter((t) => t.id !== id), { ...editing, id, name: editing.name.trim() }];
    if (await save({ appearance: { customThemes: list, theme: id } }, `Theme “${editing.name.trim()}” saved and applied.`)) setEditing(null);
  };
  const remove = async (t: CustomTheme) => {
    if (!(await confirm({ title: `Delete the theme “${t.name}”?`, message: "This only removes the colours; nothing else changes.", confirmLabel: "Delete theme", danger: true }))) return;
    await save({ appearance: { customThemes: a.customThemes.filter((x) => x.id !== t.id), theme: a.theme === t.id ? "system" : a.theme } }, "Theme deleted.");
  };
  const swatch = (bg: string, acc: string) => <span className="block h-11 w-full rounded-lg border border-line" style={{ background: `linear-gradient(135deg, ${bg} 58%, ${acc} 58%)` }} />;
  return (
    <>
      <h1 className="text-[27px] font-bold">Appearance</h1>
      <Card title="Theme" sub="Applies immediately, for everyone who opens the page.">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 pointer-coarse:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
          {PRESETS.map(([id, name, bg, acc, hint]) => (
            <button key={id} type="button" onClick={() => pick(id)} aria-pressed={a.theme === id} title={hint}
              className={cx("flex cursor-pointer flex-col gap-2 rounded-xl border-2 p-2.5 text-left text-[14.5px]", a.theme === id ? "border-accent" : "border-line hover:border-line-2")}>
              {swatch(bg, acc)}<span className="flex items-center justify-between font-semibold">{name}{a.theme === id && <Check size={16} className="text-accent" />}</span>
            </button>
          ))}
          {a.customThemes.map((t) => (
            <div key={t.id} className={cx("flex flex-col gap-2 rounded-xl border-2 p-2.5 text-[14.5px]", a.theme === t.id ? "border-accent" : "border-line")}>
              <button type="button" className="cursor-pointer" onClick={() => pick(t.id)} aria-pressed={a.theme === t.id} aria-label={`Use the theme ${t.name}`}>{swatch(t.tokens.bg || "#888888", t.tokens.accent || "#888888")}</button>
              <span className="flex items-center gap-1 font-semibold"><span className="flex-1 truncate">{t.name}</span>
                {a.theme === t.id && <Check size={16} className="text-accent" />}
                <button type="button" aria-label={`Change the theme ${t.name}`} onClick={() => preview(t)} className="cursor-pointer rounded p-1.5 text-faint hover:text-ink pointer-coarse:p-[13px]"><Pencil size={14} /></button>
                <button type="button" aria-label={`Delete the theme ${t.name}`} onClick={() => remove(t)} className="cursor-pointer rounded p-1.5 text-faint hover:text-danger pointer-coarse:p-[13px]"><Trash2 size={14} /></button>
              </span>
            </div>
          ))}
        </div>
        <p className="text-[13.5px] text-mute"><b>System</b> follows each device's own light or dark setting. Light and Dark are the same for everyone.</p>
        {!editing && <div><Button icon={<Plus size={16} />} onClick={startNew}>Create your own theme</Button></div>}
      </Card>
      {editing && (
        <Card title={editing.id ? `Change “${editing.name}”` : "Your own theme"} sub="Starts from the colours on screen now. Changes preview live; Save keeps the theme and applies it.">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Name" htmlFor="th-name" className="min-w-[200px] flex-1"><TextInput id="th-name" value={editing.name} maxLength={40} placeholder="for example Harbor" onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <label className="flex h-11 items-center gap-2.5 text-[14.5px] font-semibold"><Toggle label="Based on the dark theme" checked={editing.dark} onChange={(v) => preview({ ...editing, dark: v })} />Based on the dark theme</label>
          </div>
          <p className="text-[13.5px] text-mute">“Based on the dark theme” decides the colours you do not set here: the status lights, warnings, and the browser's own boxes and scrollbars.</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
            {THEME_TOKENS.map(([k, label]) => (
              <label key={k} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-line px-3 py-1.5 text-[14px]">
                <input type="color" value={editing.tokens[k] || "#888888"} onChange={(e) => preview({ ...editing, tokens: { ...editing.tokens, [k]: e.target.value } })} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-2"><Button variant="primary" onClick={saveTheme}>Save theme</Button><Button onClick={() => { setEditing(null); applyTheme(a.theme, a.customThemes); }}>Cancel</Button></div>
        </Card>
      )}
    </>
  );
}
