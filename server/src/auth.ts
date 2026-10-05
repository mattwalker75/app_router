/**
 * The optional login, done the same way as my_business_manager and people_manager:
 *
 *  - Settings → Access turns it on or off (security.loginEnabled).
 *  - Credentials live in ONE file, the password file (default ./.password):
 *    {"users": [{"loginName": "...", "passwordHash": "$2b$10$..."}, …]} with
 *    owner-only access. (A file from before several users existed — a single
 *    {"loginName", "passwordHash"} — is still read, and rewritten in the new
 *    shape on the next change.)
 *  - No file → the app asks you to create a login name and password, then
 *    writes the file. Forgot every password? Delete the file and reload.
 *    Your links are never touched by that: only the passwords are gone.
 *  - Sessions are signed cookies with a key made fresh at every start, so a
 *    restart signs you out. A session also carries a fingerprint of the
 *    password it was made with, so removing a user or resetting their
 *    password signs them out on their next click.
 *
 * Every user sees the same page and may do everything (there are no roles).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { Request } from "express";
import type { Config } from "./config.js";
import { UserError, writeAtomic } from "./util.js";

interface StoredLogin { loginName: string; passwordHash: string }
export interface SessionData {
  loginName?: string;
  /** fingerprint of the password this session signed in with */
  credTag?: string;
  /** when the session was made (ms) — the server, not only the browser, ends it after security.sessionHours */
  at?: number;
  /** a random id, so signing out ends THIS session even if its cookie was copied */
  sid?: string;
}
export interface Credential { loginName: string; credTag: string }

/** the same minimum as my_business_manager; only checked when a password is SET, so older, shorter ones still sign in */
export const MIN_PASSWORD = 8;
/** bcrypt only looks at the first 72 bytes of a password; anything longer would be silently cut */
export const MAX_PASSWORD_BYTES = 72;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const tagOf = (passwordHash: string) => crypto.createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);

/** Is the file at `file` a password file (one this app wrote, in either of its two shapes)? */
function looksLikePasswordFile(file: string): boolean {
  try {
    const p = JSON.parse(fs.readFileSync(file, "utf8")) as { users?: unknown; loginName?: unknown; passwordHash?: unknown };
    const list = (Array.isArray(p?.users) ? p.users : [p]) as { loginName?: unknown; passwordHash?: unknown }[];
    return list.length > 0 && list.every((u) => typeof u?.loginName === "string" && typeof u?.passwordHash === "string");
  } catch { return false; }
}

export class Auth {
  /** compared against when the login name is unknown (made on first need) */
  private decoy: string | null = null;
  /** sessions that signed out: id → when the session would have ended anyway (kept until then; a restart ends every session) */
  private signedOut = new Map<string, number>();
  /** how long a sign-in lasts — fixed when the server starts, like the cookie's own lifetime */
  private readonly sessionMs: number;

  constructor(private readonly config: Config) {
    this.sessionMs = Math.max(1, Number(config.get().security.sessionHours) || 12) * 3600_000;
  }

  /** What a new session holds. */
  session(cred: Credential): SessionData {
    return { loginName: cred.loginName, credTag: cred.credTag, at: Date.now(), sid: crypto.randomBytes(9).toString("base64url") };
  }
  /** Signing out: this session's cookie stops working, even a copy of it. */
  revoke(req: Request): void {
    const s = req.session as SessionData | null | undefined;
    if (s?.sid && s.at) this.signedOut.set(s.sid, s.at + this.sessionMs);
    const now = Date.now();
    for (const [sid, until] of this.signedOut) if (until < now) this.signedOut.delete(sid);
  }

  file(): string { return this.config.resolve(this.config.get().security.passwordFile); }
  enabled(): boolean { return !!this.config.get().security.loginEnabled; }
  initialized(): boolean { return fs.existsSync(this.file()); }

  private read(): StoredLogin[] {
    const damaged = () => new UserError(`The password file ${this.file()} is damaged. Delete it and reload to create a new login.`, 500);
    let parsed: { users?: unknown; loginName?: unknown; passwordHash?: unknown };
    try { parsed = JSON.parse(fs.readFileSync(this.file(), "utf8")); } catch { throw damaged(); }
    const list = (Array.isArray(parsed?.users) ? parsed.users : [parsed]) as Partial<StoredLogin>[];
    if (!list.length || list.some((u) => typeof u?.loginName !== "string" || typeof u?.passwordHash !== "string")) throw damaged();
    return list.map((u) => ({ loginName: u.loginName!, passwordHash: u.passwordHash! }));
  }
  private write(list: StoredLogin[]): void {
    writeAtomic(this.file(), JSON.stringify({ users: list }, null, 2) + "\n", 0o600);
    try { fs.chmodSync(this.file(), 0o600); } catch {}
  }
  private logins(): StoredLogin[] { return this.initialized() ? this.read() : []; }
  private find(name: string): StoredLogin | undefined { return this.logins().find((u) => same(u.loginName, name)); }

  /** Does this name have a password (can it sign in)? */
  has(name: string): boolean { try { return !!this.find(name); } catch { return false; } }
  /** Every name in the password file. */
  names(): string[] { try { return this.logins().map((u) => u.loginName); } catch { return []; } }

  /** The login name of a signed-in request, or null. A removed user or a changed password ends the session. */
  current(req: Request): string | null {
    const s = req.session as SessionData | null | undefined;
    if (!s?.loginName || !s.credTag || !s.at || !s.sid || !this.initialized()) return null;
    if (Date.now() - s.at > this.sessionMs || s.at > Date.now() + 60_000 || this.signedOut.has(s.sid)) return null;
    try { const u = this.find(s.loginName); return u && tagOf(u.passwordHash) === s.credTag ? u.loginName : null; } catch { return null; }
  }

  status(req: Request): "disabled" | "not_initialized" | "unauthenticated" | "authenticated" {
    if (!this.enabled()) return "disabled";
    if (!this.initialized()) return "not_initialized";
    return this.current(req) ? "authenticated" : "unauthenticated";
  }

  /** May this request use the app? */
  allowed(req: Request): boolean {
    const st = this.status(req);
    return st === "disabled" || st === "authenticated";
  }

  private static check(loginName: unknown, password: unknown): { name: string; password: string } {
    const name = String(loginName || "").trim();
    if (!name) throw new UserError("Choose a login name.");
    if (name.length > 64) throw new UserError("Keep the login name under 64 characters.");
    Auth.checkPassword(password);
    return { name, password: String(password) };
  }
  private static checkPassword(password: unknown): void {
    if (!password || String(password).length < MIN_PASSWORD) throw new UserError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
    if (Buffer.byteLength(String(password), "utf8") > MAX_PASSWORD_BYTES) throw new UserError(`Keep the password to ${MAX_PASSWORD_BYTES} characters or fewer (fewer still with accents or emoji).`);
  }
  private cred(u: StoredLogin): Credential { return { loginName: u.loginName, credTag: tagOf(u.passwordHash) }; }

  /** First run: create the first login. */
  async setup(loginName: unknown, password: unknown): Promise<Credential> {
    if (this.initialized()) throw new UserError("A login already exists. To start over, delete the password file and reload.", 409);
    const v = Auth.check(loginName, password);
    const u = { loginName: v.name, passwordHash: await bcrypt.hash(v.password, 10) };
    this.write([u]);
    return this.cred(u);
  }

  async login(loginName: unknown, password: unknown): Promise<Credential> {
    if (!this.initialized()) throw new UserError("No login has been created yet.", 409);
    const u = this.find(String(loginName || "").trim());
    // an unknown name costs the same bcrypt time as a wrong password, so timing does not reveal which names exist
    if (!u) this.decoy ??= await bcrypt.hash("nobody-signs-in-with-this", 10);
    const ok = await bcrypt.compare(String(password || ""), u?.passwordHash ?? this.decoy!);
    if (!u || !ok) throw new UserError("That login name and password do not match.", 401);
    return this.cred(u);
  }

  /** Add another login. Names are unique whatever their capitals. */
  async add(loginName: unknown, password: unknown): Promise<string> {
    const v = Auth.check(loginName, password);
    const taken = () => { if (this.logins().some((u) => same(u.loginName, v.name))) throw new UserError(`There is already a user called “${v.name}”. Pick a different login name.`, 409); };
    taken();
    const passwordHash = await bcrypt.hash(v.password, 10);
    // read the list again AFTER the slow hashing, so a user removed or changed meanwhile is not put back
    taken();
    this.write([...this.logins(), { loginName: v.name, passwordHash }]);
    return v.name;
  }

  /** Give `name` this password — replacing the one it has, or creating its login when it has none. */
  async setPassword(name: string, password: unknown): Promise<Credential> {
    Auth.checkPassword(password);
    const passwordHash = await bcrypt.hash(String(password), 10);
    const u = { loginName: this.find(name)?.loginName ?? name, passwordHash };
    this.write([...this.logins().filter((x) => !same(x.loginName, name)), u]);
    return this.cred(u);
  }

  /** Change your own password: the current one must be right. */
  async changeOwn(name: string, current: unknown, next: unknown): Promise<Credential> {
    const u = this.find(name);
    if (!u || !(await bcrypt.compare(String(current || ""), u.passwordHash))) throw new UserError("That is not your current password.", 403);
    return this.setPassword(name, next);
  }

  /** Take a login away (the user can no longer sign in). */
  remove(name: string): void {
    if (!this.initialized()) return;
    const rest = this.logins().filter((u) => !same(u.loginName, name));
    if (rest.length) this.write(rest); else this.removeFile();
  }

  removeFile(): void { fs.rmSync(this.file(), { force: true }); }

  /**
   * The password file setting is about to change to `next` (a resolved path). The users must
   * come along: without this the app would suddenly have no users and ask whoever loads the page
   * first to create one. Refuses when something is already at the new place.
   */
  moveFile(next: string): (() => void) | null {
    const from = this.file();
    if (path.resolve(next) === path.resolve(from)) return null;
    if (fs.existsSync(next)) {
      if (fs.statSync(next).isDirectory()) throw new UserError(`${next} is a folder. The password file needs a file name, for example ${path.join(next, ".password")}.`, 409);
      if (fs.existsSync(from)) throw new UserError(`There is already a file at ${next}. Choose another place for the password file, or remove that file first.`, 409);
      // no users yet: a password file that is already there may be adopted — any other file may not
      if (!looksLikePasswordFile(next)) throw new UserError(`${next} is another kind of file, not a password file. Choose a place where there is no file yet.`, 409);
      return null;
    }
    if (!fs.existsSync(from)) return null;
    fs.mkdirSync(path.dirname(next), { recursive: true });
    try { fs.renameSync(from, next); }
    catch { fs.copyFileSync(from, next); fs.rmSync(from, { force: true }); } // another disk: copy, then remove
    try { fs.chmodSync(next, 0o600); } catch {}
    // for the caller, should saving the setting fail after all: put the file back where the setting still points
    return () => { try { fs.renameSync(next, from); } catch { try { fs.copyFileSync(next, from); fs.rmSync(next, { force: true }); } catch {} } };
  }
}
