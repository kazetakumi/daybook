import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SHARED_OK } from "../shared";

// Proves src/shared resolves cleanly from the server side (Node/tsx). See
// src/client/App.tsx for the client-side (Vite/DOM) half of this check.
void SHARED_OK;

export const DEFAULT_DB_PATH = join(process.cwd(), "data", "daybook.sqlite");
export const SCHEMA_PATH = join(process.cwd(), "schema.sql");

/**
 * Opens the Daybook SQLite database at `dbPath`, creating it (and applying
 * schema.sql verbatim — see SPEC.md §2) if the file doesn't exist yet.
 * Exported as a standalone function so tests can point it at a temp file
 * or ':memory:' without touching the real data/ directory.
 */
export function openDb(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  const isMemory = dbPath === ":memory:";
  if (!isMemory) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const isNew = isMemory || !existsSync(dbPath);

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  if (!isMemory) db.pragma("journal_mode = WAL");

  if (isNew) {
    db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
  }

  return db;
}

let sharedDb: Database.Database | undefined;

/** The process-wide database handle, opened lazily on first use. */
export function getDb(): Database.Database {
  if (!sharedDb) sharedDb = openDb();
  return sharedDb;
}
