import type { Sql } from "../db";

// Thin helpers over the single-row-per-key `daybook_settings` table
// (supabase/migrations/). Used by auth (pin_hash, session_secret) and
// reusable for other one-off config values.

export async function getSetting(sql: Sql, key: string): Promise<string | undefined> {
  const [row] = await sql<{ value: string }[]>`SELECT value FROM daybook_settings WHERE key = ${key}`;
  return row?.value;
}

export async function setSetting(sql: Sql, key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO daybook_settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `;
}

/**
 * Inserts `value` only if `key` has no value yet, then returns whichever
 * value won. Safe against two concurrent first callers each generating their
 * own value.
 */
export async function getOrInitSetting(sql: Sql, key: string, value: string): Promise<string> {
  await sql`INSERT INTO daybook_settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO NOTHING`;
  const stored = await getSetting(sql, key);
  if (stored === undefined) throw new Error(`setting ${key} vanished right after being initialised`);
  return stored;
}
