import postgres from "postgres";

// Vitest globalSetup: makes sure the TEST_DATABASE_URL database exists
// (creating it on first run) and clears out test_* schemas a crashed run left
// behind. Fails the whole run up front, with a readable message, if the local
// Postgres isn't reachable — rather than every test timing out separately.

export default async function setup(): Promise<void> {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) return; // server tests will throw testDatabaseUrl()'s explanation; pure tests still run

  const url = new URL(raw);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  const adminUrl = new URL(raw);
  adminUrl.pathname = "/postgres";

  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const [exists] = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (!exists) await admin.unsafe(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`);
  } catch (err) {
    throw new Error(
      `Can't reach the test Postgres at ${url.host} (is the postgresql-x64-17 service running?): ${(err as Error).message}`,
    );
  } finally {
    await admin.end();
  }

  const sql = postgres(raw, { max: 1, onnotice: () => {} });
  try {
    const stale = await sql<{ nspname: string }[]>`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'test\\_%'`;
    for (const { nspname } of stale) await sql.unsafe(`DROP SCHEMA "${nspname}" CASCADE`);
  } finally {
    await sql.end();
  }
}
