import { describe, expect, it } from "vitest";
import { assertSchemaReady, openDb } from "./db";
import { makeTestDb, testDatabaseUrl } from "./testing/testDb";

describe("supabase/migrations", () => {
  it("creates all six daybook_* tables, each with row-level security enabled", async () => {
    const db = await makeTestDb();
    const tables = await db<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relnamespace = current_schema()::regnamespace AND relkind = 'r'
      ORDER BY relname
    `;
    expect(tables.map((t) => t.relname)).toEqual([
      "daybook_cycle_configs",
      "daybook_marks",
      "daybook_payments",
      "daybook_rate_periods",
      "daybook_settings",
      "daybook_workers",
    ]);
    expect(tables.every((t) => t.relrowsecurity)).toBe(true);
  });
});

describe("openDb", () => {
  it("reads date columns back as the ISO string written, never a shifted JS Date", async () => {
    const db = await makeTestDb();
    await db`INSERT INTO daybook_workers (name, joined_on) VALUES ('Test', '2026-03-01')`;
    const [row] = await db<{ joined_on: unknown }[]>`SELECT joined_on FROM daybook_workers`;
    expect(row?.joined_on).toBe("2026-03-01");
  });

  it("rejects an impossible date rather than storing it", async () => {
    const db = await makeTestDb();
    await expect(db`INSERT INTO daybook_workers (name, joined_on) VALUES ('Test', ${"2026-02-30"})`).rejects.toThrow();
  });
});

describe("assertSchemaReady", () => {
  it("passes once the migration has been applied", async () => {
    await expect(assertSchemaReady(await makeTestDb())).resolves.toBeUndefined();
  });

  it("fails with a pointer to supabase/migrations/ when it hasn't", async () => {
    const bare = openDb(testDatabaseUrl(), { max: 1, connection: { search_path: "test_no_such_schema" } });
    try {
      await expect(assertSchemaReady(bare)).rejects.toThrow(/supabase\/migrations/);
    } finally {
      await bare.end();
    }
  });
});
