<!-- 7cca2c85-0c51-488f-8192-26e9658de644 0dc34ae8-a207-4815-80c2-01da0b2d3f88 -->
# Crypto Wallet Login (Wagmi v2 + Viem v2 + SIWE, server session Option B) — revised

### Scope

Implement SIWE using Wagmi v2 + Viem v2 with a signed `siwe_session` cookie. Extend server `getSession()` to honor `siwe_session` (Option 2b) while keeping Better Auth as fallback. Add a minimal client session endpoint for wallet-only mode so the UI reflects login state without depending on Better Auth’s client. Target branch: stage.

### Key decisions

- Wallet stack: Wagmi v2 + Viem v2 + SIWE (only Injected + WalletConnect v2; no extra wallets).
- Session strategy: Server `getSession()` prefers `siwe_session`, else Better Auth; client gets `/api/auth/siwe/session` when wallet-only.
- DB mapping: use existing `account` table `{ providerId: 'siwe', accountId: <lowercased_address>, userId }`.

### Changes (files)

- Add
  - `apps/sim/lib/auth/siwe-cookie.ts` — jose HS256 sign/verify utilities (Edge-safe)
  - `apps/sim/app/api/auth/siwe/nonce/route.ts` — GET nonce with Redis TTL and single-use
  - `apps/sim/app/api/auth/siwe/verify/route.ts` — POST verify SIWE, set cookie, map user
  - `apps/sim/app/api/auth/siwe/logout/route.ts` — POST clear cookie
  - `apps/sim/app/api/auth/siwe/session/route.ts` — GET normalized session for client when wallet-only
  - `apps/sim/providers/wagmi.tsx` — 'use client' WagmiProvider wrapper
  - `apps/sim/app/(auth)/components/wallet-login.tsx` — minimal login UI (Injected + WC v2)
- Edit
  - `apps/sim/lib/env.ts` — add env keys and client/runtime validation
  - `apps/sim/lib/auth.ts` — extend `getSession()` to verify `siwe_session` then fallback to Better Auth; compute `activeOrganizationId` like BA
  - `apps/sim/middleware.ts` — accept `siwe_session` via jose verify alongside BA cookie
  - `apps/sim/app/layout.tsx` — mount WagmiProvider wrapper within the layout tree
  - `apps/sim/app/(auth)/login/page.tsx` — when `NEXT_PUBLIC_WALLET_ONLY_AUTH=true`, render only wallet login (hide email/SSO)
  - `apps/sim/lib/session/session-context.tsx` — if wallet-only, fetch `/api/auth/siwe/session`; else use Better Auth client
  - `apps/sim/app/api/auth/sso/providers/route.ts` and `apps/sim/app/api/copilot/user-models/route.ts` — replace direct Better Auth calls with server wrapper `getSession()`
  - `apps/sim/app/workspace/**/account.tsx` — when wallet-only, call `/api/auth/siwe/logout` in addition to BA `signOut()`
  - Sockets:
    - `apps/sim/app/api/auth/socket-token/route.ts` — fallback: mint internal JWT `{ type: 'socket', sub: userId }` with `INTERNAL_API_SECRET`, 10–15 min exp
    - `apps/sim/socket-server/middleware/auth.ts` — accept the fallback JWT and set `socket.userId`
  - Optional gating (wallet-only): `apps/sim/stores/organization/store.ts` — gate BA org actions to avoid 401s until alt endpoints exist

### Endpoints

- GET `/api/auth/siwe/nonce` → `{ nonce, ttlSeconds }` (Redis key `siwe:nonce:<nonce>`, EX 300)
- POST `/api/auth/siwe/verify` body `{ message, signature }` → `{ ok: true, created?: boolean }` (sets cookie)
- GET `/api/auth/siwe/session` → `{ user, session } | null` aligned to `AppSession`
- POST `/api/auth/siwe/logout` → `{ ok: true }` (clears cookie)

### Server getSession() (Option 2b)

- Read `siwe_session` cookie; verify with jose HS256 and `INTERNAL_API_SECRET` (restrict algorithms)
- If valid and not expired: load user by `payload.userId` and compute `activeOrganizationId` like BA
- Return Better-Auth-shaped object `{ user, session: { activeOrganizationId } }`
- Else, fallback to existing Better Auth path

### Middleware

- Edge-safe jose verify of `siwe_session`; treat as authenticated alongside BA cookie for existing redirect rules

### Client session provider

- Branch by `NEXT_PUBLIC_WALLET_ONLY_AUTH`
  - true → fetch `/api/auth/siwe/session`
  - false → Better Auth client `getSession()`

### Wagmi provider and UI

- Provider: `apps/sim/providers/wagmi.tsx` ('use client') with Mainnet and Sepolia; connectors: Injected, WalletConnect v2
  - // WalletConnect v2 preferred over v1 for better mobile support and security.
- UI: `wallet-login.tsx` renders separate buttons for Injected and WalletConnect. Do not assume `connectors[0]`.
- Do not hardcode chainId; read `NEXT_PUBLIC_SIWE_CHAIN_ID`. Detect mismatch and surface a clear error or prompt chain switch.

### Logout

- When wallet-only, call `/api/auth/siwe/logout` from the account UI; optionally keep BA `signOut()` for mixed mode

### Sockets (in scope)

- Token route: if BA session missing, verify `siwe_session` and mint internal HS256 JWT signed with `INTERNAL_API_SECRET`
- Socket middleware: accept this token and set `socket.userId`

### Database mapping

- Lookup by `(providerId='siwe', accountId=<lowercased_address>)`
- If not found, create user with:
  - `email = "<address>@wallet.local"`, `name = shortAddress`, `emailVerified = true`
- Then create `account` row linked to `userId`
- Code-level guard against duplicates; later add unique index `(providerId, accountId)`

### Env

- Server: `INTERNAL_API_SECRET`
- Client: `NEXT_PUBLIC_WALLET_ONLY_AUTH`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_SIWE_CHAIN_ID`, optional `NEXT_PUBLIC_ETH_RPC`

### Security

- SIWE verify: `new URL(req.url).host` must equal `SiweMessage.domain`
- Nonce: single-use enforced, Redis preferred (in-memory TTL only for dev)
- Cookie: `httpOnly`, `secure`, `sameSite: 'lax'`, `path: '/'`, `maxAge` ≈ 24h; jose HS256 only

### Concise snippets (new code only)

```ts
// apps/sim/lib/auth/siwe-cookie.ts
// This module signs and verifies the siwe_session cookie using jose HMAC (HS256).
import { SignJWT, jwtVerify } from 'jose'

export type SiweSession = { userId: string, walletAddress: string, issuedAt: number, expiresAt: number }

export async function signSiweCookie(session: SiweSession, secret: string) {
  // Step 1: Create HS256 token
  return await new SignJWT(session)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(session.expiresAt / 1000))
    .sign(new TextEncoder().encode(secret))
}

export async function verifySiweCookie(token: string, secret: string) {
  // Step 1: Verify HS256 token with explicit algorithm allowlist
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] })
  return payload as unknown as SiweSession
}
```
```tsx
// apps/sim/providers/wagmi.tsx
// This provider sets up Wagmi v2 + Viem v2 with Injected and WalletConnect v2 connectors.
'use client'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { walletConnect, injected } from 'wagmi/connectors'

const chainId = Number(process.env.NEXT_PUBLIC_SIWE_CHAIN_ID ?? 1)
const chains = [mainnet, sepolia]

const config = createConfig({
  chains,
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({ projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!, showQrModal: true })
  ],
  transports: { 1: http(process.env.NEXT_PUBLIC_ETH_RPC), 11155111: http(process.env.NEXT_PUBLIC_ETH_RPC) }
})

export function WagmiProviders({ children }: { children: React.ReactNode }) {
  // Step 1: Mount WagmiProvider with configured connectors
  return <WagmiProvider config={config}>{children}</WagmiProvider>
}
```
```tsx
// apps/sim/app/(auth)/components/wallet-login.tsx
// This component handles the client SIWE flow using Wagmi v2 + Viem v2.
'use client'
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi'
import { SiweMessage } from 'siwe'

export function WalletLogin() {
  const { address, isConnected } = useAccount()
  const { connectors, connectAsync } = useConnect()
  const { signMessageAsync } = useSignMessage()

  async function connectWith(connectorId: string) {
    const connector = connectors.find(c => c.id === connectorId)
    if (!connector) throw new Error('Connector unavailable')
    await connectAsync({ connector })
  }

  async function handleSiwe() {
    // Step 1: Ensure connection
    if (!isConnected) throw new Error('Connect a wallet first')

    // Step 2: Fetch nonce
    const nonceRes = await fetch('/api/auth/siwe/nonce')
    const { nonce } = await nonceRes.json()

    // Step 3: Build SIWE message
    const domain = window.location.host
    const origin = window.location.origin
    const configuredChainId = Number(process.env.NEXT_PUBLIC_SIWE_CHAIN_ID ?? 1)
    const message = new SiweMessage({ domain, uri: origin, address: address as string, version: '1', statement: 'Sign in to Refi Studio', chainId: configuredChainId, nonce }).prepareMessage()

    // Step 4: Sign message
    const signature = await signMessageAsync({ message })

    // Step 5: Verify on server
    const res = await fetch('/api/auth/siwe/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, signature }) })
    if (!res.ok) throw new Error('Verification failed')
    window.location.replace('/workspace')
  }

  return (
    <div>
      <button onClick={() => connectWith('injected')}>Connect Injected</button>
      <button onClick={() => connectWith('walletConnect')}>Connect WalletConnect</button>
      <button onClick={handleSiwe}>Sign in with wallet</button>
    </div>
  )
}
```

// Note: This is a potential extension; verify before production use. Add EIP-1271 contract signature verification server-side using a Viem publicClient.

### Testing

- Injected wallet and WalletConnect v2 (real project ID)
- Nonce single-use enforced
- Middleware respects SIWE cookie
- Client session reflects SIWE in wallet-only mode
- Socket connection works with fallback JWT
- Logout clears cookie and redirects to `/login`

### To-dos

- [ ] Install deps and add env keys to env.ts and .env.example
- [ ] Create siwe-cookie.ts sign/verify helpers (Edge-safe jose)
- [ ] Add GET /api/auth/siwe/nonce with Redis or in-memory TTL
- [ ] Add POST /api/auth/siwe/verify with SIWE checks and cookie
- [ ] Add GET /api/auth/siwe/session and align to AppSession
- [ ] Add POST /api/auth/siwe/logout to clear siwe_session
- [ ] Extend getSession() to honor siwe_session then fallback
- [ ] Accept siwe_session in middleware using jose verify
- [ ] Replace direct Better Auth calls with wrapper getSession()
- [ ] Add WagmiProvider wrapper and mount in layout.tsx
- [ ] Create wallet-login.tsx with Injected and WC v2 buttons
- [ ] Gate login UI and org store for wallet-only mode
- [ ] Call /api/auth/siwe/logout when wallet-only
- [ ] Add JWT fallback in socket-token route and accept in middleware
- [ ] Test nonce, verify, session, middleware, sockets, logout