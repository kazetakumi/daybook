# 03 — PIN auth end to end

**What to build:** The family-PIN gate from SPEC.md §5. On a fresh database the app forces a set-PIN flow (4–6 digits, entered twice, scrypt-hashed with per-hash salt into settings). Thereafter, visiting the app shows a PIN screen; a correct PIN issues a signed HttpOnly SameSite=Lax session cookie valid 180 days, and every API route except login/health rejects unauthenticated requests with 401 (the client responds to any 401 by showing the PIN screen). Brute-force damping is a global exponential backoff: after 5 consecutive failures, responses delay 2 s doubling per failure, reset on success. A Settings screen (gear from home) offers change-PIN, requiring the current PIN.

**Blocked by:** 01 — Walking skeleton.

**Status:** ready-for-agent

- [ ] Fresh DB → set-PIN flow; PIN never stored in plaintext
- [ ] Correct PIN → session persists across browser restarts (180-day cookie); wrong PIN → error, and 5+ consecutive failures visibly delay responses
- [ ] All /api/* routes except login and health return 401 without a valid session; client redirects to PIN screen on 401
- [ ] Change PIN in Settings requires the current PIN and works
- [ ] Session verification middleware is applied globally so later tickets' routes are gated automatically
