/** Settings → Access: the port, who on the network can reach the page, and the optional login with its users. */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "../components/confirm";
import { ApplyBadge, Button, cx, Field, Notice, TextInput, Toggle } from "../components/ui";
import { api, errorText } from "../lib/api";
import type { AppState } from "../lib/hooks";
import { Card, useSaveSettings } from "./SettingsPage";
import { TurnLoginOn, UsersCard } from "./Users";

export function AccessSection({ state }: { state: AppState }) {
  const save = useSaveSettings();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const c = state.config;
  const on = c.security.loginEnabled;
  const [port, setPort] = useState(String(c.server.port));
  const [network, setNetwork] = useState(c.server.allowNetwork);
  const [extra, setExtra] = useState((c.server.extraHosts || []).join(", "));
  const [file, setFile] = useState(c.security.passwordFile);
  const [hours, setHours] = useState(String(c.security.sessionHours));
  const [turningOn, setTurningOn] = useState(false);
  // each box follows its OWN saved value: saving one card must not undo what you are typing in the other
  const savedHosts = (c.server.extraHosts || []).join(", ");
  useEffect(() => { setPort(String(c.server.port)); }, [c.server.port]);
  useEffect(() => { setNetwork(c.server.allowNetwork); }, [c.server.allowNetwork]);
  useEffect(() => { setExtra(savedHosts); }, [savedHosts]);
  useEffect(() => { setFile(c.security.passwordFile); }, [c.security.passwordFile]);
  useEffect(() => { setHours(String(c.security.sessionHours)); }, [c.security.sessionHours]);
  const lowPort = Number(port) > 0 && Number(port) < 1024;
  const turnOff = async () => {
    if (!(await confirm({ title: "Turn the login off?", confirmLabel: "Turn the login off", danger: true, typeToConfirm: "DISABLE", message: (
      <div className="flex flex-col gap-2.5">
        <p><b>Every user and password is removed</b>, and the page opens for anyone who can reach it{c.server.allowNetwork ? " — with network access on, that is everyone on your network" : ""}.</p>
        <p>Links, directories and settings stay as they are. You can turn the login on again at any time; you will create a new first user then.</p>
      </div>) }))) return;
    try { await api.post("/api/auth/disable", { confirm: "DISABLE" }); qc.removeQueries({ queryKey: ["users"] }); await qc.resetQueries(); toast("The login is off."); }
    catch (e) { toast.error(errorText(e)); }
  };
  return (
    <>
      <h1 className="text-[27px] font-bold">Access</h1>
      <Card title="Network" sub="Where App Router listens, and whether other devices may open it. Both take effect after a restart.">
        <div className="grid items-start gap-4 @xl:grid-cols-[180px_1fr]">
          <Field label="Port" htmlFor="a-port" badge={<ApplyBadge restart />} hint="80 is the usual web port: no number needed in the address.">
            <TextInput id="a-port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))} />
          </Field>
          <Field label="Allow other devices on my network" htmlFor="a-network" badge={<ApplyBadge restart />}
            hint={network ? "Other computers, phones and tablets can open the page at this computer's address. A VPN such as Tailscale counts as a network too." : "Only this computer can open the page."}>
            <div className="flex h-11 items-center"><Toggle id="a-network" label="Allow other devices on my network" checked={network} onChange={setNetwork} /></div>
          </Field>
        </div>
        {state.networkUrls.length > 0 && ( /* the addresses that answer now — a switch waiting for a restart changes nothing yet */
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-[14px]"><div className="mb-1 text-mute">Open it from another device at:</div>{state.networkUrls.map((u) => <div key={u} className="break-all font-mono text-[13.5px]">{u}</div>)}</div>
        )}
        {!network && lowPort && (
          <Notice tone="info" icon={<Info size={16} />}>On a Mac, a port below 1024 can only be opened on every network address at once. With network access off, App Router does that and refuses every connection that does not come from this computer itself — other devices still can't open it.</Notice>
        )}
        {network && !on && (
          <Notice icon={<AlertTriangle size={16} />}>With network access on and the login off, anyone on your network can open the page — and, while changes are allowed, change it and these settings. Turn the login on below if other people use this network.</Notice>
        )}
        <Field label="Other names for this computer" htmlFor="a-extra" badge={<ApplyBadge />}
          hint={<>App Router only answers when it is opened by a name this computer really has. If you reach it through a VPN such as Tailscale, add that name here — for example <span className="font-mono">mac-mini.tailnet-name.ts.net</span>. Separate several with commas.</>}>
          <TextInput id="a-extra" className="font-mono !text-[14px] pointer-coarse:!text-[16px]" autoCapitalize="none" placeholder="none" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </Field>
        <Notice tone="info" icon={<Info size={16} />}>A link to an app on this computer only works from another device if <b>that app</b> also allows network access. App Router's own switch does not open the other apps, and each app keeps its own login.</Notice>
        <div><Button variant="primary" onClick={() => save({ server: { port, allowNetwork: network, extraHosts: extra.split(/[,\s]+/).filter(Boolean) } })}>Save</Button></div>
      </Card>

      <Card title="Login" sub={on ? "The login is on: everyone signs in before they see the page." : "The login is off: the page opens straight away for anyone who can reach it, and there are no users."}>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
          <span className={cx("h-2.5 w-2.5 rounded-full", on ? "bg-ok-light" : "border-2 border-off-light")} />
          <span className="min-w-[160px] flex-1 [overflow-wrap:anywhere]">{on ? <>Signed in as <b>{state.auth.status === "authenticated" ? state.auth.loginName : ""}</b></> : "Nobody needs to sign in"}</span>
          {on ? <Button variant="danger-outline" onClick={turnOff}>Turn the login off…</Button> : <Button variant="primary" onClick={() => setTurningOn(true)}>Turn the login on…</Button>}
        </div>
        <div className="grid items-start gap-4 @xl:grid-cols-[1fr_270px]">
          <Field label="Password file" htmlFor="a-file" badge={<ApplyBadge />} hint={<>Now: <span className="break-all font-mono text-[12.5px]">{state.passwordFile}</span>. Change the path and the file, with its users, is moved there.</>}>
            <TextInput id="a-file" className="font-mono !text-[14px] pointer-coarse:!text-[16px]" value={file} onChange={(e) => setFile(e.target.value)} />
          </Field>
          <Field label="Stay signed in for (hours)" htmlFor="a-hours" badge={<ApplyBadge restart />} hint="1 to 720.">
            <TextInput id="a-hours" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, "").slice(0, 3))} />
          </Field>
        </div>
        <Notice tone="info"><b>Forgot a password?</b> Another user can set a new one below. If nobody can sign in, delete the password file and reload the page: you are asked to create a login again, and your links and settings are untouched. Restarting App Router signs everyone out.</Notice>
        <div><Button variant="primary" onClick={() => save({ security: { passwordFile: file, sessionHours: hours } })}>Save</Button></div>
      </Card>
      {on && <UsersCard state={state} />}
      {turningOn && <TurnLoginOn onClose={() => setTurningOn(false)} />}
    </>
  );
}
