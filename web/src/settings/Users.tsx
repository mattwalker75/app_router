/**
 * Settings → Access while the login is on: who can sign in, and what any
 * user may do about it — add a user, set a new password for someone, remove
 * a user, change their own password, turn the login off. Every user sees the
 * same page and has the same rights.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "../components/confirm";
import { Button, Field, Modal, PasswordInput, TextInput } from "../components/ui";
import { api, errorText } from "../lib/api";
import type { AppState } from "../lib/hooks";
import { Card } from "./SettingsPage";

interface UserRow { loginName: string; you: boolean }
const ErrorLine = ({ children }: { children: string }) => children ? <div role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">{children}</div> : null;

/** A small form in a window: runs `action`, shows its error, closes when it worked. */
function FormModal({ title, description, submitLabel, onClose, action, children, check }: {
  title: string; description?: ReactNode; submitLabel: string; onClose: () => void; action: () => Promise<unknown>; children: ReactNode; check?: () => string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    const problem = check?.(); if (problem) { setError(problem); return; }
    setBusy(true);
    try { await action(); onClose(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open onOpenChange={(v) => { if (!v) onClose(); }} title={title} description={description} className="w-[min(460px,94vw)]">
      <form className="flex flex-col gap-4 px-6 pb-6 pt-4" onSubmit={submit}>
        {children}
        <ErrorLine>{error}</ErrorLine>
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>{submitLabel}</Button></div>
      </form>
    </Modal>
  );
}

/** Two password boxes that must match. */
function NewPassword({ idPrefix, value, again, onValue, onAgain, label = "Password" }: { idPrefix: string; value: string; again: string; onValue: (v: string) => void; onAgain: (v: string) => void; label?: string }) {
  return (
    <>
      <Field label={label} htmlFor={`${idPrefix}-pw`} hint="At least 8 characters."><PasswordInput id={`${idPrefix}-pw`} autoComplete="new-password" value={value} onChange={(e) => onValue(e.target.value)} /></Field>
      <Field label={`${label} again`} htmlFor={`${idPrefix}-pw2`}><PasswordInput id={`${idPrefix}-pw2`} autoComplete="new-password" value={again} onChange={(e) => onAgain(e.target.value)} /></Field>
    </>
  );
}
const mismatch = (a: string, b: string) => (a !== b ? "The two passwords are not the same." : null);

/** "Turn the login on…": creates the first user and switches the login on in one step. */
export function TurnLoginOn({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [loginName, setLoginName] = useState(""); const [pw, setPw] = useState(""); const [again, setAgain] = useState("");
  return (
    <FormModal title="Turn the login on" submitLabel="Turn it on" onClose={onClose} check={() => mismatch(pw, again)}
      description="Create the first user. From then on everyone signs in before they see the page. You stay signed in here."
      action={async () => { await api.post("/api/auth/enable", { loginName, password: pw }); await qc.resetQueries(); toast("The login is on. You are signed in."); }}>
      <Field label="Login name" htmlFor="on-name"><TextInput id="on-name" autoFocus autoComplete="username" autoCapitalize="none" value={loginName} onChange={(e) => setLoginName(e.target.value)} /></Field>
      <NewPassword idPrefix="on" value={pw} again={again} onValue={setPw} onAgain={setAgain} />
    </FormModal>
  );
}

export function ChangeMyPassword({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState(""); const [pw, setPw] = useState(""); const [again, setAgain] = useState("");
  return (
    <FormModal title="Change my password" submitLabel="Change password" onClose={onClose} check={() => mismatch(pw, again)}
      description="You stay signed in here. Anywhere else you are signed in, you are asked for the new password."
      action={async () => { await api.post("/api/auth/password", { currentPassword: current, newPassword: pw }); toast("Your password is changed."); }}>
      <Field label="Current password" htmlFor="me-cur"><PasswordInput id="me-cur" autoFocus autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <NewPassword idPrefix="me" label="New password" value={pw} again={again} onValue={setPw} onAgain={setAgain} />
    </FormModal>
  );
}

function AddUser({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [loginName, setLoginName] = useState(""); const [pw, setPw] = useState(""); const [again, setAgain] = useState("");
  return (
    <FormModal title="Add a user" submitLabel="Add user" onClose={onClose} check={() => mismatch(pw, again)}
      description="They see the same page as you and can do everything you can, including adding and removing users."
      action={async () => { const r = await api.post<{ loginName: string }>("/api/users", { loginName, password: pw }); await qc.invalidateQueries({ queryKey: ["users"] }); toast(`Added “${r.loginName}”. Tell them their login name and password.`); }}>
      <Field label="Login name" htmlFor="add-name"><TextInput id="add-name" autoFocus autoComplete="off" autoCapitalize="none" value={loginName} onChange={(e) => setLoginName(e.target.value)} /></Field>
      <NewPassword idPrefix="add" value={pw} again={again} onValue={setPw} onAgain={setAgain} />
    </FormModal>
  );
}

function ResetPassword({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [pw, setPw] = useState(""); const [again, setAgain] = useState("");
  return (
    <FormModal title={`New password for “${user.loginName}”`} submitLabel="Set password" onClose={onClose} check={() => mismatch(pw, again)}
      description={user.you ? "You stay signed in here." : "Their old password stops working and they are signed out everywhere. Tell them the new one."}
      action={async () => { await api.put(`/api/users/${encodeURIComponent(user.loginName)}/password`, { password: pw }); toast(`“${user.loginName}” has a new password.`); }}>
      <NewPassword idPrefix="reset" label="New password" value={pw} again={again} onValue={setPw} onAgain={setAgain} />
    </FormModal>
  );
}

export function UsersCard({ state }: { state: AppState }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ users: UserRow[] }>("/api/users") });
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [mine, setMine] = useState(false);
  const remove = async (u: UserRow) => {
    if (!(await confirm({ title: `Remove “${u.loginName}”?`, confirmLabel: "Remove user", danger: true, typeToConfirm: "DELETE",
      message: "They are signed out at once and can no longer sign in. The page itself does not change — links belong to everyone." }))) return;
    try { await api.del(`/api/users/${encodeURIComponent(u.loginName)}`, { confirm: "DELETE" }); toast(`Removed “${u.loginName}”.`); }
    catch (e) { toast.error(errorText(e)); }
    await qc.invalidateQueries({ queryKey: ["users"] });
  };
  const me = state.auth.status === "authenticated" ? state.auth.loginName : "";
  return (
    <Card title="Users" sub="Everyone here signs in with their own name and password, sees the same page, and can do everything — there are no roles.">
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {(users.data?.users ?? []).map((u) => (
          <li key={u.loginName} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <span className="min-w-[120px] flex-1 font-semibold">{u.loginName}{u.you && <span className="ml-2 rounded-full bg-accent-softer px-2 py-0.5 text-[12px] font-semibold text-accent-text">you</span>}</span>
            {u.you
              ? <Button size="sm" icon={<KeyRound size={15} />} onClick={() => setMine(true)}>Change my password</Button>
              : <>
                  <Button size="sm" icon={<KeyRound size={15} />} onClick={() => setResetting(u)}>Set a new password</Button>
                  <Button size="sm" variant="danger-outline" icon={<Trash2 size={15} />} onClick={() => remove(u)}>Remove</Button>
                </>}
          </li>
        ))}
        {users.isLoading && <li className="px-4 py-3 text-mute">Loading…</li>}
        {users.error && <li className="px-4 py-3 text-danger">{users.error.message}</li>}
      </ul>
      <div><Button icon={<UserPlus size={16} />} onClick={() => setAdding(true)}>Add a user</Button></div>
      <p className="text-[13.5px] leading-relaxed text-mute">Signed in as <b className="text-ink">{me}</b>. You can't remove yourself — another user can, or turning the login off removes everyone.</p>
      {adding && <AddUser onClose={() => setAdding(false)} />}
      {resetting && <ResetPassword user={resetting} onClose={() => setResetting(null)} />}
      {mine && <ChangeMyPassword onClose={() => setMine(false)} />}
    </Card>
  );
}
