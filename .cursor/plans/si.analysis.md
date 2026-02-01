
### How the wallet login is intended to work (SIWE flow)
- Client fetches a nonce: `GET /api/auth/siwe/nonce`
- Client builds an EIP‑4361 SIWE message (domain, uri, statement, nonce, chainId) and signs it with the wallet
- Client verifies session: `POST /api/auth/siwe/verify` with `{ message, signature }`
  - Server validates signature and domain, enforces one-time nonce (optional Redis), links or creates a user, then sets a signed `siwe_session` httpOnly, secure cookie
- Client session is read either by:
  - Replacing `getSession()` to decode `siwe_session` (keeping the same server API shape), or
  - Adding `GET /api/auth/siwe/session` and making the `SessionProvider` fetch that
- Middleware must consider `siwe_session` as authenticated for redirects/guards
- Logout clears `siwe_session`

### What you need to add to get this working here
- Server
  - SIWE endpoints:
    - `apps/sim/app/api/auth/siwe/nonce/route.ts` (nonce)
    - `apps/sim/app/api/auth/siwe/verify/route.ts` (verify + cookie)
    - Optionally `apps/sim/app/api/auth/siwe/session/route.ts` (normalized client session)
  - Cookie signing utils: `apps/sim/lib/auth/siwe-cookie.ts` using `jose` HMAC with `INTERNAL_API_SECRET`
  - Session integration:
    - Option A (minimal): add `GET /api/auth/siwe/session` and have `SessionProvider` call it
    - Option B (deeper): change `getSession()` to read `siwe_session` so existing server code keeps working
  - Middleware: treat `siwe_session` as a valid session for redirects and protected routes
  - DB linking:
    - Recommended: create an `account` row with `providerId='siwe'` and `accountId=<wallet_address>` mapped to a `userId` (no new columns required)
    - Alternative: add a `wallet_address` column to `user` (requires migration)
- Client
  - Wallet UI on the login page (only when `NEXT_PUBLIC_WALLET_ONLY_AUTH=true`)
  - Wallet provider setup (choose one; do not add extra providers unless requested)
    - Web3 Onboard v2 + SIWE
      // WalletConnect v2 preferred over v1 for better mobile support and security.
    - Or Wagmi v2 + Viem v2 + SIWE
    - Ethers v6.x optional if needed alongside Viem
  - Flow: connect wallet → fetch nonce → sign SIWE → POST verify → refetch session and redirect
- Dependencies
  - siwe@latest
  - jose@latest (HMAC signing of the `siwe_session` cookie)
  - One wallet stack: web3-onboard@latest and @walletconnect/ethereum-provider@^2, or wagmi@^2 + viem@^2 (+ ethers v6.x if required)
  - Optional: ioredis or upstash redis for nonce single-use enforcement
- Environment/config
  - `INTERNAL_API_SECRET` (HMAC key for `siwe_session`)
  - `NEXT_PUBLIC_WALLET_ONLY_AUTH=true` to render the wallet UI
  - `REDIS_URL` if you want one-time nonce enforcement
  - RPC/chain config for the wallet provider (e.g., `NEXT_PUBLIC_ETH_RPC`), app base URL, and domain binding for SIWE verification
- Security essentials
  - Bind SIWE verify to the request domain
  - One-time, short‑TTL nonces
  - `httpOnly`, `secure`, `sameSite=lax` cookie; 24h expiry as planned
  - CSRF is inherently mitigated with signed wallets + nonces; still keep routes strict on origins

### Quick reality check vs codebase
- No SIWE code exists yet; only plans. You’ll need to add the endpoints, cookie utilities, session wiring, middleware updates, wallet UI, and deps to enable wallet login end-to-end.

- If you want, I can implement Option A (minimal integration) first: add SIWE endpoints + `siwe_session` + `GET /api/auth/siwe/session` and wire the login UI to it.

- Changes needed:
  - New files under `apps/sim/app/api/auth/siwe/*` and `apps/sim/lib/auth/siwe-cookie.ts`
  - Edits to `apps/sim/lib/session/session-context.tsx` or `apps/sim/lib/auth.ts` (depending on Option A vs B)
  - Edit `apps/sim/middleware.ts` to honor `siwe_session`
  - Login page UI to add the wallet flow

- Required packages: siwe, jose, plus either Web3 Onboard v2 or Wagmi v2 stack.

- Configure `INTERNAL_API_SECRET` and chain RPC envs, then test: connect → sign → verify → redirected to `workspace`.

---

### Repo‑specific observations and suggestions

- Current auth surface
  - There is a thin wrapper `apps/sim/lib/auth.ts:1544` where `getSession()` calls Better Auth. This is the safest server swap point: verify `siwe_session` there first and synthesize a Better‑Auth‑shaped object; otherwise fall back to Better Auth.
  - Middleware only checks Better Auth cookie via `getSessionCookie` (Edge safe). Extend it to also accept a valid `siwe_session` using a small `verifySiweCookie()` helper that runs in Edge (jose only).
  - Client session provider (`apps/sim/lib/session/session-context.tsx`) currently calls `client.getSession()` from Better Auth. When `NEXT_PUBLIC_WALLET_ONLY_AUTH=true`, switch it to fetch `GET /api/auth/siwe/session` so we avoid coupling to Better Auth’s client.
  - Catch‑all route `apps/sim/app/api/auth/[...all]/route.ts` mounts Better Auth; Next will still route static `auth/siwe/*` paths to our handlers, so no conflict.

- Database mapping
  - You can avoid a DB migration by storing the wallet in `account` table (present) with `{ providerId: 'siwe', accountId: <lowercased_address>, userId }` and look up by `(providerId, accountId)`.
  - Suggest adding a unique index on `(providerId, accountId)` in the future to prevent duplicates. If you prefer direct lookup on user, add `user.walletAddress` (lowercased, unique) later; start with `account` mapping now to minimize schema churn.
  - User creation still needs `name` and `email` (both NOT NULL). Use synthetic values: `email = "<address>@wallet.local"`, `name = shortAddress` (e.g., `0xabc…1234`), `emailVerified = true`.

- Session shape parity
  - Server code expects `getSession()` to include `{ user, session: { activeOrganizationId? } }`. Your SIWE path should compute `activeOrganizationId` the same way Better Auth does (query first `member` record, as in `apps/sim/lib/auth.ts` databaseHooks).
  - Client `AppSession` type in `session-context` doesn’t include `expiresAt`. Keep `/api/auth/siwe/session` aligned to `AppSession`; on the server, you may include `expiresAt` only if some call sites use it (none found in client path).

- Nonce + replay protection
  - Use `apps/sim/lib/redis.ts` helpers to store `siwe:nonce:<nonce>` with `EX 300`. On verify, check presence, then delete to enforce single use. If Redis is not configured, a light in‑memory fallback is acceptable for local/dev.

- Edge/Node compatibility
  - Middleware must verify cookies on Edge. Keep `siwe-cookie.ts` strictly jose‑only (no `ethers`, no Node crypto modules). Route handlers can use ethers/viem for signature/domain/chain checks.

- Domain binding
  - Verify `SiweMessage.domain === new URL(req.url).host` (e.g., `localhost:3000` in dev; your configured host in prod). Avoid relying solely on `NEXT_PUBLIC_APP_URL` for domain equality; it’s okay as an additional allowlist, but origin must match the actual request host.

- Socket fallback
  - `POST /api/auth/socket-token` currently tries Better Auth one‑time token. If that fails or no BA session, verify `siwe_session` and mint short‑lived internal JWT `{ type: 'socket', sub: userId }` signed with `INTERNAL_API_SECRET` (HS256, 10–15 minutes). Update `apps/sim/socket-server/middleware/auth.ts` to accept this fallback and set `socket.userId`.

- Env surface to add (client + server)
  - Client: `NEXT_PUBLIC_WALLET_ONLY_AUTH`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (if using WalletConnect), optional `NEXT_PUBLIC_ETH_RPC` if your wallet stack needs it.
  - Server: reuse `INTERNAL_API_SECRET` for cookie HMAC + socket JWT; optional `REDIS_URL` already exists for nonce.
  - Update `apps/sim/lib/env.ts` client schema and `experimental__runtimeEnv`; update `.env.example` but do not commit secrets.

- Minimal endpoint contracts (proposed)
  - `GET /api/auth/siwe/nonce` → `{ nonce: string, ttl: number }`
  - `POST /api/auth/siwe/verify` body `{ message: string, signature: string }` → `{ ok: true, created?: boolean }` (sets `siwe_session` cookie)
  - `GET /api/auth/siwe/session` → `{ user, session } | null` (aligns to `AppSession`)
  - `POST /api/auth/siwe/logout` → `{ ok: true }` (clears cookie)

- Cookie details
  - Name: `siwe_session`; payload: `{ uid, addr, iat, exp }`; sign with jose HS256 using `INTERNAL_API_SECRET`.
  - Set: `httpOnly: true`, `secure: true`, `sameSite: 'lax'`, `path: '/'`, `maxAge` matching `exp` (e.g., 24h).
  - Clear on logout with `maxAge: 0`.

- UI integration (wallet only)
  - Add `apps/sim/app/(auth)/components/wallet-login.tsx` using either Wagmi+Viem or Web3 Onboard. For lean deps, Wagmi+Viem is fine; keep ethers v6 if you prefer `ethers.SignMessage` ergonomics.
  - In `apps/sim/app/(auth)/login/page.tsx` (and `login-form.tsx` if necessary): when `NEXT_PUBLIC_WALLET_ONLY_AUTH=true`, render wallet component exclusively and hide email/social/SSO controls to avoid mixed auth states.
  - Flow: connect → GET nonce → sign EIP‑4361 → POST verify → on success, `router.replace('/workspace')` and/or trigger session refetch.

- Testing plan (high‑value checks)
  - Injected wallet (MetaMask) desktop and WalletConnect on mobile (with real project ID).
  - Nonce single‑use enforced: second verify with same nonce fails.
  - Middleware respects `siwe_session` and routes `/login` ↔ `/workspace` correctly.
  - `/api/auth/siwe/session` returns `AppSession` and UI renders user state.
  - Socket connects via SIWE fallback JWT when BA token missing.
  - Logout clears cookie and redirects to `/login`.

### Suggested phased plan (minimal risk)

1) Add cookie utils and SIWE endpoints
   - `apps/sim/lib/auth/siwe-cookie.ts`
   - `apps/sim/app/api/auth/siwe/{nonce,verify,logout,session}/route.ts`

2) Wire server `getSession()` to honor SIWE
   - In `apps/sim/lib/auth.ts`, verify `siwe_session`, load user, compute `activeOrganizationId`, return Better‑Auth‑shaped object; otherwise fall back to Better Auth.

3) Middleware session acceptance
   - In `apps/sim/middleware.ts`, set `hasActiveSession` if either BA cookie or valid SIWE cookie is present.

4) Client session and UI
   - In `apps/sim/lib/session/session-context.tsx`, when `NEXT_PUBLIC_WALLET_ONLY_AUTH=true`, fetch `/api/auth/siwe/session` instead of Better Auth client.
   - Add `wallet-login.tsx` and gate the login page by env flag.

5) Sockets
   - Add fallback JWT in `apps/sim/app/api/auth/socket-token/route.ts` and verify in `apps/sim/socket-server/middleware/auth.ts`.

6) Env + (optional) DB hardening
   - Add env keys to `apps/sim/lib/env.ts` and `.env.example`.
   - Optional later: add a unique index on `account(providerId, accountId)` or a `user.walletAddress` column if you want direct lookup and uniqueness at the user row.

### Notable trade‑offs

- Mapping wallet in `account` table avoids schema changes and keeps Better Auth’s model intact; direct `user.walletAddress` improves lookup and reporting but requires a migration and backfill.
- Routing client session through a tiny SIWE endpoint decouples from Better Auth’s client shape and works even if BA client changes; the server still keeps compatibility via the `getSession()` wrapper.
- Verifying SIWE cookie in middleware keeps redirects accurate in both hosted and self‑hosted modes without adding a network call per request.

### Open questions to finalize before coding

- Preferred wallet stack (Web3 Onboard vs Wagmi+Viem) and target chains (default Mainnet only for now?).
- Whether to enforce Redis‑backed nonces in all envs or allow in‑memory fallback in dev.
- Whether to keep Better Auth cookie acceptance in middleware when `NEXT_PUBLIC_WALLET_ONLY_AUTH=true` (suggest: accept both for transition, remove later if truly crypto‑only).

