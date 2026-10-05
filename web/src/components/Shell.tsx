/** The frame around everything: the header (name, search, status summary, Settings, who is signed in) and below it the page or Settings. */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, LogOut, Search, SlidersHorizontal, User, X } from "lucide-react";
import { go, useRoute } from "../App";
import { api } from "../lib/api";
import { tally, tallyText } from "../lib/format";
import { useDebounced, usePage, useStatus, type AppState } from "../lib/hooks";
import { SettingsPage } from "../settings/SettingsPage";
import { ChangeMyPassword } from "../settings/Users";
import { Launchpad } from "./Launchpad";
import { LightDot } from "./Tiles";
import { Button, cx, Menu, Spinner } from "./ui";

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-accent">
      <circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="6" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M7.5 12h4l5-5.2M11.5 12l5 5.2" />
    </svg>
  );
}

export function Shell({ state }: { state: AppState }) {
  const route = useRoute();
  const qc = useQueryClient();
  const page = usePage();
  const status = useStatus();
  const [query, setQuery] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const debounced = useDebounced(query, 120);
  const inSettings = route.view === "settings";
  const showSearch = state.config.page.showSearch && !inSettings;
  useEffect(() => { if (!showSearch) setQuery(""); }, [showSearch]);
  useEffect(() => { setQuery(""); }, [route.view === "dir" ? route.id : route.view]); // eslint-disable-line react-hooks/exhaustive-deps

  // "/" jumps to the search box, as it does on many sites — unless you are typing somewhere
  const searchBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!showSearch) return;
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable))) return;
      if (document.querySelector("[role=dialog]")) return;
      e.preventDefault(); searchBox.current?.focus();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [showSearch]);

  const counts = tally((page.data?.links ?? []).map((l) => status.data?.links[l.id]?.light));
  const summary = tallyText(counts);
  const signOut = async () => {
    await api.post("/api/auth/logout").catch(() => {});
    // nothing loaded for this user may stay in the browser for the next one
    qc.setQueryData(["auth"], { status: "unauthenticated" });
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* A wide screen has everything on one line. Below 1024px the search box and the status summary get
          a line of their own under the name and the buttons; on a phone the computer's name is left out and the
          signed-in user is a picture only (the name is in its tooltip and read out). */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line bg-surface px-4 py-3 sm:px-8">
        <a href="#/" className="flex min-h-11 min-w-0 items-center gap-2.5 text-ink no-underline">
          <Logo />
          <span className="min-w-0 text-[19px] font-bold leading-tight tracking-[-0.01em] [overflow-wrap:anywhere]">{state.config.page.title}</span>
          <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[13px] text-mute max-sm:hidden" title="The computer App Router runs on">{state.hostname}</span>
        </a>
        {(showSearch || (summary && !inSettings)) && (
          <div className="flex min-w-0 items-center gap-x-4 gap-y-2 max-lg:order-last max-lg:basis-full max-lg:flex-wrap lg:contents">
            {showSearch && (
              <div className="flex h-11 min-w-[180px] flex-1 items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 text-mute focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft lg:max-w-[440px]">
                <Search size={16} aria-hidden className="shrink-0" />
                <input ref={searchBox} type="search" aria-label="Find an app or link" placeholder="Find an app or link" value={query} onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }} enterKeyHint="search" autoCapitalize="none" autoCorrect="off"
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint pointer-coarse:text-[16px]" />
                {query && <button type="button" aria-label="Clear the search" onClick={() => { setQuery(""); searchBox.current?.focus(); }} className="-mr-1.5 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-surface hover:text-ink pointer-coarse:h-10 pointer-coarse:w-10"><X size={15} /></button>}
              </div>
            )}
            {summary && !inSettings && (
              <span className="flex items-center gap-2 text-[13.5px] text-mute lg:ml-auto" title="Status of the links that have health checks on">
                <LightDot light={counts.down ? "down" : counts.recovered ? "recovered" : "online"} />{summary}
              </span>
            )}
          </div>
        )}
        <div className={cx("flex items-center gap-2.5 max-lg:ml-auto", !(summary && !inSettings) && "lg:ml-auto")}>
          {inSettings
            ? <Button icon={<ArrowLeft size={16} />} onClick={() => go("/")}>Back to the page</Button>
            : <Button icon={<SlidersHorizontal size={16} />} onClick={() => go("/settings")}>Settings</Button>}
          {state.auth.status === "authenticated" && (
            <Menu items={[
              { label: "Change my password…", icon: <KeyRound size={15} />, onSelect: () => setChangingPassword(true) },
              { label: "Sign out", icon: <LogOut size={15} />, onSelect: signOut },
            ]} trigger={<Button icon={<User size={16} />} title={`Signed in as ${state.auth.loginName}`} className="max-w-[200px] max-sm:w-11 max-sm:px-0">
              <span className="truncate max-sm:sr-only">{state.auth.loginName}</span>
            </Button>} />
          )}
        </div>
      </header>
      {inSettings ? <SettingsPage state={state} section={route.section} />
        : !page.data ? <div className="flex flex-1 items-center justify-center p-10">{page.error ? <span className="text-danger">{page.error.message}</span> : <Spinner />}</div>
        : <Launchpad state={state} page={page.data} status={status.data} query={showSearch ? debounced : ""} dirId={route.view === "dir" ? route.id : null} />}
      {changingPassword && <ChangeMyPassword onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
