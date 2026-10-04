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
import bcrypt from "bcryptjs";
import type { Request } from "express";
import type { Config } from "./config.js";
import { UserError, writeAtomic } from "./util.js";

interface StoredLogin { loginName: string; passwordHash: string }
export interface SessionData {
  loginName?: string;
  /** fingerprint of the password this session signed in with */
  credTag?: string;
}
export interface Credential { loginName: string; credTag: string }

/** the same minimum as my_business_manager; only checked when a password is SET, so older, shorter ones still sign in */
export const MIN_PASSWORD = 8;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const tagOf = (passwordHash: string) => crypto.createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);

export class Auth {
  /** compared against when the login name is unknown (made on first need) */
  private decoy: string | null = null;

  constructor(private readonly config: Config) {}

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
    if (!s?.loginName || !s.credTag || !this.initialized()) return null;
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
    if (String(password).length > 1024) throw new UserError("That password is too long.");
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
    const list = this.logins();
    if (list.some((u) => same(u.loginName, v.name))) throw new UserError(`There is already a user called “${v.name}”. Pick a different login name.`, 409);
    this.write([...list, { loginName: v.name, passwordHash: await bcrypt.hash(v.password, 10) }]);
    return v.name;
  }

  /** Give `name` this password — replacing the one it has, or creating its login when it has none. */
  async setPassword(name: string, password: unknown): Promise<Credential> {
    Auth.checkPassword(password);
    const u = { loginName: this.find(name)?.loginName ?? name, passwordHash: await bcrypt.hash(String(password), 10) };
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
}
