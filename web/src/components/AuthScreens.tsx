/** The two screens before the page: create the first login (after the password file was deleted), and sign in. */
import { useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "../lib/api";
import { Button, Field, PasswordInput, TextInput } from "./ui";

function Card({ title, sub, children }: { title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[430px] rounded-2xl bg-surface p-8 shadow-dialog">
        <div className="mb-1 flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" width={30} height={30} className="rounded-lg" />
          <span className="text-[20px] font-bold">App Router</span>
        </div>
        <h1 className="mt-5 text-[25px] font-bold leading-tight">{title}</h1>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-mute">{sub}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function useAuthForm(url: string) {
  const qc = useQueryClient();
  const [loginName, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent, extra?: () => string | null) => {
    e.preventDefault(); setError("");
    const problem = extra?.(); if (problem) { setError(problem); return; }
    setBusy(true);
    // reset, not refresh: nothing a previous user loaded in this browser may show for the new one
    try { await api.post(url, { loginName, password }); await qc.resetQueries(); }
    catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return { loginName, setLogin, password, setPassword, error, busy, submit };
}

const ErrorLine = ({ children }: { children: string }) => children ? <div role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">{children}</div> : null;

export function LoginScreen() {
  const f = useAuthForm("/api/auth/login");
  return (
    <Card title="Sign in" sub="Enter your login name and password to open the page.">
      <form className="flex flex-col gap-4" onSubmit={(e) => f.submit(e)}>
        <Field label="Login name" htmlFor="l-name"><TextInput id="l-name" autoFocus autoComplete="username" autoCapitalize="none" value={f.loginName} onChange={(e) => f.setLogin(e.target.value)} /></Field>
        <Field label="Password" htmlFor="l-pw"><PasswordInput id="l-pw" autoComplete="current-password" value={f.password} onChange={(e) => f.setPassword(e.target.value)} /></Field>
        <ErrorLine>{f.error}</ErrorLine>
        <Button type="submit" variant="primary" busy={f.busy}>Sign in</Button>
        <p className="text-[13px] leading-relaxed text-mute">Forgot your password? Another user can set a new one in Settings → Access. If nobody can sign in, delete the password file on the computer that runs App Router and reload this page.</p>
      </form>
    </Card>
  );
}

export function SetupScreen() {
  const f = useAuthForm("/api/auth/setup");
  const [again, setAgain] = useState("");
  return (
    <Card title="Create a login" sub="The login is on, but there is no password file — so there are no users yet. Create the first one. Your links and settings are untouched.">
      <form className="flex flex-col gap-4" onSubmit={(e) => f.submit(e, () => (f.password !== again ? "The two passwords are not the same." : null))}>
        <Field label="Login name" htmlFor="s-name"><TextInput id="s-name" autoFocus autoComplete="username" autoCapitalize="none" value={f.loginName} onChange={(e) => f.setLogin(e.target.value)} /></Field>
        <Field label="Password" htmlFor="s-pw" hint="At least 8 characters."><PasswordInput id="s-pw" autoComplete="new-password" value={f.password} onChange={(e) => f.setPassword(e.target.value)} /></Field>
        <Field label="Password again" htmlFor="s-pw2"><PasswordInput id="s-pw2" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
        <ErrorLine>{f.error}</ErrorLine>
        <Button type="submit" variant="primary" busy={f.busy}>Create login</Button>
      </form>
    </Card>
  );
}
