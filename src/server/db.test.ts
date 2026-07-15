import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "./db";

describe("openDb", () => {
  it("creates all six tables from schema.sql verbatim on a fresh database file", () => {
    const dir = mkdtempSync(join(tmpdir(), "daybook-test-"));
    const dbPath = join(dir, "daybook.sqlite");

    const db = openDb(dbPath);
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as Array<{ name: string }>;

      expect(tables.map((t) => t.name)).toEqual([
        "cycle_configs",
        "marks",
        "payments",
        "rate_periods",
        "settings",
        "workers",
      ]);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not re-run schema.sql (and error on CREATE TABLE) on a second open", () => {
    const dir = mkdtempSync(join(tmpdir(), "daybook-test-"));
    const dbPath = join(dir, "daybook.sqlite");

    const first = openDb(dbPath);
    first.close();

    const second = openDb(dbPath);
    try {
      const row = second
        .prepare("SELECT count(*) as n FROM sqlite_master WHERE type = 'table'")
        .get() as { n: number };
      expect(row.n).toBe(6);
    } finally {
      second.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
