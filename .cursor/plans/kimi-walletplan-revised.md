Here's the **revised plan** that gates **user creation** instead, preserving Sim Studio's existing workspace architecture:

---

```markdown
# Agent Execution Plan: PulseChain NFT-Gated User Access (Revised)

**Target Repository**: `https://github.com/simstudioai/sim`  
**Branch**: `feat/pulsechain-nft-gating`  
**Chain**: PulseChain (369)  
**Gating Level**: User Registration/Authentication  
**Architecture**: Preserve existing workspace multi-tenancy

---

## 0. Pre-Flight Configuration

### Environment Variables
```bash
# PulseChain Configuration
NFT_CHAIN_ID=369
NFT_CONTRACT_ADDRESS=0xYourPulseChainContractAddress
PULSECHAIN_RPC_URL=http://your-validator-ip:8545
PULSECHAIN_WS_URL=ws://your-validator-ip:8546

# Tier Configuration
TIER_PREMIUM_TOKEN_IDS=1,2,3,4,5
TIER_ENTERPRISE_TOKEN_IDS=6,7,8,9,10
```

### Dependencies
```bash
# Root level
bun add viem@^2.0.0

# App level
cd apps/sim
bun add @better-auth/siwe@latest
```

---

## 1. Database Schema: Extend User Model

### File: `packages/db/schema.ts` (MODIFY - Add to existing schema)

Add these tables to the **existing schema file** (don't create new file):

```typescript
// ==================== PULSECHAIN NFT USER EXTENSIONS ====================

export const nftAccessStatusEnum = pgEnum('nft_access_status', [
  'pending',      // User created but NFT not yet verified
  'verified',     // NFT ownership confirmed
  'expired',      // NFT no longer owned (sold/transferred)
  'revoked'       // Manual revocation
]);

export const nftTierEnum = pgEnum('nft_tier', [
  'none',
  'standard', 
  'premium',
  'enterprise'
]);

/**
 * NFT ownership records linked to Better Auth users
 * One-to-one with user table - each wallet = one user account
 */
export const userNftAccess = pgTable(
  'user_nft_access',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' })
      .unique(), // One NFT record per user
    
    // Wallet that owns the NFT (may differ from user.email)
    walletAddress: text('wallet_address', { length: 42 }).notNull().unique(),
    
    // NFT Details
    tokenId: bigint('token_id', { mode: 'number' }),
    tier: nftTierEnum('tier').notNull().default('none'),
    status: nftAccessStatusEnum('status').notNull().default('pending'),
    
    // Verification tracking
    metadata: jsonb('metadata').$type<{
      verifiedAt: string;
      lastCheckedAt: string;
      tokenUri?: string;
      transactionHash?: string;
      verificationCount: number;
    }>().default({
      verificationCount: 0
    }),
    
    // Resource limits based on tier (applies across all user's workspaces)
    resourceLimits: jsonb('resource_limits').$type<{
      maxWorkflows: number;      // Total across all workspaces
      maxWorkspaces: number;     // Number of workspaces allowed
      maxApiCalls: number;       // Monthly API call limit
      maxStorageMB: number;      // Total storage across workspaces
      maxAgents: number;         // Concurrent agent blocks
      maxSchedules: number;      // Scheduled workflow limit
      maxWebhooks: number;       // Webhook endpoints
    }>().default({
      maxWorkflows: 0,
      maxWorkspaces: 0,
      maxApiCalls: 0,
      maxStorageMB: 0,
      maxAgents: 0,
      maxSchedules: 0,
      maxWebhooks: 0
    }),
    
    // Usage tracking (reset monthly via cron)
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
    expiresAt: timestamp('expires_at'), // For time-limited access
  },
  (table) => ({
    userIdx: index('user_nft_user_idx').on(table.userId),
    walletIdx: index('user_nft_wallet_idx').on(table.walletAddress),
    tierIdx: index('user_nft_tier_idx').on(table.tier),
    statusIdx: index('user_nft_status_idx').on(table.status),
  })
);

/**
 * NFT ownership history for audit trail
 */
export const userNftHistory = pgTable('user_nft_history', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  
  event: text('event').notNull(), // 'verified', 'transferred_away', 'tier_changed', 'revoked'
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

// ==================== END PULSECHAIN EXTENSIONS ====================
```

### Migration Commands
```bash
cd packages/db
bunx drizzle-kit generate:pg --name add_pulsechain_user_nft_access
bunx drizzle-kit migrate
```

**Acceptance Criteria**:
- [ ] `userNftAccess` table created with FK to `user.id`
- [ ] `walletAddress` is UNIQUE (one wallet = one user)
- [ ] `userNftHistory` tracks all ownership changes
- [ ] Enums created for `nft_access_status` and `nft_tier`
- [ ] Existing users without NFT have status 'pending' or no record

---

## 2. PulseChain Client Setup (Unchanged)

### File: `apps/sim/lib/pulsechain/client.ts` (NEW)

```typescript
import { createPublicClient, http, webSocket } from 'viem';
import { pulsechain } from 'viem/chains';
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

// Public client for read operations
export const publicClient = createPublicClient({
  chain: pulsechainConfig,
  transport: http(process.env.PULSECHAIN_RPC_URL, {
    retryCount: 3,
    retryDelay: 1000,
  }),
});

// Health check
export async function checkPulseConnection(): Promise<boolean> {
  try {
    const blockNumber = await publicClient.getBlockNumber();
    logger.info(`PulseChain connected`, { blockNumber: blockNumber.toString() });
    return true;
  } catch (error) {
    logger.error('PulseChain RPC connection failed', { error });
    return false;
  }
}
```

---

## 3. NFT Verification Service

### File: `apps/sim/lib/pulsechain/nft-verification.ts` (NEW)

```typescript
import { getContract, parseAbi, Address } from 'viem';
import { publicClient } from './client';
import { createLogger } from '@sim/logger';

const logger = createLogger('NFTVerification');

// Standard ERC721 ABI
const erc721Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  // Optional tier function
  'function getTokenTier(uint256 tokenId) view returns (uint8)',
]);

export interface NFTOwnershipResult {
  hasNFT: boolean;
  tokenId?: number;
  tier: 'none' | 'standard' | 'premium' | 'enterprise';
  balance: bigint;
  isOwner: boolean; // Verifies wallet actually owns the token
  metadata?: {
    uri?: string;
  };
}

// Tier configuration from environment
function getTierFromTokenId(tokenId: number): 'standard' | 'premium' | 'enterprise' {
  const premiumIds = process.env.TIER_PREMIUM_TOKEN_IDS?.split(',').map(Number) || [];
  const enterpriseIds = process.env.TIER_ENTERPRISE_TOKEN_IDS?.split(',').map(Number) || [];
  
  if (enterpriseIds.includes(tokenId)) return 'enterprise';
  if (premiumIds.includes(tokenId)) return 'premium';
  return 'standard';
}

// Get resource limits based on tier
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

/**
 * Verify NFT ownership on PulseChain
 * This is the critical gating function - called during auth
 */
export async function verifyNFTOwnership(
  walletAddress: Address
): Promise<NFTOwnershipResult> {
  try {
    const contract = getContract({
      address: process.env.NFT_CONTRACT_ADDRESS as Address,
      abi: erc721Abi,
      client: publicClient,
    });

    // Get balance
    const balance = await contract.read.balanceOf([walletAddress]);
    
    if (balance === 0n) {
      return {
        hasNFT: false,
        tier: 'none',
        balance: 0n,
        isOwner: false,
      };
    }

    // Find the first owned token ID
    let tokenId: number | undefined;
    try {
      // Try to get token at index 0
      const tokenIdBigInt = await contract.read.tokenOfOwnerByIndex([walletAddress, 0n]);
      tokenId = Number(tokenIdBigInt);
    } catch (error) {
      // Fallback: contract might not support enumeration
      // In this case, we'd need the user to specify which token they own
      // For now, use token ID 1 as placeholder (should be improved)
      logger.warn('Contract does not support tokenOfOwnerByIndex, using fallback');
      try {
        const owner = await contract.read.ownerOf([1n]);
        if (owner.toLowerCase() === walletAddress.toLowerCase()) {
          tokenId = 1;
        }
      } catch {
        // Token 1 not owned by this address
      }
    }

    if (!tokenId) {
      return {
        hasNFT: false,
        tier: 'none',
        balance,
        isOwner: false,
      };
    }

    // Verify ownership (double-check)
    const owner = await contract.read.ownerOf([BigInt(tokenId)]);
    const isOwner = owner.toLowerCase() === walletAddress.toLowerCase();

    if (!isOwner) {
      logger.warn('Ownership mismatch', { walletAddress, tokenId, actualOwner: owner });
      return {
        hasNFT: false,
        tier: 'none',
        balance,
        isOwner: false,
      };
    }

    // Determine tier
    const tier = getTierFromTokenId(tokenId);

    // Get token URI if available
    let uri: string | undefined;
    try {
      uri = await contract.read.tokenURI([BigInt(tokenId)]);
    } catch {
      // Token URI not available
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

/**
 * Re-verify NFT ownership (for periodic checks)
 */
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

---

## 4. Better Auth + SIWE with NFT Gating

### File: `apps/sim/lib/auth.ts` (MODIFY/CREATE)

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
      
      /**
       * CRITICAL: This is where NFT gating happens
       * Called during sign-in/sign-up to verify NFT ownership
       */
      async verifyMessage({ message, signature, address }) {
        logger.info(`Verifying SIWE for ${address}`);
        
        // Verify NFT ownership on PulseChain
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
            hasNFT: nftResult.hasNFT,
          };
          throw error;
        }

        logger.info(`NFT verified for ${address}`, { 
          tier: nftResult.tier, 
          tokenId: nftResult.tokenId 
        });
        
        // Store NFT data in context for signIn callback
        // Using a WeakMap or closure would be safer than global
        return true;
      },
      
      // Enforce PulseChain
      chainId: 369,
    })
  ],
  
  /**
   * Called after successful authentication
   * Creates or updates user with NFT access record
   */
  callbacks: {
    async signIn(user, account, profile) {
      try {
        // In SIWE, the user ID is the wallet address
        const walletAddress = user.id; // Better Auth uses this as user.id for SIWE
        
        if (!walletAddress || !walletAddress.startsWith('0x')) {
          logger.error('Invalid wallet address from SIWE', { user });
          return false;
        }
        
        // Re-verify NFT (defense in depth)
        const nftResult = await verifyNFTOwnership(walletAddress as `0x${string}`);
        
        if (!nftResult.hasNFT) {
          logger.warn('NFT no longer held during signIn callback', { walletAddress });
          return false;
        }
        
        // Check if userNftAccess record exists
        const existingAccess = await db.query.userNftAccess.findFirst({
          where: eq(userNftAccess.walletAddress, walletAddress),
        });
        
        if (existingAccess) {
          // Update existing record
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
          
          // Log tier change if applicable
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
          
          logger.info(`Updated NFT access for existing user`, { 
            userId: existingAccess.userId,
            tier: nftResult.tier 
          });
        } else {
          // New NFT holder - create userNftAccess record
          // Note: Better Auth already created the user record
          const dbUser = await db.query.user.findFirst({
            where: eq(user.id, walletAddress),
          });
          
          if (!dbUser) {
            logger.error('User record not found after SIWE sign-in');
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
          
          logger.info(`Created NFT access for new user`, { 
            userId: dbUser.id,
            tier: nftResult.tier 
          });
        }
        
        return true;
        
      } catch (error) {
        logger.error('SignIn callback failed', { error });
        return false;
      }
    },
    
    /**
     * Redirect based on NFT status
     */
    async redirect(url, baseUrl) {
      // If user doesn't have NFT, they won't get here (blocked in verifyMessage)
      // But we can add additional checks
      return `${baseUrl}/dashboard`;
    }
  },
  
  /**
   * Session configuration
   */
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session daily
  },
});
```

---

## 5. User Context & Resource Limits

### File: `apps/sim/lib/user-context.ts` (NEW)

```typescript
import { db } from "@sim/db";
import { userNftAccess, user } from "@sim/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
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

/**
 * Get current user's NFT-gated context
 */
export async function getCurrentUserContext(): Promise<UserContext> {
  const session = await auth();
  
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  
  const userId = session.user.id;
  
  // Get NFT access record
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

/**
 * Check if user has sufficient tier
 */
export function hasRequiredTier(
  userTier: string, 
  requiredTier: 'standard' | 'premium' | 'enterprise'
): boolean {
  const tiers = ['none', 'standard', 'premium', 'enterprise'];
  return tiers.indexOf(userTier) >= tiers.indexOf(requiredTier);
}

/**
 * Guard function for API routes with resource checks
 */
export async function withUserGuard<T>(
  operation: (ctx: UserContext) => Promise<T>,
  options?: {
    requireTier?: ('standard' | 'premium' | 'enterprise')[];
    checkResource?: keyof UserContext['limits'];
    incrementUsage?: keyof UserContext['usage'];
  }
): Promise<T> {
  const ctx = await getCurrentUserContext();
  
  // Tier check
  if (options?.requireTier) {
    const hasTier = options.requireTier.some(tier => 
      hasRequiredTier(ctx.tier, tier)
    );
    if (!hasTier) {
      throw new Error("INSUFFICIENT_TIER");
    }
  }
  
  // Resource limit check
  if (options?.checkResource) {
    const limit = ctx.limits[options.checkResource];
    const current = await getResourceUsage(ctx.userId, options.checkResource);
    
    if (current >= limit) {
      throw new Error("RESOURCE_LIMIT_EXCEEDED");
    }
  }
  
  const result = await operation(ctx);
  
  // Increment usage if specified
  if (options?.incrementUsage) {
    await incrementUsage(ctx.userId, options.incrementUsage);
  }
  
  return result;
}

// Helper functions for resource tracking
async function getResourceUsage(
  userId: string, 
  resource: keyof UserContext['limits']
): Promise<number> {
  // Query actual usage from database
  // This would check workflows, workspaces, etc. owned by user
  switch (resource) {
    case 'maxWorkflows':
      const workflowCount = await db.$count(/* user's workflows */);
      return workflowCount;
    case 'maxWorkspaces':
      const workspaceCount = await db.$count(/* user's workspaces */);
      return workspaceCount;
    // ... other resources
    default:
      return 0;
  }
}

async function incrementUsage(
  userId: string, 
  usageType: keyof UserContext['usage']
): Promise<void> {
  // Update usage counters
  // Implementation depends on your tracking strategy
}
```

---

## 6. Frontend: PulseChain Login

### File: `apps/sim/components/auth/pulsechain-login.tsx` (NEW)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthClient } from "better-auth/client";
import { siweClient } from "@better-auth/siwe/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

      // Success - redirect happens via callbackURL
      
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
        `Access Denied: Your wallet does not hold the required NFT on PulseChain (Chain 369). ` +
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
        className="w-full h-12 text-base"
        variant="default"
      >
        {isLoading ? (
          <>
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
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
        <p>Requires MetaMask or Web3 wallet on PulseChain (369)</p>
        <p>NFT Contract: {process.env.NEXT_PUBLIC_NFT_CONTRACT?.slice(0, 16)}...</p>
      </div>
    </div>
  );
}
```

---

## 7. API Route Protection

### File: `apps/sim/app/api/workflow/route.ts` (Example)

```typescript
import { NextRequest } from "next/server";
import { withUserGuard } from "@/lib/user-context";
import { db } from "@sim/db";
import { workflow } from "@sim/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const result = await withUserGuard(
      async (ctx) => {
        // Create workflow with user isolation
        const newWorkflow = await db.insert(workflow).values({
          ...body,
          userId: ctx.userId, // Better Auth handles this automatically
          // workspaceId would come from body, validated against user's workspaces
        }).returning();
        
        return newWorkflow[0];
      },
      { 
        checkResource: 'maxWorkflows' // Checks against user's tier limit
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
          upgradeUrl: "/settings/upgrade"
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
    
    if (error.message === "NFT_STATUS_EXPIRED") {
      return Response.json(
        { 
          error: "NFT ownership expired. Please re-verify.",
          code: "NFT_EXPIRED"
        },
        { status: 403 }
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
    const workflows = await withUserGuard(
      async (ctx) => {
        // Returns only user's workflows (existing Sim Studio behavior)
        return await db.query.workflow.findMany({
          where: eq(workflow.userId, ctx.userId),
        });
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

---

## 8. Docker & Deployment

### File: `docker-compose.pulsechain.yml`

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
      - PULSECHAIN_RPC_URL=${PULSECHAIN_RPC_URL}
      - PULSECHAIN_WS_URL=${PULSECHAIN_WS_URL}
      
      # Better Auth
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - BETTER_AUTH_URL=${NEXT_PUBLIC_APP_URL}
      - NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
      
      # Expose to frontend
      - NEXT_PUBLIC_NFT_CONTRACT=${NFT_CONTRACT_ADDRESS}
      
      # Tier Config
      - TIER_PREMIUM_TOKEN_IDS=${TIER_PREMIUM_TOKEN_IDS}
      - TIER_ENTERPRISE_TOKEN_IDS=${TIER_ENTERPRISE_TOKEN_IDS}
      
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health/pulsechain"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Database migration service
  db-migrate:
    build:
      context: .
      dockerfile: Dockerfile
    command: ["bun", "run", "db:migrate"]
    environment:
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - db

  # Existing services (db, redis, etc.)
  db:
    image: pgvector/pgvector:pg17
    environment:
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=simstudio
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

## 9. Testing Scripts

### File: `scripts/test-nft-gate.ts`

```typescript
import { verifyNFTOwnership, getTierLimits } from '../apps/sim/lib/pulsechain/nft-verification';

const TEST_WALLET_WITH_NFT = "0x..."; // Wallet holding NFT
const TEST_WALLET_WITHOUT_NFT = "0x..."; // Wallet without NFT

async function runTests() {
  console.log("=== PulseChain NFT User Gating Tests ===\n");
  
  // Test 1: RPC Connection
  console.log("Test 1: PulseChain RPC");
  const { publicClient } = await import('../apps/sim/lib/pulsechain/client');
  const block = await publicClient.getBlockNumber();
  console.log(`✅ Connected. Block: ${block}\n`);
  
  // Test 2: NFT holder
  console.log("Test 2: Wallet WITH NFT");
  const result1 = await verifyNFTOwnership(TEST_WALLET_WITH_NFT as `0x${string}`);
  console.log("Result:", result1);
  if (!result1.hasNFT) throw new Error("Should have NFT");
  console.log(`✅ Tier: ${result1.tier}`);
  console.log(`✅ Limits:`, getTierLimits(result1.tier));
  console.log();
  
  // Test 3: Non-holder
  console.log("Test 3: Wallet WITHOUT NFT");
  const result2 = await verifyNFTOwnership(TEST_WALLET_WITHOUT_NFT as `0x${string}`);
  console.log("Result:", result2);
  if (result2.hasNFT) throw new Error("Should NOT have NFT");
  console.log("✅ Correctly denied\n");
  
  // Test 4: Tier limits
  console.log("Test 4: Tier Limits");
  console.log("Standard:", getTierLimits('standard'));
  console.log("Premium:", getTierLimits('premium'));
  console.log("Enterprise:", getTierLimits('enterprise'));
  console.log("✅ Limits defined\n");
  
  console.log("=== All Tests Passed ===");
}

runTests().catch(console.error);
```

---

## Key Changes from Original Plan

| Aspect | Original (Workspace Gating) | Revised (User Gating) |
|--------|---------------------------|----------------------|
| **Gating Level** | Workspace creation | User registration |
| **Schema Change** | New `workspaces` table | Extend with `userNftAccess` table |
| **1:1 Relationship** | Wallet = Workspace | Wallet = User |
| **Multi-workspace** | ❌ Broken (forced 1:1) | ✅ Preserved |
| **Better Auth Integration** | Hacks around user model | Native SIWE + callbacks |
| **Resource Limits** | Per-workspace | Per-user (across all workspaces) |
| **Global State** | ❌ Dangerous `global` usage | ✅ Proper callback flow |
| **Middleware DB Calls** | ❌ Every request | ✅ Only API routes |

---

## Success Metrics

- [ ] New user with NFT → Auto-creates user + nftAccess record
- [ ] New user without NFT → Blocked at login with specific error
- [ ] Existing user, NFT sold → Next login fails with "NFT_EXPIRED"
- [ ] User can create multiple workspaces (up to tier limit)
- [ ] Resource limits enforced across all user's workspaces
- [ ] `/api/health/pulsechain` returns OK
- [ ] All tests pass
```

---

**Key improvements in this revised plan:**

1. **No global state** - Uses Better Auth's native callbacks properly
2. **Preserves workspace architecture** - Users can have multiple workspaces as originally designed
3. **Proper schema** - Extends existing `user` table via `userNftAccess` relationship
4. **No middleware DB queries** - Authentication happens once at login, session handles the rest
5. **Audit trail** - `userNftHistory` tracks all ownership changes
6. **Re-verification support** - Can periodically check if user still holds NFT
7. **Resource limits at user level** - Makes more sense for billing/tiers