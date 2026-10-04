import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

/** A 12-character random id ("k3m9x2pq7wza"). */
export function newId(): string {
  const bytes = crypto.randomBytes(12);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export const now = (): string => new Date().toISOString();

/** An error whose message is shown to the user as-is (HTTP 400 unless given). */
export class UserError extends Error {
  constructor(message: string, readonly status = 400, readonly details?: unknown) { super(message); }
}

/** Write a file so a crash mid-write never leaves half a file behind. */
export function writeAtomic(file: string, data: string | Buffer, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data, mode ? { mode } : undefined);
  fs.renameSync(tmp, file);
}

/** "Susan Park", "Clients", "and 7 more" style list, first `max` items. */
export function listSome(items: string[], max = 5): string {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")}, …and ${items.length - max} more`;
}

/** "YYYYMMDD-HHMMSS" in local time, for file names. */
export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
