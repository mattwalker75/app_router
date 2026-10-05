/**
 * Add or change a link. One box decides the shape of the rest: when the app
 * runs on the same computer as App Router you give a port (and, rarely, a
 * path); otherwise a full address and, if you like, a port.
 */
import { useMemo, useRef, useState, type FormEvent } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { checkUrl, linkHref, withScheme } from "../../../shared/address";
import type { Link } from "../../../shared/types";
import { api, errorText } from "../lib/api";
import { characters, colorFor, initials, TILE_COLORS } from "../lib/format";
import { useRefresh } from "../lib/hooks";
import type { Tree } from "../lib/tree";
import { TileIcon } from "./Tiles";
import { Button, Checkbox, cx, Field, Modal, Optional, Select, TextInput } from "./ui";

export interface LinkDialogState { link?: Link; directoryId: string | null }

/** Shrink a chosen picture to a 192px square PNG, so pictures stay small and nothing but pixels is uploaded. */
async function squarePng(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = 192, side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("That picture could not be read."))), "image/png"));
}

export function LinkDialog({ state, tree, computer, rootName, onClose, onDelete }: {
  state: LinkDialogState; tree: Tree; computer: string; rootName: string; onClose: () => void; onDelete?: (l: Link) => void;
}) {
  const l = state.link;
  const refresh = useRefresh();
  const [name, setName] = useState(l?.name ?? "");
  const [description, setDescription] = useState(l?.description ?? "");
  const [local, setLocal] = useState(l?.local ?? true);
  const [scheme, setScheme] = useState<"http" | "https">(l?.scheme ?? "http");
  // two boxes, two values: the port of an app on this computer is not the optional port of an address elsewhere
  const [localPort, setLocalPort] = useState(l?.local && l.port ? String(l.port) : "");
  const [remotePort, setRemotePort] = useState(l && !l.local && l.port ? String(l.port) : "");
  const port = local ? localPort : remotePort;
  const [path, setPath] = useState(l?.path ?? "");
  const [url, setUrl] = useState(l?.url ?? "");
  const [directoryId, setDirectoryId] = useState<string | null>(l ? l.directoryId : state.directoryId);
  const [openIn, setOpenIn] = useState(l?.openIn ?? "new");
  const [healthOn, setHealthOn] = useState(l?.health.enabled ?? true);
  const [healthPath, setHealthPath] = useState(l?.health.path ?? "");
  const [text, setText] = useState(l?.icon.text ?? "");
  const [color, setColor] = useState(l?.icon.color ?? "");
  const [picture, setPicture] = useState<{ blob: Blob; preview: string } | null>(null);
  const [removePicture, setRemovePicture] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileBox = useRef<HTMLInputElement>(null);

  const draft = { local, scheme, port: port ? Number(port) : null, path: local ? (path && !path.startsWith("/") ? "/" + path : path) : "", url: local ? "" : withScheme(url) };
  const opens = useMemo(() => {
    if (local) return port ? linkHref(draft, window.location.hostname) : "";
    // an address a browser can't read comes back as "about:blank" — that is nothing to show
    try { const href = url.trim() ? linkHref(draft, "") : ""; return href === "about:blank" ? "" : href; } catch { return ""; }
  }, [local, scheme, port, path, url]); // eslint-disable-line react-hooks/exhaustive-deps
  const checks = useMemo(() => { try { return opens ? checkUrl({ ...draft, health: { enabled: true, path: healthPath.trim() } }) : ""; } catch { return ""; } }, [opens, healthPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const choosePicture = async (file: File | undefined) => {
    if (!file) return;
    try { const blob = await squarePng(file); setPicture({ blob, preview: URL.createObjectURL(blob) }); setRemovePicture(false); }
    catch { toast.error("That file is not a picture this browser can read. Choose a PNG or JPEG."); }
    if (fileBox.current) fileBox.current.value = "";
  };
  const hasPicture = !!picture || (!!l?.icon.image && !removePicture);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setBusy(true);
    const body = { name, description, local, scheme, port: port === "" ? null : Number(port), path, url, directoryId, openIn,
      icon: { text, color }, health: { enabled: healthOn, path: healthPath } };
    try {
      const saved = l ? await api.patch<Link>(`/api/links/${l.id}`, body) : await api.post<Link>("/api/links", body);
      // the link is saved; a picture that fails must not lose it
      try {
        if (picture) await api.post(`/api/links/${saved.id}/icon`, picture.blob);
        else if (removePicture && l?.icon.image) await api.del(`/api/links/${saved.id}/icon`);
      } catch (err) { toast.error(`The link was saved, but the picture was not: ${errorText(err)}`); }
      await refresh();
      toast(l ? `Saved “${saved.name}”.` : `Added “${saved.name}”.`);
      onClose();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  const previewLink = { name: name || "New link", icon: { text, color, image: null } };
  return (
    <Modal open onOpenChange={(v) => { if (!v) onClose(); }} title={l ? "Change link" : "Add a link"}>
      <form className="flex flex-col gap-4 px-4 pb-5 pt-4 sm:px-6 sm:pb-6" onSubmit={submit}>
        <Field label="Name shown on the page" htmlFor="k-name"><TextInput id="k-name" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={<>Description<Optional /></>} htmlFor="k-desc"><TextInput id="k-desc" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} /></Field>

        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4">
          <Checkbox id="k-local" checked={local} onChange={setLocal}>This app runs on the same computer as App Router ({computer})</Checkbox>
          {local ? (
            <>
              <div className="flex flex-wrap gap-3">
                <Field label="Port" htmlFor="k-port" className="w-[120px] max-sm:flex-1"><TextInput id="k-port" inputMode="numeric" placeholder="3030" value={localPort} onChange={(e) => setLocalPort(e.target.value.replace(/\D/g, "").slice(0, 5))} /></Field>
                <Field label={<>Path<Optional /></>} htmlFor="k-path" className="min-w-[160px] flex-1 max-sm:order-last max-sm:basis-full"><TextInput id="k-path" placeholder="/" value={path} onChange={(e) => setPath(e.target.value)} /></Field>
                <Field label="Type" htmlFor="k-scheme" className="w-[110px]"><Select id="k-scheme" value={scheme} onChange={(e) => setScheme(e.target.value === "https" ? "https" : "http")}><option value="http">http</option><option value="https">https</option></Select></Field>
              </div>
              <p className="text-[13.5px] leading-snug text-ink-2">The link uses whatever name you opened App Router with — localhost, this computer's network address, or a Tailscale name — so it works from anywhere App Router does.</p>
            </>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Field label="Address" htmlFor="k-url" className="min-w-[220px] flex-1"><TextInput id="k-url" inputMode="url" autoCapitalize="none" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
              <Field label={<>Port<Optional /></>} htmlFor="k-rport" className="w-[120px]"><TextInput id="k-rport" inputMode="numeric" value={remotePort} onChange={(e) => setRemotePort(e.target.value.replace(/\D/g, "").slice(0, 5))} /></Field>
            </div>
          )}
          {opens && <p className="break-all text-[13.5px] text-ink-2">Opens <span className="font-mono text-[13px] text-ink">{opens}</span></p>}
        </div>

        <div className="flex flex-wrap gap-3">
          <Field label="Directory" htmlFor="k-dir" className="min-w-[200px] flex-1 max-sm:basis-full">
            <Select id="k-dir" value={directoryId ?? ""} onChange={(e) => setDirectoryId(e.target.value || null)}>
              <option value="">{rootName} (the main page)</option>
              {tree.options().map((o) => <option key={o.id} value={o.id}>{"  ".repeat(o.depth + 1)}{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Open in" htmlFor="k-open" className="w-[170px] max-sm:w-full">
            <Select id="k-open" value={openIn} onChange={(e) => setOpenIn(e.target.value === "same" ? "same" : "new")}><option value="new">A new tab</option><option value="same">The same tab</option></Select>
          </Field>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <Checkbox id="k-health" checked={healthOn} onChange={setHealthOn}>Check that it is online and show a status light</Checkbox>
          {healthOn && (
            <Field label={<>Address to check<Optional /></>} htmlFor="k-hpath" hint={checks ? <>Checks <span className="break-all font-mono text-[12.5px]">{checks}</span>. Any answer counts as online, even a sign-in page — only no answer, or a server error (500 and up), counts as down.</> : "Leave empty to check the link itself. A path such as /api/health or a full address also works."}>
              <TextInput id="k-hpath" autoCapitalize="none" placeholder="/api/health" value={healthPath} onChange={(e) => setHealthPath(e.target.value)} />
            </Field>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <div className="text-[13px] font-semibold">Tile</div>
          <div className="flex flex-wrap items-center gap-4">
            {picture ? <img src={picture.preview} alt="" width={48} height={48} className="h-12 w-12 rounded-xl object-cover" />
              : l?.icon.image && !removePicture ? <TileIcon link={l} /> : <TileIcon link={previewLink} />}
            <Field label={<>Letters<Optional /></>} htmlFor="k-text" className="w-[110px]"><TextInput id="k-text" placeholder={initials(name || "New link")} value={text} disabled={hasPicture} onChange={(e) => setText(characters(e.target.value).slice(0, 3).join(""))} /></Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">Colour</span>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tile colour">
                <button type="button" aria-pressed={!color} aria-label="Automatic colour" title="Automatic" disabled={hasPicture} onClick={() => setColor("")}
                  className={cx("flex h-8 cursor-pointer items-center rounded-lg border px-2 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:h-10 pointer-coarse:px-3 pointer-coarse:text-[13.5px]", !color ? "border-accent text-accent-text" : "border-line-2 text-mute")}>Auto</button>
                {TILE_COLORS.map((c) => (
                  <button key={c} type="button" aria-pressed={color === c} aria-label={`Colour ${c}`} disabled={hasPicture} onClick={() => setColor(c)}
                    className={cx("h-8 w-8 cursor-pointer rounded-lg border-2 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:h-10 pointer-coarse:w-10", color === c ? "border-ink" : "border-transparent")} style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileBox} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" aria-label="Choose a picture" onChange={(e) => choosePicture(e.target.files?.[0])} />
            <Button size="sm" icon={<ImagePlus size={15} />} onClick={() => fileBox.current?.click()}>{hasPicture ? "Choose another picture" : "Use a picture instead"}</Button>
            {hasPicture && <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={() => { setPicture(null); setRemovePicture(true); }}>Remove picture</Button>}
            {!hasPicture && !text && !color && <span className="text-[13px] text-mute">Now: “{initials(name || "New link")}” on <span className="font-mono">{colorFor(name || "New link")}</span>, made from the name.</span>}
          </div>
        </div>

        {error && <div role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">{error}</div>}
        <div className="flex flex-wrap items-center gap-2">
          {l && onDelete && <Button variant="danger-outline" icon={<Trash2 size={16} />} onClick={() => onDelete(l)}>Delete</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{l ? "Save" : "Add link"}</Button>
        </div>
      </form>
    </Modal>
  );
}
