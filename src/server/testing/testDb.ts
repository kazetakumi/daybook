import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach } from "vitest";
import { openDb, type Sql } from "../db";

// Test databases: each makeTestDb() call gets its own throwaway Postgres
// schema (on the local server named by TEST_DATABASE_URL) with every
// supabase/migrations/ file applied — the Postgres stand-in for the old
// `new Database(":memory:")`. Everything a test created is dropped after it.

export const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** The migration files' SQL, in filename (= timestamp) order. */
export function readMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf-8"));
}

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set — point it at a local Postgres in .env, e.g. postgres://postgres:<pw>@localhost:5432/daybook_test",
    );
  }
  return url;
}

const opened: Array<{ sql: Sql; schema: string }> = [];

export async function makeTestDb(): Promise<Sql> {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  const sql = openDb(testDatabaseUrl(), {
    max: 2,
    onnotice: () => {},
    connection: { search_path: schema },
  });
  opened.push({ sql, schema });
  await sql.unsafe(`CREATE SCHEMA ${schema}`);
  for (const migration of readMigrations()) await sql.unsafe(migration);
  return sql;
}

afterEach(async () => {
  const toClose = opened.splice(0);
  await Promise.all(
    toClose.map(async ({ sql, schema }) => {
      await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await sql.end();
    }),
  );
});
