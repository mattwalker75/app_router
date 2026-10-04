import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PageData, StatusReport } from "../../../shared/types";
import { api } from "./api";
import type { CustomTheme } from "./theme";

/** Browser-only preferences (which directories are collapsed). Storage can be unavailable — never let that break the page. */
export function useLocal<T>(key: string, initial: T): [T, (v: T | ((old: T) => T)) => void] {
  const k = `ar.${key}`;
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(k); return s == null ? initial : (JSON.parse(s) as T); } catch { return initial; } });
  const set = useCallback((next: T | ((old: T) => T)) => {
    setV((old) => { const val = typeof next === "function" ? (next as (o: T) => T)(old) : next; try { localStorage.setItem(k, JSON.stringify(val)); } catch {} return val; });
  }, [k]);
  return [v, set];
}

export interface AppConfig {
  server: { port: number; allowNetwork: boolean; extraHosts: string[] };
  security: { loginEnabled: boolean; passwordFile: string; sessionHours: number };
  data: { file: string; iconsDir: string };
  page: { title: string; rootName: string; allowEditing: boolean; showSearch: boolean };
  health: { enabled: boolean; intervalSeconds: number; timeoutSeconds: number; recoveredMinutes: number; failuresBeforeDown: number };
  appearance: { theme: string; customThemes: CustomTheme[] };
}
export type AuthState = { status: "disabled" } | { status: "not_initialized" } | { status: "unauthenticated" } | { status: "authenticated"; loginName: string };
export interface AppState {
  version: string; auth: AuthState; config: AppConfig; restartRequired: string[]; configFile: string; dataFile: string; iconsDir: string;
  passwordFile: string; hostname: string; networkUrls: string[];
  listening: { port: number; host: string; localOnlyFilter: boolean } | null;
}

/** Login state — always answered, even before signing in. */
export const useAuth = () => useQuery({ queryKey: ["auth"], queryFn: () => api.get<AuthState>("/api/auth/me") });
export const useAppState = (enabled = true) => useQuery({ queryKey: ["state"], queryFn: () => api.get<AppState>("/api/state"), enabled });
export const usePage = (enabled = true) => useQuery({ queryKey: ["page"], queryFn: () => api.get<PageData>("/api/page"), enabled });
/** The status lights, asked again every few seconds so the page follows the checks. */
export const useStatus = (enabled = true) => useQuery({
  queryKey: ["status"], enabled, queryFn: () => api.get<StatusReport>("/api/status"),
  refetchInterval: (q) => Math.min(15, Math.max(5, (q.state.data?.intervalSeconds ?? 30) / 2)) * 1000,
});

/** After any change: refetch everything that is on screen (it is all local and fast). */
export function useRefresh() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries(), [qc]);
}

/** Debounce a fast-changing value (the search box). */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** A clock that ticks, so "Down for 12 min" keeps counting between checks. */
export function useNow(everyMs = 20_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(t); }, [everyMs]);
  return now;
}
