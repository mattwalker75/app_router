/**
 * Small building blocks used everywhere. Every colour comes from the theme
 * tokens (bg, surface, ink, accent…), so themes restyle all of it. Buttons
 * and fields are 44px tall: comfortable to tap on a phone or tablet.
 */
import * as Dialog from "@radix-ui/react-dialog";
import * as DM from "@radix-ui/react-dropdown-menu";
import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Eye, EyeOff, Loader2, X } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 border border-transparent",
  secondary: "bg-surface text-ink border border-line-2 hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-surface-2",
  danger: "bg-danger text-white border border-transparent hover:brightness-110",
  "danger-outline": "bg-surface text-danger border border-line-2 hover:bg-danger-soft",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: "sm" | "md"; busy?: boolean; icon?: ReactNode }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", busy, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} type="button" disabled={disabled || busy}
      className={cx("inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold whitespace-nowrap transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        size === "sm" ? "h-9 px-3 text-[13.5px]" : "h-11 px-4 text-[15px]", VARIANTS[variant], className)} {...rest}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : icon}{children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md"; bordered?: boolean }>(function IconButton({ label, size = "md", bordered, className, children, ...rest }, ref) {
  return (
    <button ref={ref} type="button" aria-label={label} title={label}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-[10px] text-ink-2 hover:bg-surface-2 hover:text-ink transition cursor-pointer disabled:opacity-40",
        bordered && "border border-line bg-surface", size === "sm" ? "h-8 w-8" : "h-11 w-11", className)} {...rest}>
      {children}
    </button>
  );
});

const field = "w-full rounded-[10px] border border-line-2 bg-surface px-3 text-[15px] text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft";
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(field, "h-11", className)} {...rest} />;
});
/**
 * A password box with an eye button that shows what was typed (and hides it
 * again). Used wherever a login password is created, changed or entered.
 * Each box has its own button, so showing one does not reveal the others.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(function PasswordInput({ className, ...rest }, ref) {
  const [shown, setShown] = useState(false);
  const label = shown ? "Hide password" : "Show password";
  return (
    <div className="relative">
      <input ref={ref} type={shown ? "text" : "password"} className={cx(field, "h-11 pr-12", className)} {...rest} />
      <button type="button" aria-label={label} title={label} aria-pressed={shown} onClick={() => setShown((v) => !v)}
        className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-ink">
        {shown ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
});
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(field, "h-11 pr-8", className)} {...rest}>{children}</select>;
}

export function Field({ label, hint, badge, children, htmlFor, className }: { label: ReactNode; hint?: ReactNode; badge?: ReactNode; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">{label}</label>
        {badge}
      </div>
      {children}
      {hint && <div className="text-[13px] leading-snug text-mute">{hint}</div>}
    </div>
  );
}
export const Optional = () => <span className="font-normal text-mute"> optional</span>;

/** "Applies immediately" / "Needs restart" next to a setting. */
export function ApplyBadge({ restart }: { restart?: boolean }) {
  return restart
    ? <span className="whitespace-nowrap rounded-full bg-warn-soft px-2 py-0.5 text-[11.5px] font-semibold text-warn">Needs restart</span>
    : <span className="whitespace-nowrap rounded-full bg-accent-softer px-2 py-0.5 text-[11.5px] font-semibold text-accent-text">Applies immediately</span>;
}

export function Toggle({ checked, onChange, label, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string; disabled?: boolean }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx("relative h-7 w-12 shrink-0 rounded-full transition cursor-pointer disabled:opacity-50", checked ? "bg-accent" : "bg-line-2")}>
      <span className={cx("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}
/** A switch with its label and a line of explanation, the whole row clickable-looking. */
export function ToggleRow({ checked, onChange, title, children, badge }: { checked: boolean; onChange: (v: boolean) => void; title: string; children?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">{title}{badge}</div>
        {children && <div className="mt-0.5 text-[13.5px] leading-snug text-mute">{children}</div>}
      </div>
      <div className="pt-0.5"><Toggle label={title} checked={checked} onChange={onChange} /></div>
    </div>
  );
}
export function Checkbox({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)]" />
      <span>{children}</span>
    </label>
  );
}

// ---------------------------------------------------------------- dialogs
export function Modal({ open, onOpenChange, title, description, children, className }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgb(10_16_24/0.5)]" />
        <Dialog.Content {...(description ? {} : { "aria-describedby": undefined })}
          className={cx("fixed left-1/2 top-1/2 z-50 max-h-[94vh] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl bg-surface shadow-dialog focus:outline-none",
            /(^|\s)!?w-/.test(className || "") ? "" : "w-[min(600px,94vw)]", className)}>
          <div className="flex items-start gap-3 px-6 pt-5">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[21px] font-bold leading-tight">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-[14px] text-mute">{description}</Dialog.Description>}
            </div>
            <Dialog.Close asChild><IconButton label="Close" size="sm"><X size={17} /></IconButton></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------- menus
export interface MenuItem { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }
export function Menu({ trigger, items, align = "end" }: { trigger: ReactNode; items: (MenuItem | "sep")[]; align?: "start" | "end" }) {
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content align={align} sideOffset={6} className="z-50 min-w-[200px] rounded-xl border border-line bg-surface p-1.5 shadow-lift" onClick={(e) => e.stopPropagation()}>
          {items.map((it, i) => it === "sep" ? <DM.Separator key={i} className="my-1 h-px bg-line" /> : (
            <DM.Item key={i} disabled={it.disabled} onSelect={it.onSelect}
              className={cx("flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[14.5px] outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-40",
                it.danger ? "text-danger" : "text-ink")}>
              <span className="flex w-4 justify-center text-current opacity-80">{it.icon}</span>{it.label}
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={20} className={cx("animate-spin text-faint", className)} />;
}

export function Notice({ tone = "warn", icon, children }: { tone?: "warn" | "info"; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx("flex items-start gap-2.5 rounded-xl px-4 py-3 text-[14px] leading-snug", tone === "warn" ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2")}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}<div className="min-w-0">{children}</div>
    </div>
  );
}
