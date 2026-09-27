import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import type { Sql } from "../db";
import { SESSION_COOKIE_NAME, getSessionSecret, verifySessionToken } from "../lib/auth";

// Paths under /api/* that must work *without* a session: the two auth
// endpoints a not-yet-logged-in client needs (status check + login), the
// first-run set-PIN endpoint (there is no session to have yet), and health.
// Everything else under /api/* — including every route later tickets
// (04-08) add — is gated automatically because this middleware is mounted
// on the wildcard "/api/*" pattern in src/server/index.ts.
export const SESSION_EXEMPT_PATHS = new Set<string>([
  "/api/login",
  "/api/auth/status",
  "/api/auth/set-pin",
  "/api/health",
]);

/**
 * Verifies the signed session cookie on every /api/* request except the
 * paths above. Returns 401 JSON on missing/invalid/expired session so the
 * client's fetch wrapper can detect it and show the PIN screen.
 */
export function createSessionMiddleware(sql: Sql): MiddlewareHandler {
  // Read once on first request and reused — the secret never changes for
  // the life of the database. A failed read isn't cached, so the next
  // request retries.
  let secret: Promise<string> | undefined;
  const loadSecret = () => {
    secret ??= getSessionSecret(sql).catch((err: unknown) => {
      secret = undefined;
      throw err;
    });
    return secret;
  };

  return async (c, next) => {
    if (SESSION_EXEMPT_PATHS.has(c.req.path)) {
      await next();
      return;
    }

    const token = getCookie(c, SESSION_COOKIE_NAME);
    if (!verifySessionToken(await loadSecret(), token)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    await next();
  };
}
