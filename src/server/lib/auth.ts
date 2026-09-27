import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Sql } from "../db";
import { getOrInitSetting } from "./settings";

// --- PIN hashing (SPEC.md §5: scrypt, per-hash random salt, never plaintext) ---

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

/** 4-6 digits, per SPEC.md §5. */
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/** Hashes a PIN into a single storable string: `<saltHex>:<hashHex>`. */
export function hashPin(pin: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const hash = scryptSync(pin, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Verifies a candidate PIN against a `hashPin` output, constant-time. */
export function verifyPinHash(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pin, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// --- Session cookie: HMAC-signed, stateless, verified without a session table ---

export const SESSION_COOKIE_NAME = "daybook_session";
export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days, per SPEC.md §5

const SESSION_SECRET_KEY = "session_secret";

/** Reads the HMAC signing key from `daybook_settings`, generating and persisting one on first use. */
export function getSessionSecret(sql: Sql): Promise<string> {
  return getOrInitSetting(sql, SESSION_SECRET_KEY, randomBytes(32).toString("hex"));
}

function sign(secret: string, payloadB64: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/** Builds a signed session token: `<base64url payload>.<base64url hmac>`. Payload carries only an expiry. */
export function createSessionToken(secret: string, ttlMs: number = SESSION_TTL_MS): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + ttlMs })).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

/** Verifies signature and expiry. Stateless — no DB lookup beyond the secret itself. */
export function verifySessionToken(secret: string, token: string | undefined): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;

  const expectedSig = sign(secret, payload);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as {
      exp?: unknown;
    };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

// --- Brute-force damping (SPEC.md §5): global exponential backoff ---

export const BACKOFF_THRESHOLD = 5; // first 5 consecutive failures are undelayed
export const BACKOFF_BASE_MS = 2000;

/**
 * Pure function: how long to delay a login response given the number of
 * consecutive failures already recorded *before* this attempt. 0 for the
 * first 5 failures, then 2s, 4s, 8s, ... doubling per additional failure.
 */
export function getBackoffDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures < BACKOFF_THRESHOLD) return 0;
  return BACKOFF_BASE_MS * 2 ** (consecutiveFailures - BACKOFF_THRESHOLD);
}

/**
 * Tracks the global (not per-IP — see SPEC.md §5) consecutive-failure count
 * for the login route. One instance lives for the process lifetime.
 */
export class LoginBackoff {
  private consecutiveFailures = 0;

  /** Delay to apply to the *current* response, based on failures so far. */
  delayForNextAttemptMs(): number {
    return getBackoffDelayMs(this.consecutiveFailures);
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }
}
