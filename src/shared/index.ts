// Domain types and pure logic shared between server and client live here.
//
// Hard rule for everything under src/shared: no Node-only APIs (fs, path,
// process, ...) and no DOM-only APIs (window, document, ...). It must
// typecheck standalone against tsconfig.client.json (DOM lib, no node types)
// and tsconfig.server.json (node types, no DOM lib) — see both configs at
// the repo root.

export * from "./settlement";

// Kept for the walking-skeleton wiring check in src/client/App.tsx and
// src/server/db.ts (ticket 01, owned by other tickets) — not otherwise
// meaningful now that this module has real exports.
export const SHARED_OK = true;
