# Kimi Agent Execution Plan: PulseChain NFT Gating Implementation

**Reference Plan**: `kimi-walletplan-revised.md`  
**Objective**: Implement PulseChain NFT-gated user authentication  
**Execution Mode**: Swarm (parallel agents) + Sequential validation  
**Repository**: `simstudioai/sim`

---

## Pre-Execution Setup (Human Required)

Before starting agents, ensure:

```bash
# 1. Environment variables set
export NFT_CONTRACT_ADDRESS=0xYourContractAddress
export PULSECHAIN_RPC_URL=http://your-validator:8545
export TIER_PREMIUM_TOKEN_IDS=1,2,3,4,5

# 2. Database is running
docker compose up db -d

# 3. Install dependencies
cd apps/sim && bun add viem@^2.0.0 @better-auth/siwe@latest
```

---

## Phase 1: Database Schema (Agent: `db-specialist`)

**Task ID**: `P1-DB-SCHEMA`  
**Agent Role**: Database schema specialist  
**Parallel**: Yes (can run with Phase 2)

### Instructions

1. **Read existing schema** at `packages/db/schema.ts` to understand current structure
2. **Add the following** to the existing schema file (don't create new file):

```typescript
// Add near other enum definitions
export const nftAccessStatusEnum = pgEnum('nft_access_status', [
  'pending',
  'verified',
  'expired',
  'revoked'
]);

export const nftTierEnum = pgEnum('nft_tier', [
  'none',
  'standard', 
  'premium',
  'enterprise'
]);

// Add at end of file before exports
export const userNftAccess = pgTable(
  'user_nft_access',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' })
      .unique(),
    walletAddress: text('wallet_address', { length: 42 }).notNull().unique(),
    tokenId: bigint('token_id', { mode: 'number' }),
    tier: nftTierEnum('tier').notNull().default('none'),
    status: nftAccessStatusEnum('status').notNull().default('pending'),
    metadata: jsonb('metadata').$type<{
      verifiedAt: string;
      lastCheckedAt: string;
      tokenUri?: string;
      verificationCount: number;
    }>().default({ verificationCount: 0 }),
    resourceLimits: jsonb('resource_limits').$type<{
      maxWorkflows: number;
      maxWorkspaces: number;
      maxApiCalls: number;
      maxStorageMB: number;
      maxAgents: number;
      maxSchedules: number;
      maxWebhooks: number;
    }>().default({
      maxWorkflows: 0,
      maxWorkspaces: 0,
      maxApiCalls: 0,
      maxStorageMB: 0,
      maxAgents: 0,
      maxSchedules: 0,
      maxWebhooks: 0
    }),
    currentUsage: jsonb('current_usage').$type<{
      apiCallsThisMonth: number;
      storageUsedMB: number;
      lastResetAt: string;
    }>().default({
      apiCallsThisMonth: 0,
      storageUsedMB: 0,
      lastResetAt: new Date().toISOString()
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('user_nft_user_idx').on(table.userId),
    walletIdx: index('user_nft_wallet_idx').on(table.walletAddress),
    tierIdx: index('user_nft_tier_idx').on(table.tier),
    statusIdx: index('user_nft_status_idx').on(table.status),
  })
);

export const userNftHistory = pgTable('user_nft_history', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  previousTokenId: bigint('previous_token_id', { mode: 'number' }),
  newTokenId: bigint('new_token_id', { mode: 'number' }),
  previousTier: nftTierEnum('previous_tier'),
  newTier: nftTierEnum('new_tier'),
  transactionHash: text('transaction_hash'),
  blockNumber: bigint('block_number', { mode: 'number' }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('nft_history_user_idx').on(table.userId),
  eventIdx: index('nft_history_event_idx').on(table.event),
}));
```

3. **Generate migration**:
```bash
cd packages/db
bunx drizzle-kit generate:pg --name add_pulsechain_user_nft_access
```

4. **Validation Steps** (STOP if any fail):
- [ ] Run `bunx drizzle-kit migrate` successfully
- [ ] Verify tables exist: `\dt` in psql should show `user_nft_access` and `user_nft_history`
- [ ] Check enums exist: `\dT` should show `nft_access_status` and `nft_tier`

**Output**: Migration file created and applied successfully.

---

## Phase 2: PulseChain Client (Agent: `blockchain-specialist`)

**Task ID**: `P2-CHAIN-CLIENT`  
**Agent Role**: Blockchain/Web3 integration specialist  
**Parallel**: Yes (can run with Phase 1)

### Instructions

1. **Create directory**: `apps/sim/lib/pulsechain/`
2. **Create file**: `apps/sim/lib/pulsechain/client.ts`

```typescript
import { createPublicClient, http, webSocket } from 'viem';
import { createLogger } from '@sim/logger';

const logger = createLogger('PulseChainClient');

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
      webSocket: process.env.PULSECHAIN_WS_URL ? [process.env.PULSECHAIN_WS_URL] : [],
    },
    public: {
      http: [process.env.PULSECHAIN_RPC_URL!],
      webSocket: process.env.PULSECHAIN_WS_URL ? [process.env.PULSECHAIN_WS_URL] : [],
    },
  },
  blockExplorers: {
    default: { name: 'PulseScan', url: 'https://scan.pulsechain.com' },
  },
};

export const publicClient = createPublicClient({
  chain: pulsechainConfig,
  transport: http(process.env.PULSECHAIN_RPC_URL, {
    retryCount: 3,
    retryDelay: 1000,
  }),
});

export async function checkPulseConnection(): Promise<boolean> {
  try {
    const blockNumber = await publicClient.getBlockNumber();
    logger.info('PulseChain connected', { blockNumber: blockNumber.toString() });
    return true;
  } catch (error) {
    logger.error('PulseChain RPC connection failed', { error });
    return false;
  }
}
```

3. **Create index file**: `apps/sim/lib/pulsechain/index.ts`
```typescript
export { publicClient, pulsechainConfig, checkPulseConnection } from './client';
export { verifyNFTOwnership, getTierLimits } from './nft-verification';
export type { NFTOwnershipResult } from './nft-verification';
```

4. **Validation Steps**:
- [ ] File compiles: `bun run type-check` passes
- [ ] Health check works: Create test script that calls `checkPulseConnection()`

**Output**: PulseChain client module ready for use.

---

## Phase 3: NFT Verification Service (Agent: `smart-contract-specialist`)

**Task ID**: `P3-NFT-VERIFY`  
**Agent Role**: Smart contract integration specialist  
**Depends On**: `P2-CHAIN-CLIENT`

### Instructions

1. **Create file**: `apps/sim/lib/pulsechain/nft-verification.ts`

```typescript
import { getContract, parseAbi, Address } from 'viem';
import { publicClient } from './client';
import { createLogger } from '@sim/logger';

const logger = createLogger('NFTVerification');

const erc721Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function getTokenTier(uint256 tokenId) view returns (uint8)',
]);

export interface NFTOwnershipResult {
  hasNFT: boolean;
  tokenId?: number;
  tier: 'none' | 'standard' | 'premium' | 'enterprise';
  balance: bigint;
  isOwner: boolean;
  metadata?: { uri?: string };
}

function getTierFromTokenId(tokenId: number): 'standard' | 'premium' | 'enterprise' {
  const premiumIds = process.env.TIER_PREMIUM_TOKEN_IDS?.split(',').map(Number) || [];
  const enterpriseIds = process.env.TIER_ENTERPRISE_TOKEN_IDS?.split(',').map(Number) || [];
  
  if (enterpriseIds.includes(tokenId)) return 'enterprise';
  if (premiumIds.includes(tokenId)) return 'premium';
  return 'standard';
}

export function getTierLimits(tier: string) {
  const limits = {
    enterprise: {
      maxWorkflows: 100,
      maxWorkspaces: 10,
      maxApiCalls: 100000,
      maxStorageMB: 10000,
      maxAgents: 20,
      maxSchedules: 50,
      maxWebhooks: 25,
    },
    premium: {
      maxWorkflows: 50,
      maxWorkspaces: 5,
      maxApiCalls: 10000,
      maxStorageMB: 1000,
      maxAgents: 10,
      maxSchedules: 20,
      maxWebhooks: 10,
    },
    standard: {
      maxWorkflows: 10,
      maxWorkspaces: 2,
      maxApiCalls: 1000,
      maxStorageMB: 100,
      maxAgents: 3,
      maxSchedules: 5,
      maxWebhooks: 3,
    },
    none: {
      maxWorkflows: 0,
      maxWorkspaces: 0,
      maxApiCalls: 0,
      maxStorageMB: 0,
      maxAgents: 0,
      maxSchedules: 0,
      maxWebhooks: 0,
    },
  };
  
  return limits[tier as keyof typeof limits] || limits.none;
}

export async function verifyNFTOwnership(
  walletAddress: Address
): Promise<NFTOwnershipResult> {
  try {
    const contract = getContract({
      address: process.env.NFT_CONTRACT_ADDRESS as Address,
      abi: erc721Abi,
      client: publicClient,
    });

    const balance = await contract.read.balanceOf([walletAddress]);
    
    if (balance === 0n) {
      return { hasNFT: false, tier: 'none', balance: 0n, isOwner: false };
    }

    let tokenId: number | undefined;
    try {
      const tokenIdBigInt = await contract.read.tokenOfOwnerByIndex([walletAddress, 0n]);
      tokenId = Number(tokenIdBigInt);
    } catch (error) {
      logger.warn('tokenOfOwnerByIndex not supported, trying fallback', { walletAddress });
      try {
        const owner = await contract.read.ownerOf([1n]);
        if (owner.toLowerCase() === walletAddress.toLowerCase()) {
          tokenId = 1;
        }
      } catch {
        // Token not owned
      }
    }

    if (!tokenId) {
      return { hasNFT: false, tier: 'none', balance, isOwner: false };
    }

    const owner = await contract.read.ownerOf([BigInt(tokenId)]);
    const isOwner = owner.toLowerCase() === walletAddress.toLowerCase();

    if (!isOwner) {
      return { hasNFT: false, tier: 'none', balance, isOwner: false };
    }

    const tier = getTierFromTokenId(tokenId);
    let uri: string | undefined;
    try {
      uri = await contract.read.tokenURI([BigInt(tokenId)]);
    } catch {
      // URI not available
    }

    return {
      hasNFT: true,
      tokenId,
      tier,
      balance,
      isOwner: true,
      metadata: { uri },
    };

  } catch (error) {
    logger.error('NFT verification failed', { error, walletAddress });
    throw new Error('VERIFICATION_FAILED');
  }
}

export async function reverifyNFTOwnership(
  walletAddress: Address,
  expectedTokenId: number
): Promise<boolean> {
  try {
    const result = await verifyNFTOwnership(walletAddress);
    return result.hasNFT && result.tokenId === expectedTokenId && result.isOwner;
  } catch {
    return false;
  }
}
```

2. **Validation Steps**:
- [ ] TypeScript compiles without errors
- [ ] Unit test: Mock RPC call returns expected result
- [ ] Integration test: Call with real test wallet

**Output**: NFT verification service functional.

---

## Phase 4: Better Auth Integration (Agent: `auth-specialist`)

**Task ID**: `P4-AUTH-INTEGRATION`  
**Agent Role**: Authentication/authorization specialist  
**Depends On**: `P1-DB-SCHEMA`, `P3-NFT-VERIFY`

### Instructions

1. **Create/modify**: `apps/sim/lib/auth.ts`

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { siwe } from "@better-auth/siwe";
import { db } from "@sim/db";
import { user, userNftAccess, userNftHistory } from "@sim/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { verifyNFTOwnership, getTierLimits } from "./pulsechain/nft-verification";
import { createLogger } from "@sim/logger";

const logger = createLogger('Auth');

const domain = process.env.NEXT_PUBLIC_APP_URL 
  ? new URL(process.env.NEXT_PUBLIC_APP_URL).host 
  : "localhost:3000";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET,
  
  plugins: [
    siwe({
      domain,
      statement: "Sign in to Sim Studio on PulseChain. NFT ownership required for access.",
      
      async verifyMessage({ message, signature, address }) {
        logger.info(`Verifying SIWE for ${address}`);
        
        const nftResult = await verifyNFTOwnership(address as `0x${string}`);
        
        if (!nftResult.hasNFT || !nftResult.isOwner) {
          logger.warn(`Access denied: ${address} does not hold required NFT`);
          
          const error = new Error("NFT_OWNERSHIP_REQUIRED");
          (error as any).code = "NO_NFT_PULSECHAIN";
          (error as any).details = {
            contract: process.env.NFT_CONTRACT_ADDRESS,
            chain: "PulseChain (369)",
            chainId: 369,
            address,
          };
          throw error;
        }

        logger.info(`NFT verified for ${address}`, { 
          tier: nftResult.tier, 
          tokenId: nftResult.tokenId 
        });
        
        return true;
      },
      
      chainId: 369,
    })
  ],
  
  callbacks: {
    async signIn(user, account, profile) {
      try {
        const walletAddress = user.id;
        
        if (!walletAddress?.startsWith('0x')) {
          logger.error('Invalid wallet address', { user });
          return false;
        }
        
        const nftResult = await verifyNFTOwnership(walletAddress as `0x${string}`);
        
        if (!nftResult.hasNFT) {
          logger.warn('NFT no longer held', { walletAddress });
          return false;
        }
        
        const existingAccess = await db.query.userNftAccess.findFirst({
          where: eq(userNftAccess.walletAddress, walletAddress),
        });
        
        if (existingAccess) {
          await db.update(userNftAccess)
            .set({
              tokenId: nftResult.tokenId,
              tier: nftResult.tier,
              status: 'verified',
              metadata: {
                verifiedAt: new Date().toISOString(),
                lastCheckedAt: new Date().toISOString(),
                tokenUri: nftResult.metadata?.uri,
                verificationCount: (existingAccess.metadata?.verificationCount || 0) + 1,
              },
              resourceLimits: getTierLimits(nftResult.tier),
              updatedAt: new Date(),
            })
            .where(eq(userNftAccess.id, existingAccess.id));
          
          if (existingAccess.tier !== nftResult.tier) {
            await db.insert(userNftHistory).values({
              id: nanoid(),
              userId: existingAccess.userId,
              event: 'tier_changed',
              previousTier: existingAccess.tier,
              newTier: nftResult.tier,
              newTokenId: nftResult.tokenId,
              createdAt: new Date(),
            });
          }
          
          logger.info(`Updated NFT access`, { userId: existingAccess.userId });
        } else {
          const dbUser = await db.query.user.findFirst({
            where: eq(user.id, walletAddress),
          });
          
          if (!dbUser) {
            logger.error('User record not found');
            return false;
          }
          
          await db.insert(userNftAccess).values({
            id: nanoid(),
            userId: dbUser.id,
            walletAddress: walletAddress,
            tokenId: nftResult.tokenId,
            tier: nftResult.tier,
            status: 'verified',
            metadata: {
              verifiedAt: new Date().toISOString(),
              lastCheckedAt: new Date().toISOString(),
              tokenUri: nftResult.metadata?.uri,
              verificationCount: 1,
            },
            resourceLimits: getTierLimits(nftResult.tier),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          
          await db.insert(userNftHistory).values({
            id: nanoid(),
            userId: dbUser.id,
            event: 'verified',
            newTokenId: nftResult.tokenId,
            newTier: nftResult.tier,
            createdAt: new Date(),
          });
          
          logger.info(`Created NFT access`, { userId: dbUser.id });
        }
        
        return true;
        
      } catch (error) {
        logger.error('SignIn callback failed', { error });
        return false;
      }
    },
    
    async redirect(url, baseUrl) {
      return `${baseUrl}/dashboard`;
    }
  },
  
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
});
```

2. **Validation Steps**:
- [ ] Auth configuration loads without errors
- [ ] Test sign-in with NFT holder creates userNftAccess record
- [ ] Test sign-in without NFT returns proper error code

**Output**: Authentication with NFT gating functional.

---

## Phase 5: User Context Service (Agent: `backend-specialist`)

**Task ID**: `P5-USER-CONTEXT`  
**Agent Role**: Backend API specialist  
**Depends On**: `P4-AUTH-INTEGRATION`

### Instructions

1. **Create file**: `apps/sim/lib/user-context.ts`

```typescript
import { db } from "@sim/db";
import { userNftAccess } from "@sim/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "./auth";

export interface UserContext {
  userId: string;
  walletAddress: string;
  tier: 'none' | 'standard' | 'premium' | 'enterprise';
  status: 'pending' | 'verified' | 'expired' | 'revoked';
  limits: {
    maxWorkflows: number;
    maxWorkspaces: number;
    maxApiCalls: number;
    maxStorageMB: number;
    maxAgents: number;
    maxSchedules: number;
    maxWebhooks: number;
  };
  usage: {
    apiCallsThisMonth: number;
    storageUsedMB: number;
  };
  tokenId?: number;
}

export async function getCurrentUserContext(): Promise<UserContext> {
  const session = await auth();
  
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  
  const userId = session.user.id;
  
  const nftAccess = await db.query.userNftAccess.findFirst({
    where: eq(userNftAccess.userId, userId),
  });
  
  if (!nftAccess) {
    throw new Error("NFT_ACCESS_NOT_FOUND");
  }
  
  if (nftAccess.status !== 'verified') {
    throw new Error(`NFT_STATUS_${nftAccess.status.toUpperCase()}`);
  }
  
  return {
    userId,
    walletAddress: nftAccess.walletAddress,
    tier: nftAccess.tier as UserContext['tier'],
    status: nftAccess.status as UserContext['status'],
    limits: nftAccess.resourceLimits as UserContext['limits'],
    usage: nftAccess.currentUsage as UserContext['usage'],
    tokenId: nftAccess.tokenId || undefined,
  };
}

export function hasRequiredTier(
  userTier: string, 
  requiredTier: 'standard' | 'premium' | 'enterprise'
): boolean {
  const tiers = ['none', 'standard', 'premium', 'enterprise'];
  return tiers.indexOf(userTier) >= tiers.indexOf(requiredTier);
}

export async function withUserGuard<T>(
  operation: (ctx: UserContext) => Promise<T>,
  options?: {
    requireTier?: ('standard' | 'premium' | 'enterprise')[];
    checkResource?: keyof UserContext['limits'];
    incrementUsage?: keyof UserContext['usage'];
  }
): Promise<T> {
  const ctx = await getCurrentUserContext();
  
  if (options?.requireTier) {
    const hasTier = options.requireTier.some(tier => 
      hasRequiredTier(ctx.tier, tier)
    );
    if (!hasTier) {
      throw new Error("INSUFFICIENT_TIER");
    }
  }
  
  if (options?.checkResource) {
    const limit = ctx.limits[options.checkResource];
    const current = await getResourceUsage(ctx.userId, options.checkResource);
    
    if (current >= limit) {
      throw new Error("RESOURCE_LIMIT_EXCEEDED");
    }
  }
  
  return operation(ctx);
}

async function getResourceUsage(
  userId: string, 
  resource: keyof UserContext['limits']
): Promise<number> {
  // Implement based on actual Sim Studio schema
  // This is a placeholder - query actual counts from database
  return 0;
}
```

2. **Validation Steps**:
- [ ] `getCurrentUserContext()` returns proper context for authenticated user
- [ ] Throws correct errors for unauthenticated/unverified users
- [ ] TypeScript types are correctly exported

**Output**: User context service ready for API routes.

---

## Phase 6: Frontend Login Component (Agent: `frontend-specialist`)

**Task ID**: `P6-FRONTEND-LOGIN`  
**Agent Role**: React/Next.js frontend specialist  
**Depends On**: `P4-AUTH-INTEGRATION`

### Instructions

1. **Create directory**: `apps/sim/components/auth/`
2. **Create file**: `apps/sim/components/auth/pulsechain-login.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthClient } from "better-auth/client";
import { siweClient } from "@better-auth/siwe/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

const authClient = createAuthClient({
  plugins: [siweClient()]
});

export function PulseChainLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.signIn.social({
        provider: "siwe",
        callbackURL: "/dashboard",
      });

      if (result.error) {
        handleAuthError(result.error);
        return;
      }

    } catch (err: any) {
      setError("Connection failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthError = (error: any) => {
    console.error("Auth error:", error);
    
    if (error.code === "NO_NFT_PULSECHAIN") {
      setError(
        `Access Denied: Your wallet does not hold the required NFT on PulseChain. ` +
        `Contract: ${process.env.NEXT_PUBLIC_NFT_CONTRACT?.slice(0, 10)}...`
      );
    } else if (error.code === 4001) {
      setError("You rejected the signature request.");
    } else {
      setError(error.message || "Authentication failed");
    }
  };

  return (
    <div className="space-y-4 w-full max-w-md">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Sim Studio</h1>
        <p className="text-muted-foreground">
          NFT-Gated Access on PulseChain
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleLogin}
        disabled={isLoading}
        className="w-full h-12"
        size="lg"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verifying NFT...
          </>
        ) : (
          <>
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 12l10 10 10-10L12 2z"/>
            </svg>
            Connect PulseChain Wallet
          </>
        )}
      </Button>

      <div className="text-center text-xs text-muted-foreground space-y-1">
        <p>Requires MetaMask on PulseChain (Chain ID: 369)</p>
        <p>NFT: {process.env.NEXT_PUBLIC_NFT_CONTRACT?.slice(0, 16)}...</p>
      </div>
    </div>
  );
}
```

3. **Modify login page**: `apps/sim/app/(auth)/login/page.tsx` (or create if doesn't exist)

```tsx
import { PulseChainLogin } from "@/components/auth/pulsechain-login";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-8">
        <PulseChainLogin />
      </div>
    </div>
  );
}
```

4. **Validation Steps**:
- [ ] Login page renders without errors
- [ ] Button shows loading state
- [ ] Error messages display correctly
- [ ] Successful login redirects to dashboard

**Output**: Frontend login component functional.

---

## Phase 7: Health Check API (Agent: `backend-specialist`)

**Task ID**: `P7-HEALTH-CHECK`  
**Agent Role**: Backend API specialist  
**Depends On**: `P2-CHAIN-CLIENT`

### Instructions

1. **Create file**: `apps/sim/app/api/health/pulsechain/route.ts`

```typescript
import { checkPulseConnection } from "@/lib/pulsechain/client";
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
    rpc: process.env.PULSECHAIN_RPC_URL?.replace(/\/\/.*@/, '//***@')
  });
}
```

2. **Validation Steps**:
- [ ] GET `/api/health/pulsechain` returns 200 when RPC connected
- [ ] Returns 503 when RPC unavailable
- [ ] RPC URL is masked in response

**Output**: Health check endpoint ready.

---

## Phase 8: Integration Testing (Agent: `qa-specialist`)

**Task ID**: `P8-INTEGRATION-TEST`  
**Agent Role**: QA/Testing specialist  
**Depends On**: ALL previous phases

### Instructions

1. **Create test script**: `scripts/test-pulsechain-integration.ts`

```typescript
#!/usr/bin/env bun
import { verifyNFTOwnership, getTierLimits } from '../apps/sim/lib/pulsechain/nft-verification';
import { db } from '@sim/db';
import { userNftAccess } from '@sim/db/schema';
import { eq } from 'drizzle-orm';

const TEST_CONFIG = {
  WITH_NFT: process.env.TEST_WALLET_WITH_NFT || "0x...",
  WITHOUT_NFT: process.env.TEST_WALLET_WITHOUT_NFT || "0x...",
};

async function runTests() {
  console.log("=== PulseChain NFT Integration Tests ===\n");
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: RPC Connection
  try {
    console.log("Test 1: RPC Connection");
    const { publicClient } = await import('../apps/sim/lib/pulsechain/client');
    const block = await publicClient.getBlockNumber();
    console.log(`✅ PASS - Block: ${block}\n`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL - ${error}\n`);
    failed++;
  }
  
  // Test 2: NFT Verification (holder)
  try {
    console.log("Test 2: NFT Verification (holder)");
    const result = await verifyNFTOwnership(TEST_CONFIG.WITH_NFT as `0x${string}`);
    if (!result.hasNFT) throw new Error("Should have NFT");
    if (!result.isOwner) throw new Error("Should be owner");
    console.log(`✅ PASS - Tier: ${result.tier}, Token: ${result.tokenId}\n`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL - ${error}\n`);
    failed++;
  }
  
  // Test 3: NFT Verification (non-holder)
  try {
    console.log("Test 3: NFT Verification (non-holder)");
    const result = await verifyNFTOwnership(TEST_CONFIG.WITHOUT_NFT as `0x${string}`);
    if (result.hasNFT) throw new Error("Should NOT have NFT");
    console.log(`✅ PASS - Correctly denied\n`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL - ${error}\n`);
    failed++;
  }
  
  // Test 4: Tier Limits
  try {
    console.log("Test 4: Tier Limits");
    const standard = getTierLimits('standard');
    const premium = getTierLimits('premium');
    const enterprise = getTierLimits('enterprise');
    
    if (standard.maxWorkflows >= premium.maxWorkflows) throw new Error("Standard should have fewer workflows");
    if (premium.maxWorkflows >= enterprise.maxWorkflows) throw new Error("Premium should have fewer workflows");
    
    console.log(`✅ PASS - Limits: Standard(${standard.maxWorkflows}) < Premium(${premium.maxWorkflows}) < Enterprise(${enterprise.maxWorkflows})\n`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL - ${error}\n`);
    failed++;
  }
  
  // Test 5: Database Schema
  try {
    console.log("Test 5: Database Schema");
    const result = await db.execute('SELECT * FROM user_nft_access LIMIT 1');
    console.log(`✅ PASS - user_nft_access table exists\n`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL - ${error}\n`);
    failed++;
  }
  
  // Summary
  console.log("=== Test Summary ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
```

2. **Run tests**:
```bash
bun run scripts/test-pulsechain-integration.ts
```

3. **Validation Steps**:
- [ ] All 5 tests pass
- [ ] Database connectivity confirmed
- [ ] NFT verification working with real contract

**Output**: Integration test suite validating full implementation.

---

## Swarm Execution Strategy

### Parallel Groups

```
Phase 1 (DB Schema) ──┐
                      ├─> Phase 4 (Auth) ──> Phase 5 (Context) ──> Phase 8 (Test)
Phase 2 (Chain Client)┤
                      ├─> Phase 3 (NFT Verify) ──┘
Phase 6 (Frontend) ───┘
                       
Phase 7 (Health) ──────(can run anytime after Phase 2)
```

### Agent Assignment

| Phase | Agent Name | Specialty |
|-------|-----------|-----------|
| P1 | `db-specialist` | PostgreSQL, Drizzle ORM |
| P2 | `blockchain-specialist` | Viem, RPC clients |
| P3 | `smart-contract-specialist` | ERC721, ABI interactions |
| P4 | `auth-specialist` | Better Auth, SIWE |
| P5 | `backend-specialist` | API routes, middleware |
| P6 | `frontend-specialist` | React, Next.js, Tailwind |
| P7 | `backend-specialist` | Health checks |
| P8 | `qa-specialist` | Testing, validation |

### Checkpoint Requirements

Before proceeding to dependent phases, verify:

**After P1 & P2**:
```bash
cd packages/db
bunx drizzle-kit migrate  # Must succeed
```

**After P3**:
```bash
bun run scripts/test-nft-verification.ts  # Must pass
```

**After P4**:
```bash
# Manual test: Attempt login with and without NFT
# Check database for userNftAccess record creation
```

**After ALL**:
```bash
bun run scripts/test-pulsechain-integration.ts  # All tests pass
```

---

## Environment Variables Reference

Create `.env.local` in `apps/sim/`:

```bash
# Required
NFT_CONTRACT_ADDRESS=0x...
PULSECHAIN_RPC_URL=http://your-validator:8545
BETTER_AUTH_SECRET=your-secret-here
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional
PULSECHAIN_WS_URL=ws://your-validator:8546
TIER_PREMIUM_TOKEN_IDS=1,2,3,4,5
TIER_ENTERPRISE_TOKEN_IDS=6,7,8,9,10
NEXT_PUBLIC_NFT_CONTRACT=0x...  # Same as NFT_CONTRACT_ADDRESS
```

---

## Rollback Procedures

If critical failure:

1. **Database**:
```bash
cd packages/db
bunx drizzle-kit drop
```

2. **Code**:
```bash
# Revert to main branch
git checkout main
git branch -D feat/pulsechain-nft-gating
```

3. **Environment**:
```bash
# Remove NFT gating env vars
unset NFT_CONTRACT_ADDRESS
unset PULSECHAIN_RPC_URL
```

---

## Success Criteria

Implementation complete when:

- [ ] `bunx drizzle-kit migrate` succeeds
- [ ] `/api/health/pulsechain` returns OK
- [ ] User with NFT can sign in and access dashboard
- [ ] User without NFT gets `NO_NFT_PULSECHAIN` error
- [ ] `userNftAccess` record created on first login
- [ ] All integration tests pass
- [ ] Existing Sim Studio functionality preserved

---

**End of Agent Execution Plan**
