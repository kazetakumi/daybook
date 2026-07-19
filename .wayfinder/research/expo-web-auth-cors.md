# Research: does the existing PIN cookie-session auth work unchanged under Expo web / react-native-web?

Ticket: [012-research-auth-cors](../tickets/012-research-auth-cors.md) · Researched 2026-07-19

## TL;DR

**Production needs no change.** Expo's web target is react-native-web rendered by React DOM inside a real browser tab; react-native-web does not implement or wrap `fetch` at all — it exports no networking module ([react-native-web `index.js`](https://github.com/necolas/react-native-web/blob/master/packages/react-native-web/src/index.js)), and its docs confirm it "uses React DOM to accurately render React Native compatible JavaScript code in a web browser" ([react-native-web docs](https://necolas.github.io/react-native-web/docs/)). `fetch(...)` calls resolve to the browser's own native `fetch`, so same-origin credentialed requests and the HttpOnly `SameSite=Lax` cookie behave exactly as they do today under Vite. Expo's own `expo/fetch` package — which *does* wrap fetch — explicitly does **not** touch the global on web; its web implementation is one line, `export const fetch = globalThis.fetch;` ([`fetch.web.ts`](https://github.com/expo/expo/blob/main/packages/expo/src/winter/fetch/fetch.web.ts)), confirmed by the SDK docs stating the native-global-override only applies "on Android and iOS" ([Expo SDK reference](https://docs.expo.dev/versions/latest/sdk/expo/)).

**Dev needs a small change, but not because of `SameSite=Lax`.** `expo start --web`'s Metro dev server now defaults to port **8081** ([Expo CLI docs](https://docs.expo.dev/more/expo-cli/)), separate from the Hono API's port **3000** ([`src/server/index.ts:45`](../../src/server/index.ts)). Because both are `localhost` differing only by port, they are **same-site** (SameSite is scoped to scheme + registrable domain, not port — [web.dev: same-site vs. same-origin](https://web.dev/articles/same-site-same-origin)) — so `SameSite=Lax` itself does **not** block the cookie in this dev setup, contrary to the ticket's working assumption. What *does* break dev is plainer: (1) browser `fetch` defaults `credentials` to `"same-origin"`, which drops the cookie on a cross-*origin* (different-port) call unless the caller passes `credentials: "include"` ([MDN `RequestInit.credentials`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#credentials)), and this repo's client already pins `credentials: "same-origin"` explicitly ([`src/client/api.ts:28`](../../src/client/api.ts)); and (2) the Hono server sends no CORS headers today, so the browser blocks the cross-origin response outright regardless of credentials. Today this is a non-issue only because Vite's dev server already proxies `/api` to Hono same-origin ([`vite.config.ts:16-21`](../../vite.config.ts)) — there is currently no cross-origin dev request at all. Expo's Metro web dev server has **no documented equivalent to Vite's `server.proxy`** ([Expo GitHub discussion #40852](https://github.com/expo/expo/discussions/40852)), so migrating away from Vite removes that existing mitigation; the ticket must pick a replacement (see Recommendation).

---

## 1. Does react-native-web's networking layer diverge from browser `fetch`?

No — because there isn't one. react-native-web's top-level export list (`packages/react-native-web/src/index.js`) contains UI components, layout/gesture/event APIs (`View`, `Text`, `Dimensions`, `PanResponder`, `Keyboard`, etc.) and platform utilities, but **no `fetch`, `XMLHttpRequest`, or `WebSocket` export** ([source](https://github.com/necolas/react-native-web/blob/master/packages/react-native-web/src/index.js)). This is expected: react-native-web's own docs describe its job as rendering React Native-shaped components with React DOM inside an actual browser ([docs](https://necolas.github.io/react-native-web/docs/)), so any code that calls the bare global `fetch(...)` — as this app's `src/client/api.ts` does — resolves straight to the browser's native, spec-compliant Fetch implementation. There is no react-native-web-specific polyfill or divergence to account for.

The one place a real Expo-specific fetch wrapper exists is `expo/fetch`, added in SDK 52 to give native platforms a WinterCG-compliant, streaming-capable fetch (because React Native's historical native fetch lacked streaming) ([Expo SDK reference — `expo/fetch`](https://docs.expo.dev/versions/latest/sdk/expo/)). Two facts rule it out as a source of web-specific behavior change:

- Its web implementation, `packages/expo/src/winter/fetch/fetch.web.ts`, is exactly `export const fetch = globalThis.fetch;` — a direct pass-through to the browser global, with no wrapping logic ([source](https://github.com/expo/expo/blob/main/packages/expo/src/winter/fetch/fetch.web.ts)).
- The SDK docs state the *global* `fetch` is only overridden by `expo/fetch` "on Android and iOS" — web keeps the standard browser `fetch` as the global regardless ([Expo SDK reference](https://docs.expo.dev/versions/latest/sdk/expo/)).

One gotcha worth flagging for completeness, though it's inapplicable to this app's current code: an open Expo issue reports that if you explicitly `import { fetch } from 'expo/fetch'` and call the imported binding detached from `globalThis` in certain call shapes, it can throw `"Failed to execute 'fetch' on 'Window': Illegal invocation"`, because the export is an unbound reference (`export const fetch = globalThis.fetch`, not `.bind(globalThis)`) ([expo/expo#40162](https://github.com/expo/expo/issues/40162)). This only matters if the codebase switches to `import { fetch } from "expo/fetch"` instead of the ambient global `fetch(...)` it uses today ([`src/client/api.ts:26`](../../src/client/api.ts)) — no reason to make that switch for a web-only target, so it's not a blocker, just a footgun to avoid introducing later.

**Conclusion: no fetch-layer divergence.** Cookie handling, redirects, and credentialed-request semantics on Expo web are identical to plain browser `fetch` because it *is* plain browser `fetch`.

## 2. Production (same-origin, Hono-served bundle) — any reason to expect divergence from today's Vite setup?

No. In production both the current Vite build and a future Expo web export are static JS/CSS/HTML bundles served by the same Hono process on the same origin ([`src/server/index.ts:36-49`](../../src/server/index.ts) — "Serve the built client from the same port"). Since (per §1) react-native-web introduces no fetch abstraction, the browser tab loading the Expo web bundle makes `fetch("/api/...")` calls exactly as the current React app does: same origin, `credentials: "same-origin"` is sufficient (already how `apiFetch` calls it, [`src/client/api.ts:25-30`](../../src/client/api.ts)), the HttpOnly `SameSite=Lax` cookie is automatically attached by the browser because the request is same-site *and* same-origin, and no CORS headers are needed because CORS only applies to cross-origin requests ([MDN `RequestInit.credentials`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#credentials) — the `"same-origin"` mode is exactly "send credentials only for same-origin requests," which prod always is). There is nothing in Expo's web build output, Metro's web bundling, or react-native-web's DOM rendering that changes the origin the bundle is served from or how the resulting page issues requests. **No change needed for production.**

## 3. Dev (`expo start --web` on its own port, cross-origin from the Hono API) — what breaks and what's needed?

**Ports in play.** Expo CLI's dev server (Metro, used for web bundling since Expo dropped `@expo/webpack-config`) defaults to port **8081**: "`-p, --port <port>`: Port to start the development server. Default: 8081" ([Expo CLI docs](https://docs.expo.dev/more/expo-cli/)). The Hono API defaults to port **3000** (`const port = Number(process.env.PORT ?? 3000);`, [`src/server/index.ts:45`](../../src/server/index.ts)). So `expo start --web` and the API would run on different ports of `localhost` — cross-*origin* by the browser's origin definition, which includes port ([MDN same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy): "the protocol, port (if specified), and host are the same for both").

**`credentials: "same-origin"` silently drops the cookie cross-origin.** Fetch's `credentials` option controls whether the browser attaches the ambient cookie jar; `"same-origin"` (the value this repo's `apiFetch` already sets explicitly, [`src/client/api.ts:28`](../../src/client/api.ts)) means credentials are sent "only for same-origin requests" — cross-origin requests silently omit the cookie rather than erroring ([MDN `RequestInit.credentials`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#credentials)). A login POST or an authenticated GET issued from `localhost:8081` to `localhost:3000` would therefore never present the session cookie unless this literal changes to `"include"` for the cross-origin dev case.

**Even with `credentials: "include"`, the response is blocked without CORS headers.** `"include"` requires the *server* to cooperate: MDN's own credentials guidance states the server must send `Access-Control-Allow-Credentials: true` and must echo the exact requesting origin in `Access-Control-Allow-Origin` — a wildcard `*` is explicitly disallowed for credentialed responses ([MDN `RequestInit.credentials`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#credentials)). Hono's official CORS middleware, `hono/cors`, is what would add these headers. Confirmed option surface from Hono's docs and source ([Hono CORS docs](https://hono.dev/docs/middleware/builtin/cors), [`hono/cors` source](https://github.com/honojs/hono/blob/main/src/middleware/cors/index.ts)):

| Option | Type | Default | Purpose |
|---|---|---|---|
| `origin` | `string \| string[] \| (origin: string, c: Context) => string` | `*` | Sets `Access-Control-Allow-Origin`; must be an explicit origin (or a function returning one) for credentialed requests |
| `credentials` | `boolean` | unset/false | When `true`, unconditionally sets `Access-Control-Allow-Credentials: true` |
| `allowMethods` | `string[] \| (origin, c) => string[]` | `['GET','HEAD','PUT','POST','DELETE','PATCH']` | Sets `Access-Control-Allow-Methods` for preflight |
| `allowHeaders` | `string[]` | `[]` | Sets `Access-Control-Allow-Headers` for preflight |
| `exposeHeaders` | `string[]` | `[]` | Sets `Access-Control-Expose-Headers` |
| `maxAge` | `number` | unset | Sets `Access-Control-Max-Age` |

Example from Hono's docs for the credentialed cross-origin case:
```ts
app.use('/api/*', cors({
  origin: 'http://example.com',
  credentials: true,
  allowMethods: ['POST', 'GET', 'OPTIONS'],
}))
```
([Hono CORS docs](https://hono.dev/docs/middleware/builtin/cors))

Reading the middleware source directly: it resolves `origin` via a `findAllowOrigin` helper and only sets `Access-Control-Allow-Origin` to a concrete value — but the middleware does **not** itself validate or reject a misconfiguration where a caller passes `origin: '*'` together with `credentials: true`; it will set `Access-Control-Allow-Credentials: true` unconditionally whenever `credentials` is truthy, so avoiding the wildcard is the integrator's responsibility, not something Hono guards against ([`hono/cors` source](https://github.com/honojs/hono/blob/main/src/middleware/cors/index.ts)). Practically: `origin` must be set to the literal dev origin, e.g. `http://localhost:8081`, not `*`, for this app's dev CORS config to actually work in the browser (the browser itself is the final enforcer of the wildcard+credentials prohibition per the Fetch spec, matching the MDN guidance cited above).

Non-GET routes (`login`, `set-pin`, `change-pin`, and the `PATCH`/`POST` workers/marks endpoints) are not "simple requests" once a custom `Content-Type: application/json` header and non-GET method are involved, so the browser will also issue a CORS **preflight** `OPTIONS` request first; `hono/cors`'s `allowMethods`/`allowHeaders` need to cover those, and the middleware handles the preflight response itself (per its documented behavior).

**Conclusion for dev:** cross-origin cookie auth is achievable, but requires *both* an explicit `credentials: "include"` on the client for the dev build and a `hono/cors` middleware mounted on `/api/*` (or narrower) with `origin` pinned to the literal Expo dev origin and `credentials: true`.

## 4. `SameSite=Lax` semantics for this specific cross-origin dev setup

The ticket's premise was that `SameSite=Lax` itself would block cross-site `fetch`/XHR calls in dev, requiring a workaround. Checked precisely against MDN and Google's Chrome-authored web platform explainers — the premise is **half right in general, but doesn't apply to this specific dev topology**:

- **What `Lax` actually restricts, generally:** a `Lax` cookie is sent for (a) all same-site requests, and (b) cross-*site* top-level navigations using a "safe" method (GET/HEAD). It is **not** sent for cross-site `fetch()`/`XMLHttpRequest` calls, `<img>`/`<script>` subresource loads, or iframe navigations, and not for cross-site POST/PUT/DELETE at all ([MDN `Set-Cookie` — `SameSite`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)). MDN also documents a narrower carve-out: when a browser applies `Lax` only as an *unspecified-attribute default* (not an explicit `SameSite=Lax`), it uses "a more permissive version" that still allows the cookie on POST requests made within 2 minutes of the cookie being set — but this app sets `SameSite=Lax` explicitly (per SPEC.md §5), so that 2-minute POST grace period does **not** apply here regardless ([MDN `Set-Cookie` — `SameSite`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)).
- **But "site" is not "origin," and the two dev ports don't differ by site.** "Site" for `SameSite` purposes means **scheme + registrable domain (eTLD+1)** — explicitly *not* port. Google's Chrome-team explainer states it directly with a port-only example: `https://www.example.com:443` and `https://www.example.com:80` are "same-site... different ports don't matter," while being cross-*origin* ([web.dev: same-site vs. same-origin](https://web.dev/articles/same-site-same-origin)). "Schemeful Same-Site" (shipped in Chrome) additionally folds the scheme into the site definition, so `http://` vs `https://` of the same host are cross-site — but that's irrelevant here since both dev servers are plain `http://localhost` ([web.dev: Schemeful Same-Site](https://web.dev/articles/schemeful-samesite)). `localhost:8081` (Expo/Metro dev) and `localhost:3000` (Hono API) share scheme (`http`) and host (`localhost`), differing only by port — so by this definition they are **same-site**, even though they are cross-*origin*.
- **Cookies aren't port-scoped at the storage layer either.** RFC 6265 §8.5 states plainly: "Cookies do not provide isolation by port. If a cookie is readable by a service running on one port, the cookie is also readable by a service running on another port of the same server." ([RFC 6265](https://www.rfc-editor.org/rfc/rfc6265)). So the cookie set by Hono on `localhost:3000` is in-scope for a request to `localhost:3000` regardless of which port the *page* was loaded from.

**Net effect: `SameSite=Lax` does not block this dev cross-origin fetch at all**, because same-host-differing-port localhost requests are same-site. The entire dev-mode failure mode described in §3 is caused by (a) fetch's `credentials: "same-origin"` default/explicit-setting and (b) missing CORS response headers — ordinary cross-*origin* restrictions, not `SameSite` cross-*site* restrictions. This is a meaningful correction to the ticket's framing: no `SameSite=None; Secure` workaround, and no cookie-attribute change of any kind, is needed for dev. The fix is entirely in the `credentials` option and CORS configuration (or avoiding cross-origin dev altogether — see below).

**Proxy-based alternative, avoiding CORS/SameSite entirely.** The current Vite setup already sidesteps this whole class of problem: `vite.config.ts` proxies `/api/*` from the Vite dev server (its own port) straight through to Hono on port 3000 with `changeOrigin: true` ([`vite.config.ts:16-21`](../../vite.config.ts), pattern documented at [Vite `server.proxy` docs](https://vite.dev/config/server-options.html#server-proxy)). Because the browser only ever talks to one origin (Vite's dev port), the request is same-origin from the browser's point of view and neither CORS nor any credentials-mode change is needed — this is *why* today's dev setup has no CORS configuration at all.

**Expo/Metro has no documented equivalent.** Checked specifically for a Metro-based `expo start --web` analog to `server.proxy`:
- Expo's own "Troubleshooting Proxies" doc is unrelated — it covers configuring Expo CLI/EAS to work behind a **corporate outbound** network proxy, not the dev server proxying API calls ([Expo docs — Troubleshooting Proxies](https://docs.expo.dev/troubleshooting/proxies/)).
- An open community discussion, "Proxy api calls in expo development," asks exactly this question — how to replicate Webpack's `devServer.proxy` (which the old `@expo/webpack-config` supported) now that Expo web uses Metro. As of this research, **no official solution or maintainer reply exists in that thread**; the asker notes Metro's `enhanceMiddleware` hook is deprecated and didn't work for them, and no Expo team member has responded ([expo/expo discussion #40852](https://github.com/expo/expo/discussions/40852)).

So: **there is no documented, supported Metro-side proxy option** comparable to Vite's `server.proxy`. This should be stated as a confirmed gap, not left open — it was checked against Expo's docs site, the Metro config reference, and the relevant GitHub discussion, and nothing surfaced.

---

## Recommendation / spec implications

1. **No production change required.** Prod stays same-origin (Hono serves the Expo web export, same as it serves the Vite build today, via the Funnel per `.wayfinder/research/tunnel-options.md`), and react-native-web adds no fetch-layer behavior to account for. `apiFetch`'s existing `credentials: "same-origin"` is correct and sufficient for prod as-is.
2. **Dev requires an explicit decision between two supported paths, since Expo/Metro has no proxy equivalent to Vite's today:**
   - **Option A — cross-origin dev with CORS.** Add `hono/cors` mounted on the `/api/*` routes, configured with `origin: "http://localhost:8081"` (or whatever the actual Expo dev origin/port turns out to be) and `credentials: true`, matching `allowMethods` to the app's actual verbs (`GET, POST, PATCH`) ([Hono CORS docs](https://hono.dev/docs/middleware/builtin/cors)). The client's dev build must also switch its `apiFetch` credentials mode from `"same-origin"` to `"include"` for calls to the API's absolute dev URL (since the client can no longer rely on relative same-origin paths once client and API are on different ports) — this is a real code change, not just a server-side one. `SameSite=Lax` needs no adjustment (per §4); `origin` must never be a literal `'*'` alongside `credentials: true`, since Hono won't reject that combination for you and the browser will simply refuse the response.
   - **Option B — keep dev same-origin via a proxy, avoiding CORS/credentials-mode changes entirely.** Since Metro has no documented built-in equivalent to `server.proxy`, this would mean fronting both dev servers with a small reverse proxy (e.g. a tiny Express/Hono middleware, or an existing lightweight proxy tool) that serves one origin for local development and forwards `/api/*` to Hono's port and everything else to Metro's port — mirroring what Vite currently does for free. This preserves the current dev experience exactly (no CORS config, no credentials-mode branching in client code) at the cost of an extra small piece of dev-only infrastructure to build and maintain, since Expo/Metro won't provide it out of the box.
   - This ticket does not need to pick between A and B — that's an implementation decision for the migration ticket — but the spec should record that **doing nothing is not an option for dev**: unlike prod, dev will break silently (401s with no cookie ever attached) the moment the client and API run on different ports, and the fix is not automatic.
3. Update SPEC.md §5 (or the migration ticket) to note explicitly that the brute-force backoff and 401→PIN-screen redirect logic in `apiFetch` (`src/client/api.ts`) must be preserved verbatim across the Expo port — nothing in this research suggests react-native-web threatens that logic, since it's plain `fetch`/`Response` handling, not anything DOM- or React-Native-specific.

## Sources

**react-native-web / Expo networking:**
- [react-native-web `index.js` (top-level exports)](https://github.com/necolas/react-native-web/blob/master/packages/react-native-web/src/index.js)
- [react-native-web docs](https://necolas.github.io/react-native-web/docs/)
- [Expo SDK reference — `expo/fetch`](https://docs.expo.dev/versions/latest/sdk/expo/)
- [`expo/fetch` web implementation source (`fetch.web.ts`)](https://github.com/expo/expo/blob/main/packages/expo/src/winter/fetch/fetch.web.ts)
- [expo/expo issue #40162 — unbound `globalThis.fetch` export](https://github.com/expo/expo/issues/40162)
- [Expo CLI docs — dev server default port](https://docs.expo.dev/more/expo-cli/)

**Fetch credentials / CORS:**
- [MDN — `RequestInit.credentials`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#credentials)
- [MDN — Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)
- [Hono — CORS middleware docs](https://hono.dev/docs/middleware/builtin/cors)
- [Hono — `hono/cors` source](https://github.com/honojs/hono/blob/main/src/middleware/cors/index.ts)

**SameSite / cookie scoping:**
- [MDN — `Set-Cookie` header, `SameSite` values](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
- [web.dev — Same-site and same-origin](https://web.dev/articles/same-site-same-origin)
- [web.dev — Schemeful Same-Site](https://web.dev/articles/schemeful-samesite)
- [RFC 6265 — HTTP State Management Mechanism (§8.5, port isolation)](https://www.rfc-editor.org/rfc/rfc6265)

**Dev-server proxying:**
- [Vite — `server.proxy` docs (reference pattern; not an Expo feature)](https://vite.dev/config/server-options.html#server-proxy)
- [Expo docs — Troubleshooting Proxies (corporate outbound proxy, not dev-server proxying)](https://docs.expo.dev/troubleshooting/proxies/)
- [expo/expo GitHub discussion #40852 — "Proxy api calls in expo development" (unanswered, no official solution)](https://github.com/expo/expo/discussions/40852)

**Repo files referenced:**
- [`SPEC.md` §5 — Auth, family PIN](../../SPEC.md)
- [`src/client/api.ts`](../../src/client/api.ts)
- [`src/server/index.ts`](../../src/server/index.ts)
- [`vite.config.ts`](../../vite.config.ts)
