/** Settings → Backup: take the page with you (export), bring it back (import), and where the files are. */
import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "../components/confirm";
import { ApplyBadge, Button, Field, Notice, TextInput } from "../components/ui";
import { api, errorText } from "../lib/api";
import { plural } from "../lib/format";
import { usePage, useRefresh, type AppState } from "../lib/hooks";
import { Card, useSaveSettings } from "./SettingsPage";

export function BackupSection({ state }: { state: AppState }) {
  const save = useSaveSettings();
  const refresh = useRefresh();
  const confirm = useConfirm();
  const page = usePage();
  const d = state.config.data;
  const [file, setFile] = useState(d.file);
  const [icons, setIcons] = useState(d.iconsDir);
  const [chosen, setChosen] = useState<{ name: string; document: unknown; links: number; directories: number } | null>(null);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { setFile(d.file); setIcons(d.iconsDir); }, [d]);
  const editing = state.config.page.allowEditing;
  const here = `${plural(page.data?.links.length ?? 0, "link", "links")} and ${plural(page.data?.directories.length ?? 0, "directory", "directories")}`;

  const choose = async (f: File | undefined) => {
    if (box.current) box.current.value = "";
    if (!f) return;
    try {
      const document = JSON.parse(await f.text());
      if (document?.format !== "app-router-links" || !Array.isArray(document.links) || !Array.isArray(document.directories)) throw new Error("not an export");
      setChosen({ name: f.name, document, links: document.links.length, directories: document.directories.length });
    } catch { setChosen(null); toast.error("That file is not an App Router export. Choose a file made with Export here."); }
  };
  const run = async (mode: "add" | "replace") => {
    if (!chosen) return;
    if (mode === "replace" && !(await confirm({ title: "Replace the whole page?", confirmLabel: "Replace the page", danger: true, typeToConfirm: "REPLACE",
      message: <>The <b>{here}</b> on the page now are removed and replaced by what is in <b>{chosen.name}</b>. Pictures you uploaded for the current links are deleted too.</> }))) return;
    try {
      const r = await api.post<{ links: number; directories: number }>("/api/import", { mode, document: chosen.document, ...(mode === "replace" ? { confirm: "REPLACE" } : {}) });
      toast(`Imported ${plural(r.links, "link", "links")} and ${plural(r.directories, "directory", "directories")}.`);
      setChosen(null); await refresh();
    } catch (e) { toast.error(errorText(e)); }
  };
  return (
    <>
      <h1 className="text-[27px] font-bold">Backup</h1>
      <Card title="Export" sub={`Download every link and directory as one file — a backup, or the way to move the page to another computer. The page has ${here} now.`}>
        <div><a href="/api/export/download" download className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line-2 bg-surface px-4 font-semibold text-ink no-underline hover:bg-surface-2"><Download size={16} />Export the page</a></div>
        <p className="text-[13.5px] text-mute">Pictures you uploaded for links are not in the file — a link without its picture shows its letters again. Settings and users are not in it either: copy <span className="font-mono">config.json</span> for those.</p>
      </Card>
      <Card title="Import" sub="Bring in a file made with Export.">
        {!editing && <Notice>Changes to the page are turned off, so nothing can be imported. Turn them on in Settings → Page first.</Notice>}
        <input ref={box} type="file" accept="application/json,.json" className="hidden" aria-label="Choose an export file" onChange={(e) => choose(e.target.files?.[0])} />
        <div><Button icon={<Upload size={16} />} disabled={!editing} onClick={() => box.current?.click()}>Choose a file…</Button></div>
        {chosen && (
          <div className="flex flex-col gap-3 rounded-xl bg-surface-2 px-4 py-3.5">
            <div><b>{chosen.name}</b> holds {plural(chosen.links, "link", "links")} and {plural(chosen.directories, "directory", "directories")}.</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => run("add")}>Add them to the page</Button>
              <Button variant="danger-outline" onClick={() => run("replace")}>Replace the page with them…</Button>
              <Button variant="ghost" onClick={() => setChosen(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>
      <Card title="Where things are kept" sub="Paths are relative to the folder config.json is in. A changed path is used after a restart; move the files yourself.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Links file" htmlFor="b-file" badge={<ApplyBadge restart />} hint={<>Now: <span className="break-all font-mono text-[12.5px]">{state.dataFile}</span></>}>
            <TextInput id="b-file" className="font-mono !text-[14px]" value={file} onChange={(e) => setFile(e.target.value)} />
          </Field>
          <Field label="Pictures folder" htmlFor="b-icons" badge={<ApplyBadge restart />} hint={<>Now: <span className="break-all font-mono text-[12.5px]">{state.iconsDir}</span></>}>
            <TextInput id="b-icons" className="font-mono !text-[14px]" value={icons} onChange={(e) => setIcons(e.target.value)} />
          </Field>
        </div>
        <div><Button variant="primary" onClick={() => save({ data: { file, iconsDir: icons } })}>Save</Button></div>
      </Card>
    </>
  );
}
