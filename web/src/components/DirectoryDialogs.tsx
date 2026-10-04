/** Make a directory, rename one, or move one somewhere else. */
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { Directory } from "../../../shared/types";
import { api, errorText } from "../lib/api";
import { useRefresh } from "../lib/hooks";
import { pathText, type Tree } from "../lib/tree";
import { Button, Field, Modal, Select, TextInput } from "./ui";

export type DirectoryDialogState = { mode: "new"; parentId: string | null } | { mode: "rename"; dir: Directory } | { mode: "move"; dir: Directory };

export function DirectoryDialog({ state, tree, rootName, onClose }: { state: DirectoryDialogState; tree: Tree; rootName: string; onClose: () => void }) {
  const refresh = useRefresh();
  const [name, setName] = useState(state.mode === "rename" ? state.dir.name : "");
  const [parentId, setParentId] = useState<string | null>(state.mode === "new" ? state.parentId : state.mode === "move" ? state.dir.parentId : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // a directory can't go into itself or into anything inside it
  const blocked = state.mode === "move" ? tree.within(state.dir.id) : new Set<string>();
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      if (state.mode === "new") { const d = await api.post<Directory>("/api/directories", { name, parentId }); toast(`Made the directory “${d.name}”.`); }
      else if (state.mode === "rename") { await api.patch(`/api/directories/${state.dir.id}`, { name }); toast("Renamed."); }
      else if (parentId === state.dir.parentId) { onClose(); return; } // already there: leave its place among its neighbours alone
      else { await api.post(`/api/directories/${state.dir.id}/move`, { parentId: parentId ?? "root" }); toast(`Moved “${state.dir.name}”.`); }
      await refresh(); onClose();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  const title = state.mode === "new" ? "New directory" : state.mode === "rename" ? "Rename directory" : `Move “${state.dir.name}”`;
  const where = state.mode === "new" && parentId ? `Inside ${pathText(tree, parentId)}.` : state.mode === "new" ? `On the main page (${rootName}).` : undefined;
  return (
    <Modal open onOpenChange={(v) => { if (!v) onClose(); }} title={title} description={state.mode === "new" ? "Directories group links, the way bookmark folders do. They can hold other directories." : undefined} className="w-[min(480px,94vw)]">
      <form className="flex flex-col gap-4 px-6 pb-6 pt-4" onSubmit={submit}>
        {state.mode !== "move" && <Field label="Name" htmlFor="d-name" hint={where}><TextInput id="d-name" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></Field>}
        {state.mode !== "rename" && (
          <Field label={state.mode === "move" ? "Move it into" : "Where"} htmlFor="d-parent">
            <Select id="d-parent" value={parentId ?? ""} onChange={(e) => setParentId(e.target.value || null)}>
              <option value="">{rootName} (the main page)</option>
              {tree.options().filter((o) => !blocked.has(o.id)).map((o) => <option key={o.id} value={o.id}>{"  ".repeat(o.depth + 1)}{o.label}</option>)}
            </Select>
          </Field>
        )}
        {error && <div role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{state.mode === "new" ? "Make directory" : state.mode === "rename" ? "Rename" : "Move"}</Button>
        </div>
      </form>
    </Modal>
  );
}
