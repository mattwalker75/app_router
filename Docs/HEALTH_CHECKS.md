# Health checks

A health check answers one question: is this link answering? The result is the light
on its tile.

| Light | Shape | Meaning |
| --- | --- | --- |
| **Online** | green dot | It answered. |
| **Just back** | yellow ring | It answers again after being down. |
| **Down** | red square | No answer, or a server error. |
| **Not checked** | grey ring | Checks are off for this link, or for everything. |
| **Checking…** | dashed grey ring | On, but there is no verdict yet. |

Each light has its own shape as well as its own colour, and a label beside it.

## How a link is checked

The server asks for the link's address on a timer and looks only at whether, and how
fast, something answered.

- **Any reply below HTTP 500 counts as online.** A sign-in page (401), "not found" (404)
  or a redirect means the app is up.
- **No reply, or a reply of 500 and up, is a failed check.**
- A link turns red after **2 failed checks in a row**, so one missed check is forgiven.
  The tile says how long it has been down.
- When a red link answers again it turns yellow for **10 minutes**, then green. The
  tile says how long ago it came back.
- A link that was never down starts green.

Those numbers are settings.

## What is asked

- **An app on this computer** is asked on its port through `localhost`, for example
  `http://localhost:3030/`.
- **A link elsewhere** is asked at its address.
- **Address to check** on the link replaces that: a path (`/api/health`) is added to
  the link's own address, a full address is used as it is.

Because an app on this computer is asked directly, its light shows whether the app is
**running**. It does not show whether other devices are allowed to reach it; that is
the app's own network setting.

A check never follows redirects, never sends cookies, and keeps nothing of the reply.
Certificates are not verified, so an app on your network with a self-made certificate
still counts as up.

## Settings

**Settings → Health checks**

| Setting | Default | Range |
| --- | --- | --- |
| Check the links and show status lights | on | |
| Check every (seconds) | 30 | 5 to 3600 |
| Wait for an answer (seconds) | 5 | 1 to 60 |
| Stay yellow after coming back (minutes) | 10 | 0 to 1440. 0 means straight back to green. |
| Failed checks in a row before red | 2 | 1 to 10 |

All of them apply from the next round. **Check now** runs a round at once.

Each link also has its own switch in its form, so a link can opt out. Turn it off for
sites you do not run: there is little point asking GitHub every 30 seconds.

## Good to know

- Nothing is remembered between restarts. After a restart every light is "Checking…"
  for a moment, and "down for" starts counting again.
- A new or changed link is checked straight away.
- The page asks for the lights again every few seconds, so it follows the checks
  without a reload.
- The header shows a summary such as `8 online · 1 just back · 1 down`. A directory
  shows the same for everything inside it.
