/** Settings → Page: what the page is called, whether it can be changed, whether it has a search box. */
import { useEffect, useState } from "react";
import { ApplyBadge, Button, Field, TextInput, ToggleRow } from "../components/ui";
import type { AppState } from "../lib/hooks";
import { Card, useSaveSettings } from "./SettingsPage";

export function PageSection({ state }: { state: AppState }) {
  const save = useSaveSettings();
  const p = state.config.page;
  const [title, setTitle] = useState(p.title);
  const [rootName, setRootName] = useState(p.rootName);
  // each box follows its OWN saved value: flipping a switch below must not undo what you are typing
  useEffect(() => { setTitle(p.title); }, [p.title]);
  useEffect(() => { setRootName(p.rootName); }, [p.rootName]);
  return (
    <>
      <h1 className="text-[27px] font-bold">Page</h1>
      <Card title="Names" sub="What the page calls itself, and the heading over the links that are not in a directory.">
        <div className="grid gap-4 @xl:grid-cols-2">
          <Field label="Title" htmlFor="p-title" badge={<ApplyBadge />} hint="Shown at the top left and on the browser tab."><TextInput id="p-title" maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Name of the main page" htmlFor="p-root" badge={<ApplyBadge />} hint="The heading over the top-level links — “Apps” to begin with."><TextInput id="p-root" maxLength={40} value={rootName} onChange={(e) => setRootName(e.target.value)} /></Field>
        </div>
        <div><Button variant="primary" onClick={() => save({ page: { title, rootName } })}>Save</Button></div>
      </Card>
      <Card title="What the page shows" sub="These apply as soon as you flip them.">
        <ToggleRow title="Allow changes to the page" badge={<ApplyBadge />} checked={p.allowEditing}
          onChange={(v) => save({ page: { allowEditing: v } }, v ? "Changes to the page are on." : "Changes to the page are off — the page is now only for clicking.")}>
          On: the page has <b>Add link</b> and <b>New directory</b> buttons, every tile has a ⋯ menu, and tiles can be dragged. Off: all of that is hidden and nothing about links or directories can be changed or deleted — the page is only for clicking. Turn it on again here whenever you need to change something.
        </ToggleRow>
        <ToggleRow title="Show the search box" badge={<ApplyBadge />} checked={p.showSearch}
          onChange={(v) => save({ page: { showSearch: v } }, v ? "The search box is shown." : "The search box is hidden.")}>
          The box at the top that finds a link by its name, description, address or directory.
        </ToggleRow>
      </Card>
    </>
  );
}
