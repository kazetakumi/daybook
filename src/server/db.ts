import postgres from "postgres";
import { SHARED_OK } from "../shared";

// Proves src/shared resolves cleanly from the server side (Node/tsx). See
// src/client/App.tsx for the client-side (Vite/DOM) half of this check.
void SHARED_OK;

export type Sql = postgres.Sql;

/** Postgres OID of the `date` type. */
const DATE_OID = 1082;

/**
 * Opens a Postgres client for `url`. The schema itself is owned by
 * supabase/migrations/ (SPEC.md §2) — this never runs DDL.
 *
 * `date` columns come back as the raw 'YYYY-MM-DD' string rather than a JS
 * Date: the whole app (src/shared/settlement.ts included) treats dates as
 * ISODate strings, and a Date at UTC midnight would shift a day when read in
 * IST.
 */
export function openDb(url: string, options: postgres.Options<{}> = {}): Sql {
  return postgres(url, {
    ...options,
    types: {
      date: {
        to: DATE_OID,
        from: [DATE_OID],
        serialize: (value: string) => value,
        parse: (value: string) => value,
      },
    },
  });
}

let sharedDb: Sql | undefined;

/** The process-wide client, opened lazily from DATABASE_URL on first use. */
export function getDb(): Sql {
  if (!sharedDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set — copy .env.example to .env and fill it in (see docs/ops-setup.md)");
    }
    sharedDb = openDb(url);
  }
  return sharedDb;
}

/**
 * Fails fast at startup if the database is unreachable or the Daybook
 * migration hasn't been applied, instead of on the first family request.
 */
export async function assertSchemaReady(sql: Sql): Promise<void> {
  const [row] = await sql<{ exists: boolean }[]>`SELECT to_regclass('daybook_settings') IS NOT NULL AS exists`;
  if (!row?.exists) {
    throw new Error(
      "daybook_settings table not found — apply supabase/migrations/ to this database first (see docs/ops-setup.md)",
    );
  }
}
