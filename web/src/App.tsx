/**
 * Top level: apply the theme, then show the right screen for the login state —
 * create a login, sign in, or the page itself (the links, or Settings).
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { LoginScreen, SetupScreen } from "./components/AuthScreens";
import { Shell } from "./components/Shell";
import { Button, Spinner } from "./components/ui";
import { useAppearance, useAppState, useAuth } from "./lib/hooks";
import { applyTheme, onSystemThemeChange, rememberTheme } from "./lib/theme";

export type Route = { view: "home" } | { view: "dir"; id: string } | { view: "settings"; section: string };
/** "#/settings/access" → Settings; "#/d/<id>" → one directory; anything else → the main page. */
export function useRoute(): Route {
  const read = (): Route => {
    const parts = window.location.hash.replace(/^#\/?/, "").split("/");
    if (parts[0] === "settings") return { view: "settings", section: parts[1] || "page" };
    if (parts[0] === "d" && parts[1]) return { view: "dir", id: parts[1] };
    return { view: "home" };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    // a new screen starts at its top: the browser keeps the old scroll position when only the part after # changes
    const f = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f);
  }, []);
  return route;
}
export const go = (hash: string) => { window.location.hash = hash; };

export default function App() {
  const auth = useAuth();
  const inside = auth.data?.status === "disabled" || auth.data?.status === "authenticated";
  const state = useAppState(inside);
  const qc = useQueryClient();
  // The theme comes from a route that answers before signing in, so the sign-in and
  // create-a-login screens wear it too. Inside the page, Settings is the fresher source.
  const open = useAppearance();
  const appearance = state.data?.config.appearance ?? open.data;
  const title = state.data?.config.page.title;

  useEffect(() => {
    if (!appearance) return; // not answered yet: keep what main.tsx put on (the remembered theme, or the device's own)
    applyTheme(appearance.theme, appearance.customThemes);
    rememberTheme(appearance.theme, appearance.customThemes);
    return onSystemThemeChange(() => applyTheme(appearance.theme, appearance.customThemes));
  }, [appearance]);
  useEffect(() => { document.title = title || "App Router"; }, [title]);

  useEffect(() => {
    const f = () => qc.invalidateQueries({ queryKey: ["auth"] });
    window.addEventListener("ar:signed-out", f);
    return () => window.removeEventListener("ar:signed-out", f);
  }, [qc]);

  const failed = auth.error || state.error;
  if (failed && (failed as { status?: number }).status !== 401) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl bg-surface p-8 text-center shadow-soft">
          <AlertTriangle className="text-warn" />
          <div className="text-xl font-bold">App Router is not answering</div>
          <div className="text-mute">{failed.message}. Check that it is running on the computer that hosts it (<span className="font-mono">./ROUTER.sh --status</span>), then try again.</div>
          <Button variant="primary" onClick={() => { auth.refetch(); state.refetch(); }}>Try again</Button>
        </div>
      </div>
    );
  }
  if (auth.data?.status === "not_initialized") return <SetupScreen />;
  if (auth.data?.status === "unauthenticated" || (failed as { status?: number } | null)?.status === 401) return <LoginScreen />;
  if (!state.data) return <div className="flex min-h-dvh items-center justify-center"><Spinner /></div>;
  return <Shell state={state.data} />;
}
