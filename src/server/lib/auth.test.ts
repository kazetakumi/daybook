import { describe, expect, it } from "vitest";
import { makeTestDb } from "../testing/testDb";
import {
  BACKOFF_BASE_MS,
  BACKOFF_THRESHOLD,
  LoginBackoff,
  createSessionToken,
  getBackoffDelayMs,
  getSessionSecret,
  hashPin,
  isValidPin,
  verifyPinHash,
  verifySessionToken,
} from "./auth";

describe("isValidPin", () => {
  it.each(["1234", "12345", "123456"])("accepts %s (4-6 digits)", (pin) => {
    expect(isValidPin(pin)).toBe(true);
  });

  it.each(["123", "1234567", "abcd", "", "12a4"])("rejects %s", (pin) => {
    expect(isValidPin(pin)).toBe(false);
  });
});

describe("hashPin / verifyPinHash", () => {
  it("never stores the PIN in plaintext", () => {
    const hash = hashPin("246810");
    expect(hash).not.toContain("246810");
  });

  it("verifies the correct PIN and rejects a wrong one", () => {
    const hash = hashPin("135790");
    expect(verifyPinHash("135790", hash)).toBe(true);
    expect(verifyPinHash("000000", hash)).toBe(false);
  });

  it("salts each hash independently — same PIN, different stored values", () => {
    const a = hashPin("111111");
    const b = hashPin("111111");
    expect(a).not.toBe(b);
    expect(verifyPinHash("111111", a)).toBe(true);
    expect(verifyPinHash("111111", b)).toBe(true);
  });

  it("rejects malformed stored hashes rather than throwing", () => {
    expect(verifyPinHash("1234", "not-a-hash")).toBe(false);
  });
});

describe("getSessionSecret", () => {
  it("is generated once per db and persisted, not regenerated per call", async () => {
    const db = await makeTestDb();
    const first = await getSessionSecret(db);
    const second = await getSessionSecret(db);
    expect(second).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("settles on a single secret when two first callers race", async () => {
    const db = await makeTestDb();
    const [a, b] = await Promise.all([getSessionSecret(db), getSessionSecret(db)]);
    expect(b).toBe(a);
  });
});

describe("session tokens", () => {
  it("round-trips: a freshly created token verifies", () => {
    const token = createSessionToken("test-secret", 1000);
    expect(verifySessionToken("test-secret", token)).toBe(true);
  });

  it("carries a 180-day expiry by default", () => {
    const before = Date.now();
    const token = createSessionToken("test-secret");
    const [payloadB64] = token.split(".");
    const { exp } = JSON.parse(Buffer.from(payloadB64!, "base64url").toString("utf-8")) as {
      exp: number;
    };
    const expectedMs = 180 * 24 * 60 * 60 * 1000;
    expect(exp).toBeGreaterThanOrEqual(before + expectedMs - 1000);
    expect(exp).toBeLessThanOrEqual(before + expectedMs + 1000);
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSessionToken("test-secret", 1000);
    expect(verifySessionToken("other-secret", token)).toBe(false);
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const token = createSessionToken("test-secret", 1000);
    const [, sig] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ exp: Date.now() + 999_999 })).toString(
      "base64url",
    );
    expect(verifySessionToken("test-secret", `${tamperedPayload}.${sig}`)).toBe(false);
  });

  it("rejects an expired token even with a valid signature", () => {
    const token = createSessionToken("test-secret", -1000); // already expired
    expect(verifySessionToken("test-secret", token)).toBe(false);
  });

  it("rejects missing/garbage tokens without throwing", () => {
    expect(verifySessionToken("test-secret", undefined)).toBe(false);
    expect(verifySessionToken("test-secret", "not-a-token")).toBe(false);
    expect(verifySessionToken("test-secret", "")).toBe(false);
  });
});

describe("getBackoffDelayMs (SPEC.md §5: brute-force damping)", () => {
  it("is 0 for the first 5 consecutive failures", () => {
    for (let n = 0; n < BACKOFF_THRESHOLD; n++) {
      expect(getBackoffDelayMs(n)).toBe(0);
    }
  });

  it("delays 2s on the 6th, doubling per further failure", () => {
    expect(getBackoffDelayMs(5)).toBe(BACKOFF_BASE_MS); // 2s
    expect(getBackoffDelayMs(6)).toBe(BACKOFF_BASE_MS * 2); // 4s
    expect(getBackoffDelayMs(7)).toBe(BACKOFF_BASE_MS * 4); // 8s
    expect(getBackoffDelayMs(8)).toBe(BACKOFF_BASE_MS * 8); // 16s
  });
});

describe("LoginBackoff", () => {
  it("tracks a growing delay across 5+ consecutive failures and resets on success", () => {
    const backoff = new LoginBackoff();
    const delays: number[] = [];
    for (let i = 0; i < 8; i++) {
      delays.push(backoff.delayForNextAttemptMs());
      backoff.recordFailure();
    }
    expect(delays).toEqual([0, 0, 0, 0, 0, 2000, 4000, 8000]);

    backoff.recordSuccess();
    expect(backoff.delayForNextAttemptMs()).toBe(0);
  });
});
