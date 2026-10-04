# Security

App Router has three independent switches. Each is off or open by default in the way
that suits one person on one computer.

| Switch | Default | Where |
| --- | --- | --- |
| Allow other devices on my network | off | Settings → Access |
| The login | off | Settings → Access |
| Allow changes to the page | on | Settings → Page |

## Network access

**Off:** only the computer App Router runs on can open the page. On a port of 1024 or
higher it listens on `127.0.0.1`. On a lower port, such as the default 80, macOS only
allows listening on every address, so App Router does that and drops every connection
that does not come from the computer itself, before reading anything from it.

**On:** it listens on every address, and Settings lists the addresses other devices can
use. The change needs a restart.

A VPN such as Tailscale counts as a network: reaching the Mac over Tailscale needs
network access on.

### Names the page answers to

App Router answers only when it is opened by a name the computer really has:
`localhost`, `127.0.0.1`, and with network access on, its hostname and addresses. Any
other name gets "This address is not one this computer answers to." (HTTP 421).
Which names count follows how the server was started, so switching network access in
Settings changes nothing here until the restart.

Add the names you use under **Other names for this computer**, for example your
Tailscale name. This stops a web page elsewhere from pointing a name of its own at your
computer.

### What network access does not do

It opens App Router only. A link to an app on the same computer works from another
device only if **that app** also allows network access. Each app also keeps its own
login: someone who can open App Router cannot open your apps because of it.

## The login

Off, the page opens for anyone who can reach it. On, everyone signs in first: the page,
the status lights, the pictures and every setting need a sign-in.

**Turn the login on…** asks for a login name and password and creates the first user in
the same step, so the login is never on without a user. You stay signed in.

**Turn the login off…** asks you to type `DISABLE`. It removes every user and the
password file. Links, directories and settings stay.

> With network access on and the login off, anyone on your network can open the page.
> While changes are allowed they can also change the page and the settings. App Router
> warns about this in Settings and when it starts.

### Users

Every user signs in with their own name and password, sees the same page, and can do
everything. There are no roles.

Any user can:

- **Add a user.**
- **Set a new password** for another user. That user is signed out everywhere.
- **Remove** another user, by typing `DELETE`. They are signed out at once.
- **Change their own password**, with the current one. They stay signed in.

You cannot remove yourself. Nobody can create a user from the sign-in screen.

### Passwords

- 8 to 72 characters. Every password box has an eye button to show what you typed.
  (72 is as much as the password hashing can use; a longer one is refused, not cut.)
- Stored as bcrypt hashes in the password file, `./.password` by default, readable only
  by you. Login names are unique whatever their capitals.
- Signing in is limited to 10 attempts per 5 minutes from one address. Turning the
  login on, creating the first login and changing your own password count toward the
  same limit.
- A wrong name and a wrong password give the same message.

### Forgot a password

Another user can set a new one in Settings → Access. If nobody can sign in, delete the
password file on the computer that runs App Router and reload the page. You are asked
to create a login again. Links, directories and settings are untouched.

### Sessions

A sign-in lasts `security.sessionHours` (12 by default), counted from the moment of
signing in and enforced by the server, not only by the browser. **Sign out** ends that
session for good, even for a copy of its cookie. Restarting App Router signs everyone
out. Removing a user or changing their password ends their sessions.

The users are the password file. Change its place in Settings and the file is moved
there, so nobody is locked out; a place that already holds a file is refused.

## Changes to the page

With **Allow changes to the page** off, nothing about links or directories can be
added, changed, moved, deleted or imported. The buttons are hidden and the server
refuses the requests. Settings stays reachable, which is how you turn it back on.

This is a guard against accidents, not against people: anyone who can open Settings can
turn it on. Use the login to keep people out.

## Other protections

- A change must come from a page App Router served. A form on another site cannot
  change anything.
- Pages cannot be framed by other sites, and only App Router's own scripts run.
- Uploaded pictures must be PNG, JPEG, WebP or GIF, up to 1 MB. The browser redraws
  them as a small PNG before uploading.
- A link can only open `http://` or `https://` addresses.
- Health checks only record whether something answered. See
  [Health checks](HEALTH_CHECKS.md).
- A links file edited by hand cannot produce a tile that runs a script: anything that
  is not an `http` or `https` address opens nothing.

## Good to know

- **What is open without a sign-in.** The page's own files (its code and font, with no
  data in them) and `/api/health`, which the scripts use and which gives the version.
  Everything else needs a sign-in while the login is on.
- **Health checks reach out from the server.** Anyone who can change the page can make
  the computer App Router runs on ask for any `http` or `https` address and learn
  whether it answered. With the login off and network access on, that is anyone on the
  network.
- **Cookies belong to a computer's name, not to a port.** A browser sends App Router's
  session cookie to every app on the same computer. Your other apps ignore it, and each
  uses a cookie name of its own, so their logins do not clash. Only run apps you trust
  on that computer.
- **The log is not sent anywhere** and holds no passwords. `ROUTER.sh` trims it when it
  passes 5 MB.

## What it does not do

- No HTTPS of its own. On your own network or over Tailscale that is the usual setup.
  Do not put it on the public internet as it is.
- No roles, and no single sign-on to your apps. Both are on purpose.
