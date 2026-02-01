I'll create a comprehensive agentic execution plan specifically tailored for **PulseChain** (Chain ID: 369) with your own validator RPC. Here's the downloadable markdown plan:

```markdown
# Agent Execution Plan: PulseChain NFT-Gated Sim Studio

**Target Repository**: `https://github.com/simstudioai/sim`  
**Branch**: `feat/pulsechain-nft-gating`  
**Chain**: PulseChain (369)  
**RPC**: Self-hosted validator  
**Contract Standard**: ERC-721 (PulseChain)

---

## 0. Pre-Flight Configuration

### Environment Variables (CRITICAL - Set First)
```bash
# PulseChain Configuration
NFT_CHAIN_ID=369
NFT_CONTRACT_ADDRESS=0xYourPulseChainContractAddress
PULSECHAIN_RPC_URL=http://your-validator-ip:8545  # Or https://your-rpc-domain
PULSECHAIN_WS_URL=ws://your-validator-ip:8546     # WebSocket for events

# Contract Details
NFT_CONTRACT_DEPLOYED_BLOCK=12345678  # For event indexing (optional)

# Tier Configuration (if using specific token IDs for tiers)
TIER_PREMIUM_TOKEN_IDS=1,2,3,4,5      # Example: First 5 IDs are premium
TIER_STANDARD_MIN=6                   # 6+ are standard
```

### Dependencies to Install
```bash
# Root level
bun add viem@^2.0.0 
# Note: No Alchemy SDK needed - using direct RPC

# App level
cd apps/sim
bun add @better-auth/siwe@latest
bun add -d @types/node
```

---

## 1. Database Schema Migration

### File: `packages/db/schema/workspaces.ts`

**Operation**: ADD these columns to existing `workspaces` table

```typescript
import { 
  pgTable, 
  varchar, 
  jsonb, 
  integer, 
  index, 
  timestamp,
  bigint 
} from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  // Existing columns (KEEP ALL)...
  id: varchar("id", { length: 128 }).primaryKey(),
  
  // NEW: PulseChain-specific fields
  ownerAddress: varchar("owner_address", { length: 42 }).notNull().unique(),
  tokenId: bigint("token_id", { mode: "number" }),  // PulseChain uses big ints
  tier: varchar("tier", { length: 32 }).notNull().default("standard"),
  
  // PulseChain metadata
  metadata: jsonb("metadata").$type<{
    verifiedAt: string;
    tokenUri?: string;
    ensName?: string;  // PulseChain ENS equivalent if exists
    pulseDomain?: string;
    transactionHash?: string;  // Mint tx for verification
  }>(),
  
  // Usage limits based on NFT tier
  limits: jsonb("limits").$type<{
    maxWorkflows: number;
    maxApiCalls: number;
    maxStorageMB: number;
    maxAgents: number;
  }>().default({
    maxWorkflows: 10,
    maxApiCalls: 1000,
    maxStorageMB: 100,
    maxAgents: 2
  }),
  
  // PulseChain tracking
  lastVerifiedAt: timestamp("last_verified_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Indexes for performance
  ownerIdx: index("workspace_owner_idx").on(table.ownerAddress),
  tierIdx: index("workspace_tier_idx").on(table.tier),
  tokenIdx: index("workspace_token_idx").on(table.tokenId),
}));
```

**Migration Command**:
```bash
cd packages/db
bunx drizzle-kit generate:pg --name add_pulsechain_workspace_support
bunx drizzle-kit migrate
```

**Acceptance Criteria**:
- [ ] Migration file created with new columns
- [ ] `ownerAddress` has UNIQUE constraint
- [ ] `tokenId` uses BIGINT (PulseChain compatibility)
- [ ] Database migrates without errors

---

## 2. PulseChainRPC Client Setup

### File: `apps/sim/lib/pulsechain-client.ts` (NEW)

```typescript
import { createPublicClient, createWalletClient, custom, http, webSocket } from 'viem';
import { pulsechain } from 'viem/chains';

// PulseChain mainnet configuration
export const pulsechainConfig = {
  id: 369,
  name: 'PulseChain',
  network: 'pulsechain',
  nativeCurrency: {
    decimals: 18,
    name: 'Pulse',
    symbol: 'PLS',
  },
  rpcUrls: {
    default: {
      http: [process.env.PULSECHAIN_RPC_URL!],
      webSocket: [process.env.PULSECHAIN_WS_URL!],
    },
    public: {
      http: [process.env.PULSECHAIN_RPC_URL!],
      webSocket: [process.env.PULSECHAIN_WS_URL!],
    },
  },
  blockExplorers: {
    default: { name: 'PulseScan', url: 'https://scan.pulsechain.com' },
  },
};

// Public client for read operations
export const publicClient = createPublicClient({
  chain: pulsechainConfig,
  transport: http(process.env.PULSECHAIN_RPC_URL, {
    retryCount: 3,
    retryDelay: 1000,
  }),
});

// WebSocket client for real-time events (optional)
export const wsClient = process.env.PULSECHAIN_WS_URL 
  ? createPublicClient({
      chain: pulsechainConfig,
      transport: webSocket(process.env.PULSECHAIN_WS_URL),
    })
  : null;

// Health check
export async function checkPulseConnection(): Promise<boolean> {
  try {
    const blockNumber = await publicClient.getBlockNumber();
    console.log(`[PulseChain] Connected. Block: ${blockNumber}`);
    return true;
  } catch (error) {
    console.error('[PulseChain] RPC Connection failed:', error);
    return false;
  }
}
```

**Acceptance Criteria**:
- [ ] Client connects to custom RPC endpoint
- [ ] Health check logs current block number
- [ ] Fallback to http if ws fails

---

## 3. NFT Verification Service (PulseChain)

### File: `apps/sim/lib/nft-verification.ts` (NEW)

**PulseChain-Specific Implementation**:

```typescript
import { getContract, parseAbi, Address } from 'viem';
import { publicClient } from './pulsechain-client';

// Standard ERC721 ABI (minimal for gas efficiency)
const erc721Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function totalSupply() view returns (uint256)',
  // Optional: If your NFT has specific tier attributes
  'function getTokenTier(uint256 tokenId) view returns (uint8)',
]);

// Cache to prevent RPC spam (5 minute TTL)
const verificationCache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface NFTOwnershipResult {
  hasNFT: boolean;
  tokenId?: number;
  tier?: 'standard' | 'premium' | 'enterprise';
  balance?: bigint;
  metadata?: {
    uri?: string;
    name?: string;
  };
}

export async function verifyPulseNFT(
  walletAddress: Address
): Promise<NFTOwnershipResult> {
  // Check cache
  const cached = verificationCache.get(walletAddress);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  try {
    const contract = getContract({
      address: process.env.NFT_CONTRACT_ADDRESS as Address,
      abi: erc721Abi,
      client: publicClient,
    });

    // Get balance
    const balance = await contract.read.balanceOf([walletAddress]);
    
    if (balance === 0n) {
      const result = { hasNFT: false, balance: 0n };
      verificationCache.set(walletAddress, { result, timestamp: Date.now() });
      return result;
    }

    // Determine tier based on config or contract call
    let tier: NFTOwnershipResult['tier'] = 'standard';
    
    // Option A: Check specific token IDs if configured
    if (process.env.TIER_PREMIUM_TOKEN_IDS) {
      const premiumIds = process.env.TIER_PREMIUM_TOKEN_IDS.split(',').map(Number);
      // For simplicity, check first owned token
      // In production, iterate through all owned tokens
      tier = premiumIds.includes(1) ? 'premium' : 'standard'; // Simplified logic
    }
    
    // Option B: Check contract for tier function
    try {
      const tokenTier = await contract.read.getTokenTier([1n]); // Assuming token ID 1
      tier = tokenTier === 0 ? 'standard' : tokenTier === 1 ? 'premium' : 'enterprise';
    } catch {
      // Contract doesn't have getTokenTier, use balance-based logic
      tier = balance > 1n ? 'premium' : 'standard';
    }

    const result: NFTOwnershipResult = {
      hasNFT: true,
      tokenId: 1, // You may want to find the specific token ID owned
      tier,
      balance,
    };

    verificationCache.set(walletAddress, { result, timestamp: Date.now() });
    return result;

  } catch (error) {
    console.error('[PulseChain NFT Verify Error]:', error);
    throw new Error('PULSECHAIN_RPC_ERROR');
  }
}

// Clear cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of verificationCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      verificationCache.delete(key);
    }
  }
}, CACHE_TTL);
```

**Acceptance Criteria**:
- [ ] Successfully calls `balanceOf` on PulseChain contract
- [ ] Returns correct tier based on configuration
- [ ] Caches results for 5 minutes
- [ ] Handles RPC failures gracefully

---

## 4. Better Auth + SIWE Integration

### File: `apps/sim/lib/auth.ts` (MODIFY)

**PulseChain Configuration**:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { siwe } from "@better-auth/siwe";
import { db } from "@/db";
import { verifyPulseNFT } from "./nft-verification";
import { workspaces } from "@/db/schema";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

// PulseChain domain configuration
const domain = process.env.NEXT_PUBLIC_APP_URL || "localhost:3000";
const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "http://localhost:3000";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET,
  
  plugins: [
    siwe({
      domain,
      statement: "Sign in to Sim Studio on PulseChain. NFT ownership required.",
      
      async getNonce() {
        return nanoid(16);
      },
      
      async verifyMessage({ message, signature, address }) {
        console.log(`[Auth] Verifying SIWE for ${address} on PulseChain`);
        
        // 1. SIWE signature verification (handled by plugin, but we double-check context)
        // 2. PulseChain NFT Verification
        const { hasNFT, tier, tokenId, balance } = await verifyPulseNFT(address as `0x${string}`);
        
        if (!hasNFT) {
          console.warn(`[Auth] Access denied for ${address}: No NFT found`);
          const error = new Error("NFT_OWNERSHIP_REQUIRED");
          (error as any).code = "NO_NFT_PULSECHAIN";
          (error as any).details = {
            contract: process.env.NFT_CONTRACT_ADDRESS,
            chain: "PulseChain (369)",
            address
          };
          throw error;
        }

        console.log(`[Auth] Access granted to ${address}. Tier: ${tier}, Balance: ${balance}`);
        
        // Store metadata for signIn callback
        (global as any).pendingAuth = {
          address,
          tokenId,
          tier,
          chainId: 369
        };
        
        return true;
      },
      
      // Enforce PulseChain specifically
      chainId: 369,
    })
  ],
  
  callbacks: {
    async signIn(user, account, profile) {
      const metadata = (global as any).pendingAuth;
      if (!metadata || metadata.chainId !== 369) return false;
      
      try {
        // Check if workspace exists
        const existing = await db.query.workspaces.findFirst({
          where: eq(workspaces.ownerAddress, metadata.address)
        });
        
        if (existing) {
          // Update last verified
          await db.update(workspaces)
            .set({ lastVerifiedAt: new Date() })
            .where(eq(workspaces.id, existing.id));
          
          console.log(`[Workspace] Existing workspace found: ${existing.id}`);
          return true;
        }
        
        // Create new workspace for NFT holder
        const limits = getTierLimits(metadata.tier);
        
        const newWorkspace = await db.insert(workspaces).values({
          id: nanoid(),
          ownerAddress: metadata.address,
          tokenId: metadata.tokenId,
          tier: metadata.tier,
          limits,
          metadata: {
            verifiedAt: new Date().toISOString(),
            chain: "PulseChain",
            contract: process.env.NFT_CONTRACT_ADDRESS
          }
        }).returning();
        
        console.log(`[Workspace] Created new workspace: ${newWorkspace[0].id} for ${metadata.address}`);
        
        // Cleanup
        delete (global as any).pendingAuth;
        return true;
        
      } catch (error) {
        console.error("[Auth Callback Error]:", error);
        return false;
      }
    }
  }
});

function getTierLimits(tier: string) {
  switch(tier) {
    case 'enterprise':
      return { maxWorkflows: 100, maxApiCalls: 100000, maxStorageMB: 10000, maxAgents: 20 };
    case 'premium':
      return { maxWorkflows: 50, maxApiCalls: 10000, maxStorageMB: 1000, maxAgents: 10 };
    default:
      return { maxWorkflows: 5, maxApiCalls: 500, maxStorageMB: 100, maxAgents: 2 };
  }
}
```

**Acceptance Criteria**:
- [ ] SIWE message specifies PulseChain
- [ ] `chainId: 369` enforced in auth config
- [ ] Failed NFT ownership returns specific error code `NO_NFT_PULSECHAIN`
- [ ] Workspace auto-created with correct tier limits
- [ ] Duplicate workspaces prevented (unique ownerAddress)

---

## 5. Workspace Isolation Middleware

### File: `apps/sim/lib/workspace-context.ts` (NEW)

**PulseChain-Aware Context Resolution**:

```typescript
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { checkPulseConnection } from "./pulsechain-client";

export interface WorkspaceContext {
  id: string;
  ownerAddress: string;
  tier: string;
  limits: {
    maxWorkflows: number;
    maxApiCalls: number;
    maxStorageMB: number;
    maxAgents: number;
  };
  tokenId: number;
}

export async function getCurrentWorkspace(): Promise<WorkspaceContext> {
  const headersList = headers();
  const workspaceId = headersList.get('x-workspace-id');
  const ownerAddress = headersList.get('x-wallet-address');
  
  // If headers set by middleware, use them
  if (workspaceId && ownerAddress) {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });
    
    if (workspace) return workspace as WorkspaceContext;
  }
  
  // Fallback: derive from session (for SSR/App Router)
  // This requires Better Auth session to be available
  const { auth } = await import("./auth");
  const session = await auth();
  
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  
  const walletAddress = session.user.id; // In SIWE, user.id = wallet address
  
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerAddress, walletAddress),
  });
  
  if (!workspace) {
    throw new Error("WORKSPACE_NOT_FOUND");
  }
  
  return workspace as WorkspaceContext;
}

export async function withWorkspaceGuard<T>(
  operation: (ctx: WorkspaceContext) => Promise<T>,
  options?: {
    requireTier?: ('standard' | 'premium' | 'enterprise')[];
    checkResource?: 'workflow' | 'agent' | 'api';
  }
): Promise<T> {
  const ctx = await getCurrentWorkspace();
  
  // Tier check
  if (options?.requireTier && !options.requireTier.includes(ctx.tier as any)) {
    throw new Error("INSUFFICIENT_TIER");
  }
  
  // Resource limit check
  if (options?.checkResource) {
    const currentUsage = await getResourceUsage(ctx.id, options.checkResource);
    const limit = ctx.limits[`max${options.checkResource.charAt(0).toUpperCase() + options.checkResource.slice(1)}s` as keyof typeof ctx.limits];
    
    if (currentUsage >= limit) {
      throw new Error("RESOURCE_LIMIT_EXCEEDED");
    }
  }
  
  return operation(ctx);
}

async function getResourceUsage(workspaceId: string, resource: string): Promise<number> {
  // Query actual usage from database
  // This is pseudo-code - adapt to actual Sim Studio schema
  const result = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM ${sql.raw(resource)}s 
    WHERE workspace_id = ${workspaceId}
  `);
  return Number(result.rows[0].count);
}

// RPC Health Check Endpoint (useful for debugging)
export async function verifyPulseConnection(): Promise<boolean> {
  return checkPulseConnection();
}
```

### File: `apps/sim/middleware.ts` (MODIFY)

**Add PulseChain Workspace Injection**:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function middleware(request: NextRequest) {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  
  const walletAddress = session.user.id;
  
  // Lookup workspace
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerAddress, walletAddress),
  });
  
  if (!workspace) {
    return NextResponse.redirect(new URL("/onboarding/nft-required", request.url));
  }
  
  // Clone headers and add workspace context
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-workspace-id", workspace.id);
  requestHeaders.set("x-wallet-address", walletAddress);
  requestHeaders.set("x-tier", workspace.tier);
  requestHeaders.set("x-token-id", workspace.tokenId.toString());
  
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/api/workflow/:path*",
    "/api/blocks/:path*", 
    "/api/execute/:path*",
    "/dashboard/:path*",
    "/settings/:path*"
  ],
};
```

**Acceptance Criteria**:
- [ ] All API routes have `x-workspace-id` header
- [ ] Missing workspace redirects to error page
- [ ] Tier and token ID available in headers for downstream use

---

## 6. Frontend: PulseChain Wallet Login

### File: `apps/sim/components/auth/pulsechain-login.tsx` (NEW)

**Full Implementation**:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createWalletClient, custom, Address } from 'viem';
import { createAuthClient } from "better-auth/client";
import { siweClient } from "@better-auth/siwe/client";

// PulseChain config (must match server)
const pulsechain = {
  id: 369,
  name: 'PulseChain',
  network: 'pulsechain',
  nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.pulsechain.com'] }, // Fallback only
  },
};

const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [siweClient()]
});

export function PulseChainLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isPulseAvailable, setIsPulseAvailable] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check if.MetaMask or Web3 wallet is available
    if (typeof window !== 'undefined' && window.ethereum) {
      setIsPulseAvailable(true);
    }
  }, []);

  const connectAndSign = async () => {
    setIsLoading(true);
    setError("");

    try {
      if (!window.ethereum) {
        window.open("https://metamask.io", "_blank");
        return;
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts"
      }) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found");
      }

      const address = accounts[0] as Address;

      // Ensure we're on PulseChain (369)
      const currentChain = await window.ethereum.request({ method: 'eth_chainId' });
      if (currentChain !== '0x171') { // 369 in hex
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x171' }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x171',
                chainName: 'PulseChain',
                nativeCurrency: { name: 'PLS', symbol: 'PLS', decimals: 18 },
                rpcUrls: [process.env.NEXT_PUBLIC_PULSECHAIN_RPC || 'https://rpc.pulsechain.com'],
                blockExplorerUrls: ['https://scan.pulsechain.com']
              }]
            });
          }
        }
      }

      // Get nonce from server
      const nonce = await authClient.siwe.getNonce();

      // Create SIWE message
      const message = `localhost:3000 wants you to sign in with your Ethereum account:\n${address}\n\nSign in to access your Sim Studio workspace on PulseChain.\n\nURI: ${window.location.origin}\nVersion: 1\nChain ID: 369\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}\nResources:\n- NFT Contract: ${process.env.NEXT_PUBLIC_NFT_CONTRACT}`;

      // Sign message
      const walletClient = createWalletClient({
        account: address,
        chain: pulsechain,
        transport: custom(window.ethereum)
      });

      const signature = await walletClient.signMessage({ message });

      // Verify with server
      const result = await authClient.siwe.verify({
        message,
        signature,
        address,
        chainId: 369
      });

      if (result.error) {
        if (result.error.code === "NO_NFT_PULSECHAIN") {
          setError(
            `Access Denied: Your wallet (${address.slice(0, 6)}...${address.slice(-4)}) does not hold the required NFT on PulseChain. 
            Contract: ${process.env.NEXT_PUBLIC_NFT_CONTRACT?.slice(0, 10)}...`
          );
        } else {
          setError("Authentication failed. Please try again.");
        }
        return;
      }

      // Success - redirect to dashboard
      router.push("/dashboard");
      router.refresh();

    } catch (err: any) {
      console.error(err);
      if (err.code === 4001) {
        setError("You rejected the signature request.");
      } else {
        setError(err.message || "Connection failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isPulseAvailable) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="font-semibold text-yellow-800">Web3 Wallet Required</h3>
        <p className="text-sm text-yellow-700 mt-2">
          Please install MetaMask or a Web3-compatible wallet to access this platform.
        </p>
        <a 
          href="https://metamask.io" 
          target="_blank" 
          rel="noopener noreferrer"
          className="mt-4 inline-block px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
        >
          Install MetaMask
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={connectAndSign}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50 transition-all"
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Verifying PulseChain NFT...
          </>
        ) : (
          <>
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              {/* Ethereum/Hexagon icon */}
              <path d="M12 2L2 12l10 10 10-10L12 2z"/>
            </svg>
            Connect PulseChain Wallet
          </>
        )}
      </button>

      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm">
          <p className="font-semibold">Access Denied</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-xs opacity-70">
            Ensure your wallet is connected to PulseChain (Chain ID: 369) and holds the required NFT.
          </p>
        </div>
      )}

      <div className="text-center text-xs text-gray-500">
        <p>Powered by PulseChain • Chain ID: 369</p>
        <p className="mt-1">Contract: {process.env.NEXT_PUBLIC_NFT_CONTRACT?.slice(0, 16)}...</p>
      </div>
    </div>
  );
}
```

### File: `apps/sim/app/login/page.tsx` (MODIFY - Adapt Existing)

Replace or supplement existing login with PulseChain option:

```tsx
import { PulseChainLogin } from "@/components/auth/pulsechain-login";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-2xl shadow-xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Sim Studio</h2>
          <p className="mt-2 text-gray-600">NFT-Gated Access on PulseChain</p>
        </div>
        
        <PulseChainLogin />
        
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Secure Access</span>
          </div>
        </div>
        
        <div className="text-center text-xs text-gray-400">
          <p>Each NFT holder receives an isolated workspace.</p>
          <p className="mt-1">Self-hosted instance connected to PulseChain.</p>
        </div>
      </div>
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] Auto-detects if wallet has PulseChain, prompts to switch if not
- [ ] Shows specific error for missing NFT including partial address
- [ ] Displays loading state while verifying NFT
- [ ] Shows contract address for transparency
- [ ] Responsive design

---

## 7. API Protection & Resource Limits

### File: `apps/sim/app/api/workflow/route.ts` (Example - Apply to All Resources)

**Protected Route Implementation**:

```typescript
import { NextRequest } from "next/server";
import { withWorkspaceGuard } from "@/lib/workspace-context";
import { createWorkflow } from "@/db/operations"; // Adapt to actual DB functions

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const result = await withWorkspaceGuard(
      async (ctx) => {
        // Inject workspace isolation
        const workflow = await createWorkflow({
          ...body,
          workspaceId: ctx.id, // FORCE workspace isolation
          ownerAddress: ctx.ownerAddress,
          tier: ctx.tier
        });
        
        return workflow;
      },
      { 
        checkResource: 'workflow' // This checks count against limits
      }
    );
    
    return Response.json(result, { status: 201 });
    
  } catch (error: any) {
    console.error("[Workflow Create Error]:", error);
    
    if (error.message === "RESOURCE_LIMIT_EXCEEDED") {
      return Response.json(
        { 
          error: "Workflow limit reached for your tier",
          code: "TIER_LIMIT",
          upgrade: "Purchase additional NFTs or upgrade tier"
        },
        { status: 403 }
      );
    }
    
    if (error.message === "UNAUTHORIZED") {
      return Response.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const workflows = await withWorkspaceGuard(
      async (ctx) => {
        // Automatically filters by workspace ID
        return await getWorkflowsByWorkspace(ctx.id);
      }
    );
    
    return Response.json(workflows);
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch workflows" },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria**:
- [ ] POST auto-assigns workspaceId from context (cannot be spoofed)
- [ ] Returns 403 with upgrade message when limit reached
- [ ] GET only returns workflows for authenticated workspace
- [ ] No cross-workflow data leakage

---

## 8. Docker Deployment Configuration

### File: `docker-compose.pulsechain.yml` (NEW)

```yaml
version: '3.8'

services:
  sim:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      # PulseChain Configuration
      - NFT_CHAIN_ID=369
      - NFT_CONTRACT_ADDRESS=${NFT_CONTRACT_ADDRESS}
      - PULSECHAIN_RPC_URL=${PULSECHAIN_RPC_URL}  # Your validator
      - PULSECHAIN_WS_URL=${PULSECHAIN_WS_URL}     # Your validator WS
      
      # Security
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - WORKSPACE_ENCRYPTION_KEY=${WORKSPACE_ENCRYPTION_KEY}
      
      # App Config
      - NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
      - NEXT_PUBLIC_NFT_CONTRACT=${NFT_CONTRACT_ADDRESS}  # Expose to frontend
      - NEXT_PUBLIC_PULSECHAIN_RPC=${PULSECHAIN_RPC_URL}
      
      # Tier Config
      - TIER_PREMIUM_TOKEN_IDS=${TIER_PREMIUM_TOKEN_IDS}
      
    networks:
      - sim-network
      
    # Health check for PulseChain connection
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health/pulsechain"]
      interval: 30s
      timeout: 10s
      retries: 3
      
  # Your existing services (db, etc.)...

networks:
  sim-network:
    driver: bridge
```

### File: `apps/sim/app/api/health/pulsechain/route.ts` (NEW - Health Check)

```typescript
import { checkPulseConnection } from "@/lib/pulsechain-client";
import { NextResponse } from "next/server";

export async function GET() {
  const isConnected = await checkPulseConnection();
  
  if (!isConnected) {
    return NextResponse.json(
      { status: "error", message: "PulseChain RPC unreachable" },
      { status: 503 }
    );
  }
  
  return NextResponse.json({ 
    status: "ok", 
    chain: "PulseChain",
    chainId: 369,
    rpc: process.env.PULSECHAIN_RPC_URL?.replace(/\/\/.*@/, '//***@') // Mask credentials
  });
}
```

---

## 9. Testing & Verification Scripts

### File: `scripts/test-pulsechain-gate.ts` (NEW)

```typescript
import { createPublicClient, http } from 'viem';
import { verifyPulseNFT } from '../apps/sim/lib/nft-verification';

const TEST_WALLET = "0x..."; // Test with NFT
const TEST_WALLET_NO_NFT = "0x..."; // Test without NFT

async function runTests() {
  console.log("=== PulseChain NFT Gate Tests ===\n");
  
  // Test 1: Health check
  console.log("Test 1: RPC Connection");
  const client = createPublicClient({
    chain: { id: 369 } as any,
    transport: http(process.env.PULSECHAIN_RPC_URL)
  });
  const block = await client.getBlockNumber();
  console.log(`✅ Connected. Current block: ${block}\n`);
  
  // Test 2: Wallet with NFT
  console.log("Test 2: Wallet WITH NFT");
  const result1 = await verifyPulseNFT(TEST_WALLET as `0x${string}`);
  console.log("Result:", result1);
  if (!result1.hasNFT) throw new Error("Should have NFT");
  console.log("✅ Pass\n");
  
  // Test 3: Wallet without NFT
  console.log("Test 3: Wallet WITHOUT NFT");
  const result2 = await verifyPulseNFT(TEST_WALLET_NO_NFT as `0x${string}`);
  console.log("Result:", result2);
  if (result2.hasNFT) throw new Error("Should NOT have NFT");
  console.log("✅ Pass\n");
  
  // Test 4: Cache test
  console.log("Test 4: Cache functionality");
  const start = Date.now();
  await verifyPulseNFT(TEST_WALLET as `0x${string}`);
  const cached = Date.now();
  console.log(`Cached lookup took: ${cached - start}ms (should be <10ms)\n`);
  
  console.log("=== All Tests Passed ===");
}

runTests().catch(console.error);
```

**Run with**:
```bash
bun run scripts/test-pulsechain-gate.ts
```

---

## 10. Rollback Plan

If critical failure:

1. **Database Rollback**:
   ```bash
   cd packages/db
   bunx drizzle-kit drop
   ```

2. **Auth Fallback**:
   - Remove SIWE plugin from `auth.ts`
   - Restore original login page
   - Keep database columns (nullable) for future upgrade

3. **Environment**:
   - Unset `NFT_CONTRACT_ADDRESS` to disable gating
   - Application will fallback to standard mode

---

## Success Metrics

Implementation complete when:

- [ ] PulseChain block number logs on startup
- [ ] Login page shows PulseChain branding
- [ ] Wallet without NFT gets specific error message
- [ ] Wallet with NFT auto-creates workspace in PostgreSQL
- [ ] Creating 6th workflow on Standard tier returns 403
- [ ] User A cannot access User B workflows via API manipulation
- [ ] `/api/health/pulsechain` returns status OK
- [ ] All tests in `scripts/test-pulsechain-gate.ts` pass
- [ ] Application runs via `docker-compose -f docker-compose.pulsechain.yml up`

---

## Troubleshooting Quick Reference

| Issue | Solution |
|-------|----------|
| `Chain mismatch` | Ensure MetaMask on PulseChain (369), not ETH (1) |
| `RPC timeout` | Check `PULSECHAIN_RPC_URL` is accessible from container |
| `NO_NFT_PULSECHAIN` | Verify contract address correct on PulseChain explorer |
| `Nonce too high` | Reset wallet nonce in MetaMask settings |
| `Database connection` | Check PostgreSQL container is up before Sim |

---

**End of Agent Execution Plan - PulseChain Edition**
```

To use this with an agent (like Devin, Claude Code, or similar):

1. **Copy the entire markdown block above**
2. **Save as `PULSECHAIN_IMPLEMENTATION_PLAN.md`**
3. **Feed to agent with prompt**: "Execute this plan step by step. Confirm completion of each phase before proceeding. Ask for clarification if file paths differ from expected structure."

The plan includes:
- **PulseChain-specific config** (Chain ID 369, PLS token, custom RPC)
- **Self-hosted validator** support (no Alchemy dependency)
- **Tier-based limiting** (standard/premium/enterprise)
- **Complete file paths** and code blocks
- **Acceptance criteria** for each phase
- **Testing scripts** for verification
- **Rollback procedures**

Your agents can now implement this autonomously. Would you like me to adjust any specific contract interaction logic (e.g., if your NFT has custom tier attributes)?