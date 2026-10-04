/**
 * ROUTER.sh and AUTOSTART.sh, run for real in a scratch copy of the app — with a stand-in
 * `launchctl` first on PATH and HOME pointed at a scratch folder, so nothing is installed
 * on this computer. The stand-in does what macOS would: "bootstrap" starts the server the
 * launchd file names, "bootout" stops it, "print" says whether it is loaded.
 *
 * macOS only (launchd), and it needs the app built (dist/); otherwise the suite is skipped.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = path.resolve(import.meta.dirname, "..");
const built = fs.existsSync(path.join(REPO, "dist/node/server/src/index.js")) && fs.existsSync(path.join(REPO, "dist/web/index.html"));
const canRun = process.platform === "darwin" && built;

let tmp: string, home: string, app: string, bin: string, log: string, port: number;
const LABEL = "com.app-router.server";
const plist = () => path.join(home, "Library/LaunchAgents", `${LABEL}.plist`);
const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean) : []);
const sh = (script: string, ...args: string[]) => {
  const r = spawnSync("bash", [path.join(app, script), ...args], {
    encoding: "utf8", timeout: 60_000, cwd: app,
    env: (() => { const e: NodeJS.ProcessEnv = { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}`, AR_NO_OPEN: "1", FAKE_STATE: tmp }; delete e.AR_CONFIG; delete e.PORT; delete e.AR_NO_AUTOSTART; return e; })(),
  });
  return { rc: r.status, out: (r.stdout || "") + (r.stderr || "") };
};
const answering = async () => { try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); return (await r.json()).app === "app-router"; } catch { return false; } };
const freePort = () => new Promise<number>((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });

beforeAll(async () => {
  if (!canRun) return;
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ar-scripts-")));
  home = path.join(tmp, "home"); app = path.join(tmp, "app"); bin = path.join(tmp, "bin"); log = path.join(tmp, "launchctl.log");
  for (const d of [home, app, bin, path.join(app, "dist"), path.join(app, "data")]) fs.mkdirSync(d, { recursive: true });
  for (const f of ["ROUTER.sh", "AUTOSTART.sh", "config.example.json", "package.json"]) fs.copyFileSync(path.join(REPO, f), path.join(app, f));
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(app, "node_modules"));
  fs.symlinkSync(path.join(REPO, "dist/node"), path.join(app, "dist/node"));
  fs.symlinkSync(path.join(REPO, "dist/web"), path.join(app, "dist/web"));
  fs.writeFileSync(path.join(app, "dist/.built"), "");
  port = await freePort();
  fs.writeFileSync(path.join(app, "config.json"), JSON.stringify({ server: { port }, health: { enabled: false } }));
  // the stand-in launchctl: one service, whose program and environment come from the launchd file it is given
  fs.writeFileSync(path.join(bin, "launchctl"), `#!/usr/bin/env bash
echo "$*" >> "$FAKE_STATE/launchctl.log"
PID="$FAKE_STATE/service.pid"; PLIST="$FAKE_STATE/service.plist"
alive() { [[ -f "$PID" ]] && kill -0 "$(cat "$PID")" 2>/dev/null; }
run() { # start what the launchd file says
  local node entry cfg out
  node="$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:0' "$1")"; entry="$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:1' "$1")"
  cfg="$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:AR_CONFIG' "$1")"; out="$(/usr/libexec/PlistBuddy -c 'Print :StandardOutPath' "$1")"
  AR_CONFIG="$cfg" nohup "$node" "$entry" >> "$out" 2>&1 & echo $! > "$PID"; cp "$1" "$PLIST"
}
halt() { alive && kill "$(cat "$PID")"; for _ in 1 2 3 4 5 6 7 8 9 10; do alive || break; sleep 0.1; done; rm -f "$PID"; }
case "$1" in
  bootstrap) alive && exit 37; run "$3" ;;
  bootout)   alive || exit 3; halt; rm -f "$PLIST" ;;
  print)     alive || exit 113 ;;
  kickstart) alive || exit 113; halt; run "$PLIST" ;;
esac
exit 0
`, { mode: 0o755 });
}, 60_000);

afterAll(() => {
  if (!canRun) return;
  try { const pid = Number(fs.readFileSync(path.join(tmp, "service.pid"), "utf8")); if (pid) process.kill(pid); } catch {}
  try { const pid = Number(fs.readFileSync(path.join(app, "data/router.pid"), "utf8")); if (pid) process.kill(pid); } catch {}
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe.skipIf(!canRun)("ROUTER.sh by itself", () => {
  it("starts in the background, says where, and does not start twice", async () => {
    const start = sh("ROUTER.sh", "--start");
    expect(start.rc, start.out).toBe(0);
    expect(start.out).toMatch(new RegExp(`App Router is running — http://localhost:${port}`));
    expect(await answering()).toBe(true);
    expect(sh("ROUTER.sh", "--start").out).toMatch(/Already running \(pid \d+\)/);
    expect(sh("ROUTER.sh", "--status").out).toMatch(/Running \(pid \d+\)/);
  });
  it("check reports what is in place", () => {
    const r = sh("ROUTER.sh", "--check");
    expect(r.rc, r.out).toBe(0);
    expect(r.out).toMatch(new RegExp(`config.json present \\(port ${port}, network access false, login false, changes to the page true, health checks false\\)`));
    expect(r.out).toMatch(/Does not start with the computer/);
    expect(r.out).toMatch(/App Router is running/);
  });
  it("restart and stop", async () => {
    const r = sh("ROUTER.sh", "--restart");
    expect(r.rc, r.out).toBe(0); expect(r.out).toMatch(/Stopped\./); expect(await answering()).toBe(true);
    expect(sh("ROUTER.sh", "-x").out).toMatch(/Stopped\./);
    expect(await answering()).toBe(false);
    expect(sh("ROUTER.sh", "status").out).toMatch(/Not running\./);
    expect(sh("ROUTER.sh", "--stop").out).toMatch(/Not running\./);
    expect(fs.existsSync(path.join(app, "data/router.pid"))).toBe(false);
  });
  it("a pid file left over from before a reboot is not trusted: the other program is never stopped", async () => {
    const pidFile = path.join(app, "data/router.pid");
    fs.writeFileSync(pidFile, String(process.pid));                    // alive, and NOT App Router (it is this test run)
    expect(sh("ROUTER.sh", "--status").out).toMatch(/Not running\./);
    expect(fs.existsSync(pidFile)).toBe(false);
    fs.writeFileSync(pidFile, String(process.pid));
    expect(sh("ROUTER.sh", "--stop").out).toMatch(/Not running\./);   // would have been `kill <this test>`
    fs.writeFileSync(pidFile, String(process.pid));
    const start = sh("ROUTER.sh", "--start");
    expect(start.rc, start.out).toBe(0); expect(start.out).not.toMatch(/Already running/);
    expect(await answering()).toBe(true);
    expect(fs.readFileSync(pidFile, "utf8").trim()).not.toBe(String(process.pid));
    fs.writeFileSync(pidFile, "not a number");
    expect(sh("ROUTER.sh", "--status").out).toMatch(/Running — .*not started by this script/);
    const pid = spawnSync("lsof", ["-nP", `-tiTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).stdout.trim().split("\n")[0];
    fs.writeFileSync(pidFile, pid); sh("ROUTER.sh", "--stop");
    expect(await answering()).toBe(false);
  });
  it("--fg refuses while a background copy is running", async () => {
    sh("ROUTER.sh", "--start");
    const r = sh("ROUTER.sh", "--fg");
    expect(r.rc).toBe(1); expect(r.out).toMatch(/Already running in the background .* stop it first/);
    sh("ROUTER.sh", "--stop");
  });
  it("an unknown option is refused with the help", () => {
    const r = sh("ROUTER.sh", "--nope");
    expect(r.rc).toBe(2); expect(r.out).toMatch(/Unknown option: --nope/); expect(r.out).toMatch(/Usage: {2}\.\/ROUTER\.sh/);
  });
});

describe.skipIf(!canRun)("AUTOSTART.sh", () => {
  it("--print shows the launchd file and installs nothing", () => {
    const r = sh("AUTOSTART.sh", "--print");
    expect(r.rc, r.out).toBe(0);
    expect(r.out).toContain(`<key>Label</key><string>${LABEL}</string>`);
    expect(r.out).toContain(`<string>${app}/dist/node/server/src/index.js</string>`);
    expect(r.out).toContain(`<key>AR_CONFIG</key><string>${app}/config.json</string>`);
    expect(r.out).toContain("<key>KeepAlive</key><true/>"); expect(r.out).toContain("<key>RunAtLoad</key><true/>");
    // the log is kept outside the app's folder, which may be one macOS guards (Desktop, Documents)
    expect(r.out).toContain(`<key>StandardOutPath</key><string>${home}/Library/Logs/app-router.log</string>`);
    expect(r.out).not.toContain("UserName");
    expect(sh("AUTOSTART.sh", "--print", "--system").out).toContain(`<key>UserName</key><string>${os.userInfo().username}</string>`);
    expect(fs.existsSync(plist())).toBe(false); expect(calls()).toEqual([]);
  });
  it("--status before installing", () => {
    const r = sh("AUTOSTART.sh", "--status");
    expect(r.out).toMatch(/Automatic start is not installed/); expect(r.out).toMatch(/App Router is not running/);
  });
  it("--install writes the file to ~/Library/LaunchAgents, loads it, and App Router is running", async () => {
    const r = sh("AUTOSTART.sh", "--install");
    expect(r.rc, r.out).toBe(0);
    expect(r.out).toMatch(/App Router now starts when you log in, and is running/);
    expect(fs.existsSync(plist())).toBe(true);
    expect(spawnSync("plutil", ["-lint", plist()]).status).toBe(0);
    expect(calls().some((c) => c === `bootstrap gui/${process.getuid!()} ${plist()}`)).toBe(true);
    expect(await answering()).toBe(true);
    expect(fs.readFileSync(path.join(home, "Library/Logs/app-router.log"), "utf8")).toMatch(/App Router .* — http:\/\/localhost/);
    const st = sh("AUTOSTART.sh", "--status");
    expect(st.out).toMatch(/Starts when you log in/); expect(st.out).toMatch(/macOS has it loaded/); expect(st.out).toMatch(/App Router is running/);
  });
  it("while installed, ROUTER.sh works through it", async () => {
    expect(sh("ROUTER.sh", "--status").out).toMatch(/Running, kept running by the system/);
    expect(sh("ROUTER.sh", "--start").out).toMatch(/Already running \(kept running by the system\)/);
    expect(sh("ROUTER.sh", "--check").out).toMatch(/Starts with the computer/);
    const stop = sh("ROUTER.sh", "--stop");
    expect(stop.rc, stop.out).toBe(0); expect(stop.out).toMatch(/Stopped\. \(It starts again when the computer does/);
    expect(await answering()).toBe(false);
    expect(fs.existsSync(plist())).toBe(true);                         // still installed: it comes back at the next login
    expect(sh("ROUTER.sh", "--stop").out).toMatch(/Not running\./);
    expect(sh("AUTOSTART.sh", "--status").out).toMatch(/macOS does not have it loaded/);
    const start = sh("ROUTER.sh", "--start");
    expect(start.rc, start.out).toBe(0); expect(start.out).toMatch(/kept running by the system/);
    expect(await answering()).toBe(true);
    expect(fs.existsSync(path.join(app, "data/router.pid"))).toBe(false); // not the by-hand way
    const restart = sh("ROUTER.sh", "--restart");
    expect(restart.rc, restart.out).toBe(0); expect(await answering()).toBe(true);
    // a foreground or developer run would fight the system's copy for the port
    for (const how of ["--fg", "--dev"]) { const r = sh("ROUTER.sh", how); expect(r.rc, how).toBe(1); expect(r.out).toMatch(/kept running by the system; stop it first/); }
  });
  it("installing again is harmless", async () => {
    const r = sh("AUTOSTART.sh", "--install");
    expect(r.rc, r.out).toBe(0); expect(await answering()).toBe(true);
  });
  it("--remove stops it and takes the file away; ROUTER.sh is back to starting it by hand", async () => {
    const r = sh("AUTOSTART.sh", "--remove");
    expect(r.rc, r.out).toBe(0); expect(r.out).toMatch(/no longer starts by itself, and is stopped/);
    expect(fs.existsSync(plist())).toBe(false); expect(await answering()).toBe(false);
    expect(sh("AUTOSTART.sh", "--remove").out).toMatch(/Automatic start is not installed/);
    expect(sh("ROUTER.sh", "--start").out).toMatch(/App Router is running — /);
    expect(fs.existsSync(path.join(app, "data/router.pid"))).toBe(true);
    sh("ROUTER.sh", "--stop");
  });
  it("installing takes over from a copy started by hand", async () => {
    sh("ROUTER.sh", "--start"); expect(await answering()).toBe(true);
    const r = sh("AUTOSTART.sh", "--install");
    expect(r.rc, r.out).toBe(0); expect(r.out).toMatch(/Stopping the copy started with \.\/ROUTER\.sh/);
    expect(fs.existsSync(path.join(app, "data/router.pid"))).toBe(false); expect(await answering()).toBe(true);
    sh("AUTOSTART.sh", "--remove");
  });
  it("says what to do when given nothing it knows", () => {
    expect(sh("AUTOSTART.sh", "--nope").rc).toBe(2);
    expect(sh("AUTOSTART.sh").out).toMatch(/AUTOSTART\.sh — have App Router start by itself/);
  });
});
