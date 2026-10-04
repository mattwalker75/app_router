/**
 * Confirmation windows. `confirm({...})` resolves true/false. With
 * `typeToConfirm: "DELETE"` the button stays disabled until that word is
 * typed — used for the destructive actions (deleting a directory with things in it,
 * replacing the page on import, removing a user, turning the login off).
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button, Modal, TextInput } from "./ui";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  typeToConfirm?: string;
  /** hide the confirm button (an information-only window) */
  infoOnly?: boolean;
}
type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;
const Ctx = createContext<ConfirmFn>(async () => false);
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState("");
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback<ConfirmFn>((o) => new Promise((res) => { resolver.current = res; setTyped(""); setOpts(o); }), []);
  const done = (v: boolean) => { resolver.current?.(v); resolver.current = null; setOpts(null); };
  const ready = !opts?.typeToConfirm || typed.trim() === opts.typeToConfirm;
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal open={!!opts} onOpenChange={(v) => { if (!v) done(false); }} title={opts?.title || ""}>
        {opts && (
          <form className="flex flex-col gap-4 px-6 pb-6 pt-3" onSubmit={(e) => { e.preventDefault(); if (ready && !opts.infoOnly) done(true); }}>
            <div className="text-[14px] leading-relaxed text-ink-2">{opts.message}</div>
            {opts.typeToConfirm && (
              <label className="flex flex-col gap-1.5 text-[13px] text-mute">
                <span>Type <b className="font-mono text-ink">{opts.typeToConfirm}</b> to confirm</span>
                <TextInput autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={`Type ${opts.typeToConfirm} to confirm`} />
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={() => done(false)}>{opts.infoOnly ? "Close" : opts.cancelLabel || "Cancel"}</Button>
              {!opts.infoOnly && <Button type="submit" variant={opts.danger ? "danger" : "primary"} disabled={!ready} autoFocus={!opts.typeToConfirm}>{opts.confirmLabel || "OK"}</Button>}
            </div>
          </form>
        )}
      </Modal>
    </Ctx.Provider>
  );
}
