import { db } from '@sim/db'
import { userNftAccess } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'

/**
 * This module provides non-fungible token gated user context for backend operations.
 */
export interface UserContext {
  userId: string
  walletAddress: string
  tier: 'none' | 'standard' | 'premium' | 'enterprise'
  status: 'pending' | 'verified' | 'expired' | 'revoked'
  limits: {
    maxWorkflows: number
    maxWorkspaces: number
    maxApiCalls: number
    maxStorageMB: number
    maxAgents: number
    maxSchedules: number
    maxWebhooks: number
  }
  usage: {
    apiCallsThisMonth: number
    storageUsedMB: number
  }
  tokenIdentifier?: number
}

/**
 * This function resolves the current user context with non-fungible token access.
 */
export async function getCurrentUserContext(): Promise<UserContext> {
  /**
   * Step 1: Resolve the active session and user identifier.
   */
  const session = await getSession()

  if (!session?.user?.id) {
    throw new Error('UNAUTHORIZED')
  }

  /**
   * Step 2: Load non-fungible token access data for the user.
   */
  const nonFungibleTokenAccess = await db.query.userNftAccess.findFirst({
    where: eq(userNftAccess.userId, session.user.id),
  })

  if (!nonFungibleTokenAccess) {
    throw new Error('NFT_ACCESS_NOT_FOUND')
  }

  if (nonFungibleTokenAccess.status !== 'verified') {
    throw new Error(`NFT_STATUS_${nonFungibleTokenAccess.status.toUpperCase()}`)
  }

  /**
   * Step 3: Return a normalized user context object.
   */
  return {
    userId: session.user.id,
    walletAddress: nonFungibleTokenAccess.walletAddress,
    tier: nonFungibleTokenAccess.tier as UserContext['tier'],
    status: nonFungibleTokenAccess.status as UserContext['status'],
    limits: nonFungibleTokenAccess.resourceLimits as UserContext['limits'],
    usage: nonFungibleTokenAccess.currentUsage as UserContext['usage'],
    tokenIdentifier: nonFungibleTokenAccess.tokenId ?? undefined,
  }
}

/**
 * This function evaluates whether a user tier satisfies a required tier.
 */
export function hasRequiredTier(
  userTier: string,
  requiredTier: 'standard' | 'premium' | 'enterprise'
): boolean {
  /**
   * Step 1: Compare tier ordering to enforce access constraints.
   */
  const tiers = ['none', 'standard', 'premium', 'enterprise']
  return tiers.indexOf(userTier) >= tiers.indexOf(requiredTier)
}

/**
 * This function wraps an operation with tier and resource guards.
 */
export async function withUserGuard<T>(
  operation: (context: UserContext) => Promise<T>,
  options?: {
    requireTier?: ('standard' | 'premium' | 'enterprise')[]
    checkResource?: keyof UserContext['limits']
    incrementUsage?: keyof UserContext['usage']
  }
): Promise<T> {
  /**
   * Step 1: Resolve user context for the current session.
   */
  const userContext = await getCurrentUserContext()

  /**
   * Step 2: Enforce tier requirements when provided.
   */
  if (options?.requireTier) {
    const hasTier = options.requireTier.some((tier) =>
      hasRequiredTier(userContext.tier, tier)
    )
    if (!hasTier) {
      throw new Error('INSUFFICIENT_TIER')
    }
  }

  /**
   * Step 3: Enforce resource limits when requested.
   */
  if (options?.checkResource) {
    const limit = userContext.limits[options.checkResource]
    const currentUsage = await getResourceUsage(userContext.userId, options.checkResource)

    if (currentUsage >= limit) {
      throw new Error('RESOURCE_LIMIT_EXCEEDED')
    }
  }

  /**
   * Step 4: Execute the guarded operation with the user context.
   */
  const result = await operation(userContext)

  /**
   * Step 5: Track usage updates when requested.
   */
  if (options?.incrementUsage) {
    await incrementResourceUsage(userContext.userId, options.incrementUsage)
  }

  return result
}

/**
 * Note: This is a potential extension; verify before production use.
 */
async function getResourceUsage(
  userId: string,
  resource: keyof UserContext['limits']
): Promise<number> {
  /**
   * Step 1: Return a placeholder usage value until implementation is finalized.
   */
  return 0
}

/**
 * Note: This is a potential extension; verify before production use.
 */
async function incrementResourceUsage(
  userId: string,
  resource: keyof UserContext['usage']
): Promise<void> {
  /**
   * Step 1: Intentionally no-op until usage persistence is finalized.
   */
}
