/** Settings → Health checks: the master switch, how often, and what each light means. */
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { LightDot } from "../components/Tiles";
import { ApplyBadge, Button, Field, TextInput, ToggleRow } from "../components/ui";
import { api, errorText } from "../lib/api";
import { tally, tallyText } from "../lib/format";
import { useRefresh, useStatus, type AppState } from "../lib/hooks";
import type { StatusReport } from "../../../shared/types";
import { Card, useSaveSettings } from "./SettingsPage";

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

export function HealthSection({ state }: { state: AppState }) {
  const save = useSaveSettings();
  const refresh = useRefresh();
  const status = useStatus();
  const h = state.config.health;
  const [interval, setIntervalS] = useState(String(h.intervalSeconds));
  const [timeout, setTimeoutS] = useState(String(h.timeoutSeconds));
  const [recovered, setRecovered] = useState(String(h.recoveredMinutes));
  const [failures, setFailures] = useState(String(h.failuresBeforeDown));
  const [checking, setChecking] = useState(false);
  // each box follows its OWN saved value: flipping the switch above must not undo what you are typing
  useEffect(() => { setIntervalS(String(h.intervalSeconds)); }, [h.intervalSeconds]);
  useEffect(() => { setTimeoutS(String(h.timeoutSeconds)); }, [h.timeoutSeconds]);
  useEffect(() => { setRecovered(String(h.recoveredMinutes)); }, [h.recoveredMinutes]);
  useEffect(() => { setFailures(String(h.failuresBeforeDown)); }, [h.failuresBeforeDown]);
  const checkNow = async () => {
    setChecking(true);
    try {
      const r = await api.post<StatusReport>("/api/status/check");
      const t = tally(Object.values(r.links).map((s) => s.light));
      toast(tallyText(t) ? `Checked: ${tallyText(t)}.` : "Checked. No link has health checks on.");
      await refresh();
    } catch (e) { toast.error(errorText(e)); } finally { setChecking(false); }
  };
  const counts = tally(Object.values(status.data?.links ?? {}).map((s) => s.light));
  return (
    <>
      <h1 className="text-[27px] font-bold">Health checks</h1>
      <Card title="Status lights" sub="App Router asks each link for its page on a timer, from the computer it runs on, and shows the result next to the link.">
        <ToggleRow title="Check the links and show status lights" badge={<ApplyBadge />} checked={h.enabled}
          onChange={(v) => save({ health: { enabled: v } }, v ? "Health checks are on." : "Health checks are off — every light is grey.")}>
          Off: nothing is checked and every light is grey. Each link also has its own switch (Change… on its tile), so one link can opt out.
        </ToggleRow>
        <div className="grid gap-x-6 gap-y-2.5 rounded-xl bg-surface-2 px-4 py-3.5 text-[14px] sm:grid-cols-2">
          <span className="flex items-center gap-2.5"><LightDot light="online" /><span><b className="text-ok">Online</b> — it answered.</span></span>
          <span className="flex items-center gap-2.5"><LightDot light="recovered" /><span><b className="text-warn">Just back</b> — answering again after being down.</span></span>
          <span className="flex items-center gap-2.5"><LightDot light="down" /><span><b className="text-danger">Down</b> — no answer, or a server error.</span></span>
          <span className="flex items-center gap-2.5"><LightDot light="unchecked" /><span><b>Not checked</b> — checks are off for it.</span></span>
        </div>
        <p className="text-[13.5px] leading-relaxed text-mute">Any answer counts as online, even a sign-in page or “not found” — only no answer at all, or a server error (500 and up), counts as down. An app on this computer is checked on its port directly, so its light shows whether it is running, not whether other devices are allowed to reach it.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<RefreshCw size={16} />} busy={checking} onClick={checkNow} disabled={!h.enabled}>Check now</Button>
          {h.enabled && status.data && <span className="text-[13.5px] text-mute">{tallyText(counts) || "No link has health checks on yet"}{counts.unchecked ? ` · ${counts.unchecked} not checked` : ""}</span>}
        </div>
      </Card>
      <Card title="Timing" sub="Saving starts a round of checks at once, with the new timing.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Check every (seconds)" htmlFor="h-int" badge={<ApplyBadge />} hint="5 to 3600. 30 is a good default."><TextInput id="h-int" inputMode="numeric" value={interval} onChange={(e) => setIntervalS(digits(e.target.value))} /></Field>
          <Field label="Wait for an answer (seconds)" htmlFor="h-to" badge={<ApplyBadge />} hint="1 to 60. No answer in this time counts as a failed check."><TextInput id="h-to" inputMode="numeric" value={timeout} onChange={(e) => setTimeoutS(digits(e.target.value))} /></Field>
          <Field label="Stay yellow after coming back (minutes)" htmlFor="h-rec" badge={<ApplyBadge />} hint="0 to 1440. 0 means straight back to green."><TextInput id="h-rec" inputMode="numeric" value={recovered} onChange={(e) => setRecovered(digits(e.target.value))} /></Field>
          <Field label="Failed checks in a row before red" htmlFor="h-fail" badge={<ApplyBadge />} hint="1 to 10. 2 forgives a single missed check."><TextInput id="h-fail" inputMode="numeric" value={failures} onChange={(e) => setFailures(digits(e.target.value))} /></Field>
        </div>
        <div><Button variant="primary" onClick={() => save({ health: { intervalSeconds: interval, timeoutSeconds: timeout, recoveredMinutes: recovered, failuresBeforeDown: failures } })}>Save</Button></div>
      </Card>
    </>
  );
}
