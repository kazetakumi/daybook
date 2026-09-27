import type { Context } from "hono";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { Sql } from "../db";
import { getSetting, setSetting } from "../lib/settings";
import {
  LoginBackoff,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createSessionToken,
  getSessionSecret,
  hashPin,
  isValidPin,
  verifyPinHash,
} from "../lib/auth";

const PIN_HASH_KEY = "pin_hash";

async function issueSession(c: Context, sql: Sql): Promise<void> {
  const secret = await getSessionSecret(sql);
  const token = createSessionToken(secret, SESSION_TTL_MS);
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: true, // the app is only ever served over HTTPS, via Tailscale Funnel (SPEC.md §9)
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPinBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Builds the /api/login + /api/auth/* routes, given a db client. Takes the
 * client as a parameter (rather than importing the process-wide singleton from
 * ../db) purely for testability — src/server/index.ts calls this once with
 * getDb() and mounts the result at "/api", landing at:
 *   POST /api/login
 *   GET  /api/auth/status
 *   POST /api/auth/set-pin
 *   POST /api/auth/change-pin
 *   GET  /api/auth/session
 */
export function createAuthRoute(sql: Sql): Hono {
  const authRoute = new Hono();

  // One backoff tracker per route instance. In the real app there is
  // exactly one instance for the process lifetime — global by design
  // (SPEC.md §5: clients behind the Funnel aren't individually trustworthy).
  const backoff = new LoginBackoff();

  /** Whether a PIN has ever been set — the client uses this to choose set-PIN vs. login. */
  authRoute.get("/auth/status", async (c) => {
    const pinSet = Boolean(await getSetting(sql, PIN_HASH_KEY));
    return c.json({ pinSet });
  });

  /**
   * Gated by nothing but "no PIN exists yet" (there is no session to
   * require on a fresh database). Rejects if a PIN is already set, so it
   * can never be used to silently reset an existing household's PIN.
   */
  authRoute.post("/auth/set-pin", async (c) => {
    if (await getSetting(sql, PIN_HASH_KEY)) {
      return c.json({ error: "a PIN is already set" }, 409);
    }

    const body = await readPinBody(c);
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (!isValidPin(pin)) {
      return c.json({ error: "PIN must be 4-6 digits" }, 400);
    }

    // Insert-if-absent, not an upsert: two racing first-run requests can't
    // both "win" and leave the second PIN silently replacing the first.
    const [inserted] = await sql`
      INSERT INTO daybook_settings (key, value) VALUES (${PIN_HASH_KEY}, ${hashPin(pin)})
      ON CONFLICT (key) DO NOTHING
      RETURNING key
    `;
    if (!inserted) return c.json({ error: "a PIN is already set" }, 409);
    await issueSession(c, sql);
    return c.json({ ok: true });
  });

  authRoute.post("/login", async (c) => {
    // Applied to the response regardless of outcome, based on the streak
    // *before* this attempt — see SPEC.md §5 and src/server/lib/auth.ts.
    const delay = backoff.delayForNextAttemptMs();
    if (delay > 0) await sleep(delay);

    const storedHash = await getSetting(sql, PIN_HASH_KEY);
    const body = await readPinBody(c);
    const pin = typeof body.pin === "string" ? body.pin : "";

    if (!storedHash || !verifyPinHash(pin, storedHash)) {
      backoff.recordFailure();
      return c.json({ error: "incorrect PIN" }, 401);
    }

    backoff.recordSuccess();
    await issueSession(c, sql);
    return c.json({ ok: true });
  });

  /**
   * Gated by the global session middleware (not in SESSION_EXEMPT_PATHS),
   * so a valid cookie is already guaranteed by the time this handler runs.
   * Still requires the *current* PIN as a second factor before changing it.
   */
  authRoute.post("/auth/change-pin", async (c) => {
    const body = await readPinBody(c);
    const currentPin = typeof body.currentPin === "string" ? body.currentPin : "";
    const newPin = typeof body.newPin === "string" ? body.newPin : "";

    const storedHash = await getSetting(sql, PIN_HASH_KEY);
    if (!storedHash || !verifyPinHash(currentPin, storedHash)) {
      // 403, not 401: the session itself is valid (middleware already
      // passed this request through) — this is a wrong-second-factor error,
      // and must NOT be treated by the client as "session expired, show PIN
      // screen".
      return c.json({ error: "current PIN is incorrect" }, 403);
    }
    if (!isValidPin(newPin)) {
      return c.json({ error: "new PIN must be 4-6 digits" }, 400);
    }

    await setSetting(sql, PIN_HASH_KEY, hashPin(newPin));
    return c.json({ ok: true });
  });

  /**
   * Cheap "am I still logged in?" probe for the client to call on load,
   * since no feature route exists yet to piggyback that check on. Gated by
   * the session middleware like any other non-exempt /api/* route —
   * reaching the handler at all means the cookie is valid.
   */
  authRoute.get("/auth/session", (c) => c.json({ ok: true }));

  return authRoute;
}
