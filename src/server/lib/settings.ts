import type Database from "better-sqlite3";

// Thin helpers over the single-row-per-key `settings` table (schema.sql §2).
// Used by auth (pin_hash, session_secret) and will likely be reused by
// later tickets for other one-off config values.

export function getSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}
