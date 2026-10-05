/**
 * Settings: every key in config.json, grouped. Each card saves only its own
 * keys, and each field says whether it applies immediately or needs a restart.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { go } from "../App";
import { cx } from "../components/ui";
import { api, errorText } from "../lib/api";
import type { AppState } from "../lib/hooks";
import { AccessSection } from "./Access";
import { AppearanceSection } from "./Appearance";
import { BackupSection } from "./Backup";
import { HealthSection } from "./Health";
import { PageSection } from "./Page";

const SECTIONS: [string, string, string][] = [
  ["page", "Page", "Names, changes, search"],
  ["appearance", "Appearance", "Light, dark, your own colours"],
  ["health", "Health checks", "The status lights"],
  ["access", "Access", "Port, network, login, users"],
  ["backup", "Backup", "Export, import, files"],
];
const RESTART_WORDS: Record<string, string> = {
  "server.port": "the new port", "server.allowNetwork": "the network setting", "security.sessionHours": "the sign-in length",
  "data.file": "the links file", "data.iconsDir": "the pictures folder",
};

export function Card({ title, sub, children, className }: { title: string; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6", className)}>
      <div><h2 className="text-[19px] font-bold">{title}</h2>{sub && <p className="mt-1 text-[14px] leading-relaxed text-mute">{sub}</p>}</div>
      {children}
    </section>
  );
}

/** PUT a partial settings object; refresh state; report what needs a restart. */
export function useSaveSettings() {
  const qc = useQueryClient();
  return async (patch: unknown, done = "Saved.") => {
    try {
      const r = await api.put<{ restartRequired: string[]; restartNow: string[] }>("/api/settings", patch);
      await qc.invalidateQueries();
      // only when THIS save changed something that waits for a restart (the banner above covers the rest)
      toast(r.restartNow.length ? `${done} Restart App Router to apply it (./ROUTER.sh --restart).` : done);
      return true;
    } catch (e) { toast.error(errorText(e)); return false; }
  };
}

export function SettingsPage({ state, section }: { state: AppState; section: string }) {
  const active = SECTIONS.some(([id]) => id === section) ? section : "page";
  // on a phone the sections are a row that scrolls sideways: bring the chosen one into view (the row only, never the page)
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const n = nav.current, b = n?.querySelector<HTMLElement>('[aria-current="page"]');
    if (n && b && n.scrollWidth > n.clientWidth) n.scrollLeft += b.getBoundingClientRect().left - n.getBoundingClientRect().left - 16;
  }, [active]);
  const savedIn = <>App Router {state.version}<br />Settings are saved in<br /><span className="break-all font-mono text-[12px]">{state.configFile}</span></>;
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-5 px-4 pb-14 pt-5 sm:px-8 md:flex-row md:items-start md:gap-6 md:pt-7">
      {/* beside the settings on a wide screen; on a phone a row of names that scrolls sideways, so the settings themselves start at the top */}
      <nav ref={nav} aria-label="Settings sections" className="no-scrollbar flex gap-1 rounded-2xl border border-line bg-surface p-1.5 max-md:-mx-4 max-md:overflow-x-auto max-md:rounded-none max-md:border-x-0 max-md:px-4 sm:max-md:-mx-8 sm:max-md:px-8 md:w-[240px] md:shrink-0 md:flex-col md:p-2.5">
        {SECTIONS.map(([id, name, hint]) => (
          <button key={id} type="button" onClick={() => go(`/settings/${id}`)} aria-current={id === active ? "page" : undefined}
            className={cx("flex min-h-11 shrink-0 cursor-pointer flex-col items-start justify-center whitespace-nowrap rounded-xl px-3.5 py-1.5 text-left md:min-h-12 md:whitespace-normal md:px-3", id === active ? "bg-accent-soft text-accent-text" : "text-ink-2 hover:bg-surface-2")}>
            <span className={cx("text-[15px]", id === active ? "font-bold" : "font-semibold")}>{name}</span>
            <span className={cx("text-[12.5px] max-md:hidden", id === active ? "text-accent-text" : "text-mute")}>{hint}</span>
          </button>
        ))}
        <div className="px-3 pb-1 pt-4 text-[12.5px] leading-relaxed text-mute max-md:hidden">{savedIn}</div>
      </nav>
      <div className="@container flex min-w-0 flex-1 flex-col gap-5">
        {state.restartRequired.length > 0 && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
            <RotateCw size={17} className="shrink-0" />
            <span className="min-w-[200px] flex-1"><b>Restart needed</b> for {state.restartRequired.map((k) => RESTART_WORDS[k] ?? k).join(" and ")} to take effect. Everything else already applies.</span>
            <span className="rounded-lg bg-surface px-2 py-1 font-mono text-[12.5px] text-ink">./ROUTER.sh --restart</span>
          </div>
        )}
        {active === "page" && <PageSection state={state} />}
        {active === "appearance" && <AppearanceSection state={state} />}
        {active === "health" && <HealthSection state={state} />}
        {active === "access" && <AccessSection state={state} />}
        {active === "backup" && <BackupSection state={state} />}
        <div className="px-1 text-[12.5px] leading-relaxed text-mute md:hidden">{savedIn}</div>
      </div>
    </div>
  );
}
