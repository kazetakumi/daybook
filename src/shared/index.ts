// Domain types and pure logic shared between server and client live here.
// Ticket 02 adds settlement.ts (Worker, Mark, RatePeriod, cycle window, and
// settlement shapes, plus computeSettlement / cycleWindows).
//
// Hard rule for everything under src/shared: no Node-only APIs (fs, path,
// process, ...) and no DOM-only APIs (window, document, ...). It must
// typecheck standalone against tsconfig.client.json (DOM lib, no node types)
// and tsconfig.server.json (node types, no DOM lib) — see both configs at
// the repo root.

// Placeholder export so both sides have something real to import — remove
// once ticket 02 adds actual shared types/logic.
export const SHARED_OK = true;
