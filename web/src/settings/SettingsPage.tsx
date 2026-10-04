/**
 * Settings: every key in config.json, grouped. Each card saves only its own
 * keys, and each field says whether it applies immediately or needs a restart.
 */
import type { ReactNode } from "react";
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
      const r = await api.put<{ restartRequired: string[] }>("/api/settings", patch);
      await qc.invalidateQueries();
      toast(r.restartRequired.length ? `${done} Restart App Router to apply it (./ROUTER.sh --restart).` : done);
      return true;
    } catch (e) { toast.error(errorText(e)); return false; }
  };
}

export function SettingsPage({ state, section }: { state: AppState; section: string }) {
  const active = SECTIONS.some(([id]) => id === section) ? section : "page";
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-wrap items-start gap-6 px-4 pb-14 pt-7 sm:px-8">
      <nav aria-label="Settings sections" className="flex flex-[1_1_220px] flex-col gap-1 rounded-2xl border border-line bg-surface p-2.5 sm:max-w-[260px]">
        {SECTIONS.map(([id, name, hint]) => (
          <button key={id} type="button" onClick={() => go(`/settings/${id}`)} aria-current={id === active ? "page" : undefined}
            className={cx("flex min-h-12 cursor-pointer flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left", id === active ? "bg-accent-soft text-accent-text" : "text-ink-2 hover:bg-surface-2")}>
            <span className={cx("text-[15px]", id === active ? "font-bold" : "font-semibold")}>{name}</span>
            <span className={cx("text-[12.5px]", id === active ? "text-accent-text" : "text-mute")}>{hint}</span>
          </button>
        ))}
        <div className="px-3 pb-1 pt-4 text-[12.5px] leading-relaxed text-mute">App Router {state.version}<br />Settings are saved in<br /><span className="break-all font-mono text-[12px]">{state.configFile}</span></div>
      </nav>
      <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-5">
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
      </div>
    </div>
  );
}
