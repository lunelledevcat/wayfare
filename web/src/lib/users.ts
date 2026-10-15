import "server-only";
import { d1Configured, queryD1 } from "./cloudflare-d1";

/** Schema for the `users` table (also applied by `npm run d1:migrate`). */
export const USERS_SCHEMA = `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  image TEXT,
  google_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
)`;

export interface GoogleProfile {
  googleId: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

/** Insert the user on first login; refresh email/name/image and last_login_at on every later login. */
export async function upsertUser(p: GoogleProfile): Promise<void> {
  const now = new Date().toISOString();
  await queryD1(
    `INSERT INTO users (id, email, name, image, google_id, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(google_id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       image = excluded.image,
       last_login_at = excluded.last_login_at`,
    [crypto.randomUUID(), p.email, p.name ?? null, p.image ?? null, p.googleId, now, now],
  );
}

/** Never blocks sign-in: a database outage must not lock people out of the app. */
export async function recordLogin(p: GoogleProfile): Promise<void> {
  if (!d1Configured()) {
    console.warn("[auth] Cloudflare D1 not configured — user not stored");
    return;
  }
  try {
    await upsertUser(p);
  } catch (err) {
    console.error("[auth] could not store user in D1:", err instanceof Error ? err.message : err);
  }
}
