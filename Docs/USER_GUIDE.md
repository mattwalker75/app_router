# User guide

## The page

The page shows the links that sit on the main page first, under a heading you can
rename (it starts as **Apps**). Below that, each top-level directory has its own
section. A directory inside a directory is a tile; click it to see that directory on
its own, with a trail at the top to get back.

A tile shows the link's name, its description if it has one, and its status light.
Click a tile to open it. Hover a tile to see where it goes, and a status light to see
why it is that colour.

A page left open keeps itself current: the lights are asked for again every few
seconds, and the links and directories every half minute, so a change made from another
device shows up without a reload.

The header shows the page's name, the computer App Router runs on, the search box, a
summary of the lights, and **Settings**. With the login on it also shows who is signed
in, with **Change my password** and **Sign out**.

## Add a link

**Add link** opens a form.

| Field | What it is |
| --- | --- |
| Name shown on the page | The tile's name. The only thing every link needs. |
| Description | Optional. Shown on the tile under the name, on up to two lines, and searched. |
| This app runs on the same computer as App Router | Ticked: give a **Port**, and a **Path** only if the app does not live at the root of its port. Unticked: give a full **Address** and, if you like, a **Port**. |
| Type | `http` or `https`, for an app on this computer. |
| Directory | Where the tile goes. The main page, or any directory. |
| Open in | A new tab, or the same tab. |
| Check that it is online | Turns the status light on for this link. **Address to check** is optional: a path such as `/api/health`, or a full address. Empty means the link itself. |
| Tile | Up to 3 letters (an emoji counts as one) and a colour, or a picture. Left alone, the letters and colour come from the name. |

The form shows the address the tile will open as you type.

**An app on this computer** opens on whatever name you used to reach App Router. Open
App Router at `http://localhost` and the tile goes to `http://localhost:3030`. Open it
at `http://mac-mini.tailnet-name.ts.net` and the same tile goes to
`http://mac-mini.tailnet-name.ts.net:3030`.

**An address typed without `http://`** gets one: things on a home network
(`192.168.1.1`, `nas.local`, `printer`) get `http`, everything else `https`.

## Directories

**New directory** makes one on the main page, or inside the directory you are looking
at. A directory's ⋯ menu has: add a link here, new directory inside, rename, move to,
move earlier or later, delete.

Deleting an empty directory asks once. Deleting one with things in it deletes those
too, and asks you to type `DELETE`.

On the main page each top-level directory can be collapsed with the arrow at its right.
That is remembered per browser.

## Change, move and delete

Every tile has a ⋯ menu: **Change…**, **Move earlier**, **Move later**, **Delete…**.

Tiles can also be dragged:

| Drag | Onto | Result |
| --- | --- | --- |
| A link | another link | Takes that place; the others shift. |
| A link | a directory tile, or a directory's heading | Moves into that directory. |
| A link | the gap between tiles of its own section | Takes the place of the nearest link. |
| A link | the free space of another section | Moves to the end of that section. |
| A directory tile | another directory tile beside it | Reorders them. |
| A directory tile | a directory tile somewhere else, or a directory's heading | Moves into that directory. |
| A directory tile | the main page's links, or the free space around them | Becomes a top-level directory. |
| A top-level directory | another, by the handle at its left | Reorders the sections. |

To move a directory into another one that sits beside it, use **Move to…** in its menu.

With a mouse, a drag starts once the tile has moved a little, so a plain click still
opens the link. On a phone or tablet, press and hold a tile for a moment, then drag; a
quick swipe scrolls the page as usual.

## Search

The box at the top finds links by name, description, address or directory name, and
directories by name. Press `/` to jump to it and Escape to clear it. It can be hidden in
Settings → Page.

## Settings

| Section | What is there |
| --- | --- |
| **Page** | The title, the name of the main page, **Allow changes to the page**, **Show the search box**. |
| **Appearance** | Light, Dark, System, and themes of your own. |
| **Health checks** | The master switch, timing, **Check now**. See [Health checks](HEALTH_CHECKS.md). |
| **Access** | Port, network access, other names for this computer, the login, users. See [Security](SECURITY.md). |
| **Backup** | Export, import, and where the files are. See [Data](DATA.md). |

Each setting is marked **Applies immediately** or **Needs restart**. After a
restart-only change a banner reminds you to run `./ROUTER.sh --restart`.

### Allow changes to the page

Off, the page is only for clicking. **Add link** and **New directory** disappear, tiles
lose their ⋯ menu and cannot be dragged, and the server refuses any change to links or
directories. Turn it on again in Settings → Page when you need to change something.

### Themes

**System** follows each device's own light or dark setting. **Light** and **Dark** are
the same for everyone.

**Create your own theme** starts from the colours on screen. Pick colours and watch the
page change; **Save theme** keeps it and applies it. "Based on the dark theme" decides
the colours a theme does not set: the status lights, warnings, the red of delete
buttons, and the browser's own boxes and scrollbars.

A box you are typing in keeps what you typed when you save or flip something else on
the same screen. Nothing is saved until you press that card's **Save**.
