# Agentic Development Plan: NFT-Gated Access (PulseChain) with Workspace-per-NFT for Sim

This plan is written to be executed by multiple autonomous coding agents that produce reviewable pull requests.
Target: self-hosted **Sim** deployment with **wallet-only access**, gated by **PulseChain** NFT ownership, and **one workspace per NFT**.

## Key facts and constraints

- Chain: **PulseChain mainnet**
  - Chain ID: **369** citeturn0search0
  - You will use **your own validator/RPC endpoint** (primary source of truth for on-chain reads).
- NFT standard: **ERC-721 compatible** (PulseChain commonly calls tokens PRC-20/PRC-721; contracts remain EVM-compatible).
- Stack: Next.js (App Router) + Bun + Postgres + Drizzle + Socket.io; auth via Better Auth. citeturn0search0
- Security: All checks must be enforced **server-side** (HTTP routes/server actions + Socket.io).

---

## Repo-wide conventions (for all agents)

### Shared implementation goals
1. Only wallet holders who currently own at least 1 qualifying NFT can obtain an authenticated session.
2. Each NFT maps deterministically to exactly one workspace (`workspace_key`).
3. Workspace access is granted only if:
   - user is authenticated, AND
   - user is a workspace member, AND
   - (strict mode, optional) user still owns the NFT backing that workspace.
4. Unauthorized clients must not receive:
   - workflow data
   - execution logs
   - variables/secrets
   - realtime collaboration events

### Shared config to introduce
Create a single configuration surface (env + types) used by all modules:

- `PULSECHAIN_RPC_URL` (your validator/RPC URL)
- `PULSECHAIN_CHAIN_ID=369`
- `NFT_GATE_CONTRACTS` (comma-separated contract addresses)
- `NFT_GATE_STRICT_MODE` (`true|false`)
- `NFT_GATE_CACHE_TTL_SECONDS` (e.g., 60–300)
- `DISABLE_REGISTRATION=true` (to prevent non-wallet signup) citeturn0search0

---

## Work breakdown structure (agents)

### Agent 0 — Integrator / Tech Lead (coordination + review gates)

**Mission**
- Set coding standards, branch strategy, and PR template.
- Ensure all other agents align on shared types, env config, and test strategy.

**Deliverables**
- `docs/nft-gating/ARCHITECTURE.md` (high-level)
- PR template with checklists
- “Definition of Done” automation checks (lint, unit tests)

**Prompt**
```text
You are the integrator agent.

1) Create a short architecture doc that describes:
- SIWE login flow
- entitlement resolution via PulseChain RPC
- workspace mapping model
- HTTP + Socket.io enforcement points
- transfer/revocation policy

2) Add a PR template checklist focusing on security and multi-tenancy.

3) Propose a minimal automated test plan and where to implement it.

Do not implement business logic; produce docs and scaffolding only.
```

---

### Agent 1 — Wallet Authentication (SIWE) integrated into Better Auth

**Mission**
Implement wallet-based login using SIWE-like message signing and create a session compatible with existing auth.

**Deliverables**
- Nonce issuance endpoint
- Verify endpoint (domain, nonce, signature, chainId 369)
- User record linked to wallet address
- Session cookie compatible with existing middleware
- Default registration disabled

**Implementation notes**
- Reject wrong chain IDs.
- Use strict nonce replay protection (store nonce, expire it).
- Normalize wallet addresses consistently (checksum or lowercase, but be consistent across DB + comparisons).

**Prompt**
```text
Implement wallet authentication for a Next.js (App Router) app that uses Better Auth.

Build a SIWE-like flow:
- GET /api/auth/siwe/nonce -> returns nonce and stores it server-side with TTL
- POST /api/auth/siwe/verify -> validates:
  - signed message matches expected domain
  - nonce exists and is unused
  - chainId must be 369 (PulseChain)
  - signature recovers the address
- Upsert a user tied to the wallet address
- Create a normal authenticated session (compatible with existing auth)
- Ensure CSRF and replay protection

Do not implement NFT checks yet.
Do not implement workspace logic.
Provide unit tests for nonce replay and wrong chainId.
```

---

### Agent 2 — PulseChain NFT Entitlements (ownership resolution via your RPC)

**Mission**
Given a wallet address, determine which tokenIds the wallet owns for the configured NFT contracts on PulseChain.

**Deliverables**
- `resolveEntitlements(address)` returns:
  - `{ chainId: 369, contract: string, tokenIds: bigint[] }[]`
- Caching layer with TTL
- Clear abstraction allowing optional future indexer support (but default is your RPC)

**Implementation notes**
- Prefer **read-only** contract calls via `eth_call` (no signing).
- Enumeration strategy options:
  1. If NFT supports `tokenOfOwnerByIndex` (ERC721Enumerable): enumerate reliably.
  2. Otherwise: use an indexer later; for now implement fallback warning or require enumerable.
- Make contract ABI minimal: `balanceOf`, optionally `tokenOfOwnerByIndex`, `supportsInterface`.

**Prompt**
```text
Implement PulseChain NFT ownership resolution using ONLY a configured RPC URL.

Inputs:
- wallet address
- env NFT_GATE_CONTRACTS (list of ERC-721 contract addresses)
- RPC URL (PULSECHAIN_RPC_URL) and chainId 369

Outputs:
- entitlements list: [{ chainId: 369, contract, tokenIds: bigint[] }]

Requirements:
- Use minimal ABIs and eth_call.
- Detect whether tokenOfOwnerByIndex is available; if not, return a clear error indicating that
  enumeration is not supported without an indexer.
- Add caching with TTL to avoid repeated RPC calls.
- Provide unit tests with mocked provider calls.
```

---

### Agent 3 — Workspace-per-NFT Mapping (DB + sync)

**Mission**
Create deterministic tenancy: each token corresponds to a unique workspace; user membership mirrors current entitlements.

**Deliverables**
- DB schema migration:
  - add `workspace_key` to workspace table OR create mapping table
  - unique index on `workspace_key`
- `workspace_key = "369:<contractLower>:<tokenId>"`
- Sync procedure that runs:
  - on successful login, OR
  - via explicit “sync holdings” endpoint

**Revocation policy (default)**
- If the wallet no longer owns tokenId: remove membership immediately.

**Prompt**
```text
Implement workspace-per-NFT tenancy mapping using Drizzle + Postgres.

- Add a deterministic workspace_key:
  workspace_key = "369:<contractLower>:<tokenId>"

- Implement:
  getOrCreateWorkspaceForToken(workspace_key, displayName, metadata)
  syncMembership(userId, entitlements)

Sync rules:
- For each entitlement token: ensure workspace exists, ensure user is owner/admin member.
- For tokens not owned anymore: remove membership.

Do not implement auth or socket logic.
Write idempotent code and include migration + tests around uniqueness and idempotency.
```

---

### Agent 4 — Authorization Guards (HTTP routes + server actions)

**Mission**
Enforce workspace access for all workspace-scoped operations.

**Deliverables**
- `assertWorkspaceAccess(userId, workspaceId)` guard
- Centralized middleware usable in:
  - route handlers
  - server actions
- Optional strict re-check using entitlements cache (`NFT_GATE_STRICT_MODE`)

**Prompt**
```text
Implement server-side authorization for workspace-scoped resources.

Create a reusable guard:
- Verifies authenticated user
- Verifies workspace membership (DB)
- If NFT_GATE_STRICT_MODE=true:
  - map workspace -> (contract, tokenId)
  - confirm user wallet currently owns the token (use entitlements module)
  - deny if not owned

Apply the guard consistently to all workspace-scoped HTTP routes and server actions.
Assume hostile clients and bypassed UI.
Add tests for unauthorized access.
```

---

### Agent 5 — Socket.io Authorization (realtime isolation)

**Mission**
Prevent unauthorized access to realtime channels (collaboration + execution logs/status).

**Deliverables**
- Socket auth middleware that validates session
- Room join gating based on workspace access guard
- Ensure broadcasts are workspace-isolated

**Prompt**
```text
Secure the Socket.io realtime system for multi-tenant workspaces.

Implement:
- session validation on socket handshake
- before joining a workspace room: call the same assertWorkspaceAccess guard
- reject unauthorized join attempts
- ensure all broadcasts are emitted only to workspace-specific rooms

Add tests or a harness that proves cross-workspace leakage is impossible.
```

---

### Agent 6 — Minimal UX: Workspace Picker for NFT Workspaces

**Mission**
Expose NFT-derived workspaces to the user and allow switching.

**Deliverables**
- Workspace picker listing workspaces the user can access
- Optional token metadata retrieval (tokenURI) via RPC for display
- “Refresh holdings” button invoking sync endpoint

**Prompt**
```text
Implement a minimal workspace picker UI.

- List the workspaces available to the current user
- Show label such as "<Collection> #<tokenId>" (fallback to workspace name)
- Allow switching active workspace
- Add a "Refresh holdings" action that triggers entitlement sync and updates UI

Do not implement security logic; assume backend guards exist.
```

---

## Integration order (fastest path)

1. Agent 0 (docs/scaffolding)
2. Agent 1 (SIWE session)
3. Agents 2 + 3 in parallel (entitlements + tenancy mapping)
4. Agent 4 (HTTP enforcement)
5. Agent 5 (Socket enforcement)
6. Agent 6 (UX)

---

## Testing requirements (minimum)

- Unit tests:
  - SIWE nonce replay rejection
  - chainId mismatch rejected (must be 369)
  - entitlements enumeration path (mocked provider)
  - workspace_key uniqueness/idempotency
  - guard denies non-member and (strict mode) denies ex-owner
- Integration tests (recommended):
  - login -> sync -> access workspace resources
  - socket join denied when unauthorized

---

## Definition of Done

- Wallets without qualifying NFTs cannot create a valid session.
- Each NFT maps to exactly one workspace via `workspace_key`.
- Selling/transferring NFT removes access (immediate revocation by default).
- No unauthorized API or Socket.io access (verified by tests).
- Deployment uses your `PULSECHAIN_RPC_URL` for all on-chain reads.

