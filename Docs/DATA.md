# Data

## What is stored, and where

| What | Where | Committed to git |
| --- | --- | --- |
| Settings | `config.json` | no |
| Users and password hashes | `.password` | no |
| Links and directories | `data/links.json` | no |
| Pictures uploaded for links | `data/icons/` | no |
| Logs | `data/router.log`, `data/build.log`, `data/test.log`. With automatic start: `~/Library/Logs/app-router.log` | no |

The paths of the links file, the pictures folder and the password file are settings.

**To back everything up, copy `config.json`, `.password` and the `data/` folder.**
`.password` only exists while the login is on.

## The links file

`data/links.json` is plain JSON, rewritten after every change. Writes go to a temporary
file first, so a crash cannot leave half a file.

```json
{
  "format": "app-router-links",
  "version": 1,
  "directories": [
    { "id": "k3m9x2pq7wza", "name": "Home lab", "parentId": null, "position": 0 }
  ],
  "links": [
    {
      "id": "p7w2ka9xq3mz", "name": "My Business Manager", "description": "",
      "directoryId": null, "position": 0,
      "local": true, "scheme": "http", "port": 3030, "path": "", "url": "",
      "openIn": "new",
      "icon": { "text": "", "color": "", "image": null },
      "health": { "enabled": true, "path": "" }
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `id` | A 12-character id made by the app: lowercase letters and digits only. |
| `parentId`, `directoryId` | The directory it is in. `null` means the main page. |
| `position` | Its place among its neighbours, from 0. |
| `local` | `true`: an app on the same computer, opened by `scheme`, `port` and `path`. `false`: opened by `url`, with `port` as an optional override. |
| `openIn` | `new` or `same` tab. |
| `icon.text`, `icon.color` | Letters and colour for the tile. Empty means made from the name. |
| `icon.image` | File name of an uploaded picture in the pictures folder, or `null`. |
| `health.enabled`, `health.path` | Whether the link is checked, and an optional address to check. |
| `createdAt`, `updatedAt` | When it was made and last changed. The app adds these. |

You can edit the file by hand while App Router is stopped. If it is not valid JSON, or
is not a links file at all, App Router says so and does not start, so nothing is
overwritten.

Smaller slips are repaired when it starts: a missing field gets its default, a link
that names a directory that is not there goes to the main page, a second entry with the
same `id` or one with no `id` is left out, and directories that contain each other are
untied. An `id` typed by hand with anything but lowercase letters and digits in it gets
a new one (ids end up in addresses and in the names of picture files), and whatever
pointed at it follows. A picture name the app did not make is dropped. The repaired
version is written back at the next change you make on the page.

Directories nest up to 8 deep.

## Pictures

A picture is redrawn by the browser as a 192-pixel PNG before upload, then stored as
`data/icons/<link id>-<random>.png`. Replacing or removing the picture, or deleting the
link, deletes the file.

## Export and import

**Settings → Backup → Export the page** downloads the links file as
`app-router-links-<date>-<time>.json`.

**Import** takes such a file:

- **Add them to the page** keeps what is there and adds the file's links and
  directories alongside, with new ids.
- **Replace the page with them…** removes everything first. It asks you to type
  `REPLACE`.

Pictures are not in an export. An imported link shows its letters until you give it a
picture again. Settings and users are not in it either.

A file is refused, and nothing changes, when it is not an export, holds a link that
cannot be opened or an entry that is not a link or directory, has two directories with
the same `id`, or nests directories more than 8 deep. An import file can be up to 5 MB.

Import needs **Allow changes to the page** to be on.

## Moving to another computer

Either copy `config.json`, `.password` and `data/` across, or export on the old
computer and import on the new one. Links to apps "on this computer" then point at the
new computer, which is what you want when the apps move too.
