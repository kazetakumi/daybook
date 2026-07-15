# 01 — Walking skeleton: one process serves a page from SQLite

**What to build:** Opening the app's port in a browser shows a minimal React shell page served by the API server itself, and the server has created the SQLite database from the schema. The full toolchain works end to end: dev mode, production build, and tests.

Follow SPEC.md §2 (schema, verbatim) and §7 (stack: Vite + React + TypeScript client; Hono on @hono/node-server serving both the API and the built client from one port, default 3000; better-sqlite3 with raw SQL; Vitest). The DB file lives under a gitignored data directory. Public origin comes from a `PUBLIC_ORIGIN` env config, not hardcoded.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `npm run dev` serves the React shell with API proxying; `npm run build` + `npm start` serve the built client and API from one port
- [ ] `GET /api/health` returns ok; server startup creates all six tables from schema.sql exactly as in SPEC §2
- [ ] `npm test` runs Vitest green (a trivial test is fine at this stage)
- [ ] Repo has a .gitignore covering node_modules, build output, and the data directory
