/**
 * Users, the way my_business_manager does them: every user signs in with
 * their own name and password, sees the SAME page, and may do everything —
 * add a user, set a new password for another user, remove another user,
 * change their own password, turn the login off. There are no roles.
 *
 * The list of users IS the password file (see auth.ts). Nothing else is
 * stored per user.
 */
import type { Request } from "express";
import type { Auth, Credential, SessionData } from "./auth.js";
import type { Config } from "./config.js";
import { UserError } from "./util.js";

export type AuthState = { status: "disabled" } | { status: "not_initialized" } | { status: "unauthenticated" } | { status: "authenticated"; loginName: string };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export class Users {
  constructor(private readonly config: Config, private readonly auth: Auth) {}

  state(req: Request): AuthState {
    const status = this.auth.status(req);
    return status === "authenticated" ? { status, loginName: this.auth.current(req)! } : { status };
  }

  signIn(req: Request, cred: Credential): void {
    req.session = { loginName: cred.loginName, credTag: cred.credTag } satisfies SessionData;
  }

  private me(req: Request): string {
    const name = this.auth.current(req);
    if (!name) throw new UserError("Sign in first.", 401);
    return name;
  }
  private needLogin(): void {
    if (!this.auth.enabled()) throw new UserError("The login is turned off, so there are no users. Turn it on in Settings → Access first.", 409);
  }
  private known(name: string): string {
    const found = this.auth.names().find((n) => same(n, name));
    if (!found) throw new UserError(`There is no user called “${name}”. Reload the page.`, 404);
    return found;
  }

  list(req: Request): { users: { loginName: string; you: boolean }[] } {
    this.needLogin();
    const me = this.auth.current(req);
    return { users: this.auth.names().map((loginName) => ({ loginName, you: !!me && same(me, loginName) })).sort((a, b) => a.loginName.localeCompare(b.loginName)) };
  }

  async add(loginName: unknown, password: unknown): Promise<{ loginName: string }> {
    this.needLogin();
    return { loginName: await this.auth.add(loginName, password) };
  }

  /** Give another user (or yourself) a new password without knowing the old one. */
  async resetPassword(req: Request, name: string, password: unknown): Promise<void> {
    this.needLogin();
    const me = this.me(req);
    const target = this.known(name);
    const cred = await this.auth.setPassword(target, password);
    if (same(me, target)) this.signIn(req, cred); // stay signed in after changing your own
  }

  async changeOwnPassword(req: Request, current: unknown, next: unknown): Promise<void> {
    this.needLogin();
    this.signIn(req, await this.auth.changeOwn(this.me(req), current, next));
  }

  remove(req: Request, name: string, confirm: unknown): void {
    this.needLogin();
    const me = this.me(req);
    const target = this.known(name);
    if (same(me, target)) throw new UserError("You can't remove yourself. Ask another user to do it, or turn the login off to remove every user.");
    if (confirm !== "DELETE") throw new UserError(`Type DELETE to confirm removing “${target}”.`);
    this.auth.remove(target);
  }

  /**
   * Turn the login on and sign in as its first user, in one step — so there is
   * never a moment where the login is on and anyone could claim it. When a
   * password file is already there, the name and password must match a user in it.
   */
  async enable(req: Request, loginName: unknown, password: unknown): Promise<void> {
    if (this.auth.enabled()) throw new UserError("The login is already on.", 409);
    const cred = this.auth.initialized() ? await this.auth.login(loginName, password) : await this.auth.setup(loginName, password);
    this.config.update({ security: { loginEnabled: true } });
    this.signIn(req, cred);
  }

  /** Turn the login off: every user and password is removed and the page opens for anyone who can reach it. */
  disable(req: Request, confirm: unknown): void {
    this.needLogin();
    if (confirm !== "DISABLE") throw new UserError("Type DISABLE to confirm — every user and password is removed and the page opens without a login.");
    this.config.update({ security: { loginEnabled: false } });
    this.auth.removeFile();
    req.session = null;
  }
}
