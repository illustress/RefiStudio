# Crypto-Only Wallet Login (SIWE) — Implementation Guide

This document contains the full set of suggested changes to reimplement wallet-only (SIWE) authentication on the develop branch while keeping all existing `getSession()` call sites unchanged.

## Overview

- Replace the internals of `getSession()` to derive a session from a signed SIWE cookie.
- Add SIWE cookie signer/verifier (Node + Edge).
- Add SIWE API routes: nonce, verify, logout.
- Make middleware accept SIWE cookie as an authenticated session.
- Add client wallet login via Web3 Onboard + WalletConnect v2 + ethers v6.x.
- Keep all `getSession()` usages intact; do not introduce `checkHybridAuth`.

## 1) Edit `apps/sim/lib/auth.ts`

Add new imports (keep existing order as much as possible):

```ts
import { cookies } from "next/headers";
import { decodeAndVerifySiweCookie } from "@/lib/auth/siwe-cookie";
```

Replace the entire `getSession` with a SIWE-based version:

```ts
// This function returns a Better Auth–shaped session object based on a signed SIWE cookie.
export async function getSession() {
  // Step 1: Read SIWE cookie from the request
  const cookieStore = await cookies();
  const siweCookieRaw = cookieStore.get("siwe_session")?.value;

  // Step 2: Verify the signed SIWE cookie
  const siwePayload = decodeAndVerifySiweCookie(siweCookieRaw);
  if (!siwePayload?.uid) {
    // Step 3: Crypto-only mode -> return null if no SIWE session is present
    return null;
  }

  // Step 4: Load user by id first; fallback to wallet address (lowercased)
  let currentUser: any = null;
  if (siwePayload.uid) {
    const usersById = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, siwePayload.uid))
      .limit(1);
    currentUser = usersById[0];
  }

  if (!currentUser && siwePayload.addr) {
    const walletLower = siwePayload.addr.toLowerCase();
    const usersByWallet = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.walletAddress, walletLower))
      .limit(1);
    currentUser = usersByWallet[0];
  }

  if (!currentUser) {
    // Step 5: If no user found, treat as signed-out
    return null;
  }

  // Step 6: Resolve active organization context similarly to Better Auth sessions
  let activeOrganizationId: string | undefined = undefined;
  try {
    const memberships = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.userId, currentUser.id))
      .limit(1);
    if (memberships.length > 0) {
      activeOrganizationId = memberships[0].organizationId;
    }
  } catch {}

  // Step 7: Synthesize a Better Auth–shaped session object
  const syntheticEmail =
    currentUser.email ||
    (siwePayload.addr ? `${siwePayload.addr.toLowerCase()}@wallet.user` : null);

  return {
    user: {
      id: currentUser.id,
      name:
        currentUser.name ||
        (siwePayload.addr
          ? `Wallet ${siwePayload.addr.slice(0, 6)}`
          : "Wallet User"),
      email: syntheticEmail,
      image: currentUser.image || null,
    },
    session: {
      activeOrganizationId,
    },
    expiresAt: new Date((siwePayload.exp || 0) * 1000),
  };
}
```

## 2) Add `apps/sim/lib/security/internal-secret.ts`

```ts
// Returns a stable secret key for internal HMAC signing/verifying.
// Prefers explicit INTERNAL_API_SECRET; otherwise derives from BETTER_AUTH_SECRET or ENCRYPTION_KEY.
import { createHmac } from "crypto";

let cachedKey: Uint8Array | null = null;

export function getInternalApiSecretKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  const explicit = process.env.INTERNAL_API_SECRET as string | undefined;
  if (explicit && explicit.length >= 32) {
    cachedKey = new TextEncoder().encode(explicit);
    return cachedKey;
  }

  const base = (process.env.BETTER_AUTH_SECRET ||
    process.env.ENCRYPTION_KEY ||
    "") as string;
  const digest = createHmac("sha256", String(base))
    .update("sim-internal-api-secret-v1")
    .digest();
  cachedKey = new Uint8Array(digest);
  return cachedKey;
}
```

## 3) Add `apps/sim/lib/auth/siwe-cookie.ts`

```ts
// This module signs and verifies the 'siwe_session' cookie on Node runtime.
// This module handles SIWE cookie HMAC signing and verification.
import { createHmac, timingSafeEqual } from "crypto";
import { getInternalApiSecretKey } from "@/lib/security/internal-secret";

export interface SiweCookiePayload {
  uid: string;
  addr: string;
  iat: number;
  exp: number;
}

function base64urlEncode(input: Uint8Array | string): string {
  const buffer =
    typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buffer.toString("base64url");
}

function base64urlDecodeToString(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

// Step 1: Create HMAC signature over payload
function sign(payloadB64: string): string {
  const key = Buffer.from(getInternalApiSecretKey());
  const mac = createHmac("sha256", key).update(payloadB64).digest();
  return base64urlEncode(mac);
}

// Step 2: Encode signed cookie
export function encodeSignedSiweCookie(payload: SiweCookiePayload): string {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64urlEncode(payloadJson);
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

// Step 3: Decode and verify signed cookie
export function decodeAndVerifySiweCookie(
  value: string | undefined | null
): SiweCookiePayload | null {
  try {
    if (!value) return null;
    const parts = value.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    const expected = sign(payloadB64);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payloadStr = base64urlDecodeToString(payloadB64);
    const payload = JSON.parse(payloadStr) as SiweCookiePayload;
    if (!payload?.uid || !payload?.addr || !payload?.iat || !payload?.exp)
      return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
```

## 4) Add `apps/sim/lib/auth/siwe-cookie-edge.ts`

```ts
// Edge-runtime compatible SIWE cookie verifier using Web Crypto.
// This module verifies 'siwe_session' cookies in middleware.
export interface SiweCookiePayloadEdge {
  uid: string;
  addr: string;
  iat: number;
  exp: number;
}

function te(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64urlDecodeToUint8(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const s = str.replaceAll("-", "+").replaceAll("_", "/") + pad;
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveInternalKeyBytes(): Promise<Uint8Array> {
  // Step 1: Prefer explicit INTERNAL_API_SECRET
  const explicit = (process.env.INTERNAL_API_SECRET || "") as string;
  if (explicit && explicit.length >= 32) return te(explicit);

  // Step 2: Derive from BETTER_AUTH_SECRET or ENCRYPTION_KEY
  const base = (process.env.BETTER_AUTH_SECRET ||
    process.env.ENCRYPTION_KEY ||
    "") as string;
  const baseKey = await crypto.subtle.importKey(
    "raw",
    te(String(base)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    baseKey,
    te("sim-internal-api-secret-v1")
  );
  return new Uint8Array(digest);
}

async function importHmacKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayloadB64(
  payloadB64: string,
  key: CryptoKey
): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", key, te(payloadB64));
  return base64urlEncode(sig);
}

export async function decodeAndVerifySiweCookieEdge(
  value: string | undefined | null
): Promise<SiweCookiePayloadEdge | null> {
  try {
    if (!value) return null;
    const parts = value.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    const keyBytes = await deriveInternalKeyBytes();
    const key = await importHmacKey(keyBytes);
    const expectedSig = await signPayloadB64(payloadB64, key);
    if (sig.length !== expectedSig.length) return null;

    let mismatch = 0;
    for (let i = 0; i < sig.length; i++)
      mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    if (mismatch !== 0) return null;

    const payloadBytes = base64urlDecodeToUint8(payloadB64);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadStr) as SiweCookiePayloadEdge;
    if (!payload?.uid || !payload?.addr || !payload?.iat || !payload?.exp)
      return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
```

## 5) Add SIWE API routes

### `apps/sim/app/api/auth/siwe/nonce/route.ts`

```ts
// Issues a SIWE nonce and optionally stores it in Redis for one-time use.
import { NextResponse, type NextRequest } from "next/server";
import { getRedisClient } from "@/lib/redis";
import { createLogger } from "@/lib/logs/console/logger";
import { env } from "@/lib/env";
import { generateNonce } from "siwe";

const logger = createLogger("SIWE:Nonce");
const NONCE_PREFIX = "siwe:nonce:";
const NONCE_TTL_SECONDS = 5 * 60;

export async function GET(_req: NextRequest) {
  try {
    // Step 1: Generate SIWE-compliant nonce
    const nonce = generateNonce();

    // Step 2: Store in Redis for single-use if configured
    if (env.REDIS_URL) {
      const redis = getRedisClient();
      if (redis) {
        await redis.set(
          `${NONCE_PREFIX}${nonce}`,
          "1",
          "EX",
          NONCE_TTL_SECONDS
        );
      }
    }

    // Step 3: Return plain text
    return new NextResponse(nonce, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  } catch (error) {
    logger.error("Failed to issue SIWE nonce", { error });
    return NextResponse.json(
      { error: "Failed to issue nonce" },
      { status: 500 }
    );
  }
}
```

### `apps/sim/app/api/auth/siwe/verify/route.ts`

```ts
// Verifies a signed SIWE message, creates user if needed, and sets a signed siwe_session cookie.
// This endpoint validates EIP-4361 messages and issues a signed cookie for session semantics.
import { NextResponse, type NextRequest } from "next/server";
import { SiweMessage } from "siwe";
import { eq } from "drizzle-orm";
import { db } from "@sim/db";
import { user as userTable } from "@sim/db/schema";
import { getRedisClient } from "@/lib/redis";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logs/console/logger";
import { encodeSignedSiweCookie } from "@/lib/auth/siwe-cookie";

const logger = createLogger("SIWE:Verify");
const NONCE_PREFIX = "siwe:nonce:";

function toLowerChecksum(address: string) {
  return address?.toLowerCase();
}

function setSiweSessionCookie(
  res: NextResponse,
  userId: string,
  address: string
) {
  // Step 1: Build payload
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    uid: userId,
    addr: address,
    iat: nowSec,
    exp: nowSec + 24 * 60 * 60,
  };

  // Step 2: Sign and set cookie
  const value = encodeSignedSiweCookie(payload);
  res.cookies.set({
    name: "siwe_session",
    value,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60,
  });
}

export async function POST(req: NextRequest) {
  try {
    // Step 1: Parse body
    const body = await req.json();
    const { message, signature } = body || {};
    if (!message || !signature) {
      return NextResponse.json(
        { error: "Missing message or signature" },
        { status: 400 }
      );
    }

    // Step 2: Verify SIWE
    const siwe = new SiweMessage(message);
    const domain = new URL(req.url).host;
    const result = await siwe.verify({ signature, domain });
    if (!result.success) {
      return NextResponse.json({ error: "Invalid SIWE" }, { status: 401 });
    }

    // Step 3: Enforce one-time nonce if Redis is available
    if (env.REDIS_URL) {
      const redis = getRedisClient();
      if (redis) {
        const nonceKey = `${NONCE_PREFIX}${siwe.nonce}`;
        const existed = await redis.get(nonceKey);
        if (!existed) {
          return NextResponse.json(
            { error: "Nonce expired/used" },
            { status: 401 }
          );
        }
        await redis.del(nonceKey);
      }
    }

    // Step 4: Find or create user by wallet address
    const address = toLowerChecksum(siwe.address);
    if (!address) {
      return NextResponse.json({ error: "No address" }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(userTable)
      .where(eq(userTable.walletAddress, address))
      .limit(1);

    let user = existing[0];
    if (!user) {
      const now = new Date();
      const id = `user_${now.getTime()}_${Math.random().toString(36).slice(2, 10)}`;
      const name = `Wallet ${address.slice(0, 6)}…${address.slice(-4)}`;
      const email = `${address}@wallet.user`; // synthetic, never emailed

      const inserted = await db
        .insert(userTable)
        .values({
          id,
          name,
          email,
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
          stripeCustomerId: null,
          walletAddress: address,
        })
        .returning();
      user = inserted[0];
    }

    // Step 5: Set cookie and return
    const res = NextResponse.json({ ok: true });
    setSiweSessionCookie(res, user.id, address);
    return res;
  } catch (error) {
    logger.error("SIWE verify failed", { error });
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
```

### `apps/sim/app/api/auth/siwe/logout/route.ts`

```ts
// Clears the SIWE session cookie.
// This endpoint removes the wallet-based session cookie immediately.
import { NextResponse } from "next/server";

export async function POST() {
  // Step 1: Clear cookie by setting maxAge=0
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "siwe_session",
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
```

## 6) Edit `apps/sim/middleware.ts`

Add this import at the top:

```ts
import { decodeAndVerifySiweCookieEdge } from "@/lib/auth/siwe-cookie-edge";
```

Replace the session detection:

```ts
const sessionCookie = getSessionCookie(request);
const siweRaw = request.cookies.get("siwe_session")?.value;
const siwe = await decodeAndVerifySiweCookieEdge(siweRaw);
const hasActiveSession = !!sessionCookie || !!siwe;
```

Leave the rest unchanged. This allows wallet sessions to pass middleware checks.

## 7) Update `apps/sim/app/(auth)/components/social-login-buttons.tsx`

- Add wallet login with Web3 Onboard + WalletConnect v2 + ethers v6.x + SIWE.
- Respect `NEXT_PUBLIC_WALLET_ONLY_AUTH=true` to hide OAuth buttons.

```tsx
"use client";

import { type ReactNode, useEffect, useState } from "react";
import { GithubIcon, GoogleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/auth-client";
import { inter } from "@/app/fonts/inter";

import Onboard from "@web3-onboard/core";
import injectedModule from "@web3-onboard/injected-wallets";
import walletConnectModule from "@web3-onboard/walletconnect";
import { SiweMessage } from "siwe";
import { ethers } from "ethers";
import { getEnv } from "@/lib/env";

interface SocialLoginButtonsProps {
  githubAvailable: boolean;
  googleAvailable: boolean;
  callbackURL?: string;
  isProduction: boolean;
  children?: ReactNode;
}

export function SocialLoginButtons({
  githubAvailable,
  googleAvailable,
  callbackURL = "/workspace",
  isProduction,
  children,
}: SocialLoginButtonsProps) {
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Step 1: SSR safety
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;

  // Step 2: Wallet-only toggle
  const walletOnly =
    String(getEnv("NEXT_PUBLIC_WALLET_ONLY_AUTH") || "").toLowerCase() ===
    "true";

  async function signInWithGithub() {
    if (!githubAvailable) return;
    setIsGithubLoading(true);
    try {
      await client.signIn.social({ provider: "github", callbackURL });
    } finally {
      setIsGithubLoading(false);
    }
  }

  async function signInWithGoogle() {
    if (!googleAvailable) return;
    setIsGoogleLoading(true);
    try {
      await client.signIn.social({ provider: "google", callbackURL });
    } finally {
      setIsGoogleLoading(false);
    }
  }

  const githubButton = (
    <Button
      variant="outline"
      className="w-full rounded-[10px] shadow-sm hover:bg-gray-50"
      disabled={!githubAvailable || isGithubLoading}
      onClick={signInWithGithub}
    >
      <GithubIcon className="!h-[18px] !w-[18px] mr-1" />
      {isGithubLoading ? "Connecting..." : "GitHub"}
    </Button>
  );

  const googleButton = (
    <Button
      variant="outline"
      className="w-full rounded-[10px] shadow-sm hover:bg-gray-50"
      disabled={!googleAvailable || isGoogleLoading}
      onClick={signInWithGoogle}
    >
      <GoogleIcon className="!h-[18px] !w-[18px] mr-1" />
      {isGoogleLoading ? "Connecting..." : "Google"}
    </Button>
  );

  return (
    <div className={`${inter.className} grid gap-3 font-light`}>
      <WalletLoginButton />
      {!walletOnly && googleAvailable && googleButton}
      {!walletOnly && githubAvailable && githubButton}
      {children}
    </div>
  );
}

// WalletConnect v2 preferred over v1 for better mobile support and security.
function WalletLoginButton() {
  const [isLoading, setIsLoading] = useState(false);

  async function handleWalletLogin() {
    // Step 1: Initialize Web3 Onboard with Injected and WalletConnect v2
    setIsLoading(true);
    try {
      const injected = injectedModule();
      const wcProjectId = getEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID");
      const walletConnect = walletConnectModule({
        projectId: wcProjectId || "00000000000000000000000000000000",
      });

      const onboard = Onboard({
        wallets: [injected, walletConnect],
        chains: [
          {
            id: "0x1",
            token: "ETH",
            label: "Ethereum",
            rpcUrl: "https://rpc.ankr.com/eth",
          },
        ],
        appMetadata: {
          name: "Sim",
          icon: '<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" fill=\"#701ffc\"/></svg>',
          description: "Sign in with your crypto wallet",
          recommendedInjectedWallets: [
            { name: "MetaMask", url: "https://metamask.io" },
          ],
        },
      });

      // Step 2: Connect wallet and derive address, chain
      const connected = await onboard.connectWallet();
      if (!connected.length) return;

      const { accounts, chains, provider } = connected[0];
      const address = accounts[0].address;
      const checksumAddress = ethers.getAddress(address);
      const chainId = Number.parseInt(chains[0].id, 16);

      // Step 3: Request a nonce from server
      const nonce = await fetch("/api/auth/siwe/nonce", {
        cache: "no-store",
      }).then((r) => r.text());

      // Step 4: Build EIP-4361 message and sign with ethers v6.x
      const message = new SiweMessage({
        domain: window.location.host,
        address: checksumAddress,
        statement: "Sign in to Sim",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      });

      const browserProvider = new ethers.BrowserProvider(provider as any);
      const signer = await browserProvider.getSigner();
      const signature = await signer.signMessage(message.prepareMessage());

      // Step 5: Verify SIWE on server (sets signed session cookie)
      const verifyRes = await fetch("/api/auth/siwe/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!verifyRes.ok) throw new Error("SIWE verification failed");

      // Step 6: Redirect to workspace
      window.location.href = "/workspace";
    } catch (error) {
      console.error("Wallet login failed", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      className="w-full rounded-[10px] shadow-sm hover:bg-gray-50"
      disabled={isLoading}
      onClick={handleWalletLogin}
    >
      {isLoading ? "Connecting wallet…" : "Continue with Wallet"}
    </Button>
  );
}
```

## 8) (Optional) Add `apps/sim/app/api/auth/socket-token/route.ts`

```ts
// Issues a short-lived internal token for sockets. Falls back to SIWE cookie.
import { headers, cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { auth } from "@/lib/auth";
import { getInternalApiSecretKey } from "@/lib/security/internal-secret";
import { decodeAndVerifySiweCookie } from "@/lib/auth/siwe-cookie";

export async function POST() {
  try {
    const response = await auth.api.generateOneTimeToken({
      headers: await headers(),
    });
    if (response?.token) {
      return NextResponse.json({ token: response.token });
    }

    // Step 1: Fallback to SIWE cookie
    const cookieStore = await cookies();
    const siweRaw = cookieStore.get("siwe_session")?.value;
    const siwe = decodeAndVerifySiweCookie(siweRaw);
    if (!siwe?.uid) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Step 2: Sign a short-lived internal JWT
    const secret = getInternalApiSecretKey();
    const token = await new SignJWT({ type: "socket", userId: siwe.uid })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(secret);
    return NextResponse.json({ token });
  } catch {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
}
```

## 9) Database migration (develop)

If the `wallet_address` column does not exist on `user`, add:

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "wallet_address" text UNIQUE;
```

Store addresses lowercase.

## 10) Add dependencies to `apps/sim/package.json`

```json
{
  "dependencies": {
    "@web3-onboard/core": "^2.20.2",
    "@web3-onboard/injected-wallets": "^2.10.9",
    "@web3-onboard/walletconnect": "2.6.2",
    "ethers": "^6.13.4",
    "siwe": "^2.3.2"
  }
}
```

## 11) Environment configuration

- Required:
  - `INTERNAL_API_SECRET` (≥ 32 chars) or `BETTER_AUTH_SECRET` / `ENCRYPTION_KEY` (≥ 32 chars)
  - `DATABASE_URL`
  - `NEXT_PUBLIC_APP_URL`
- Optional:
  - `REDIS_URL` (enforce nonce one-time use)
  - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (WalletConnect v2)
- Toggle:
  - `NEXT_PUBLIC_WALLET_ONLY_AUTH=true` (already present)

## QA checklist

- Injected wallet login (MetaMask) on desktop
- WalletConnect v2 on mobile with a real project ID
- Nonce single-use with and without Redis
- `getSession()` returns a session derived from SIWE cookie; downstream pages and API routes continue to work
- Middleware accepts SIWE and redirects unauthenticated users to `/login`
- Logout clears cookie; navigating to `/workspace` redirects to `/login`
- User auto-created on first SIWE verify; `wallet_address` stored lowercase; synthetic email present when needed
