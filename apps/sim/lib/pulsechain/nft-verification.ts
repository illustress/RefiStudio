import { getContract, parseAbi } from 'viem'
import type { Address } from 'viem'
import { createLogger } from '@sim/logger'
import { publicClient } from '@/lib/pulsechain/client'

/**
 * This module verifies PulseChain non-fungible token ownership using viem v2.x.
 */
const logger = createLogger('NonFungibleTokenVerification')

const nonFungibleTokenStandardAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function getTokenTier(uint256 tokenId) view returns (uint8)',
])

export interface NonFungibleTokenOwnershipResult {
  hasNonFungibleToken: boolean
  tokenIdentifier?: number
  tier: 'none' | 'standard' | 'premium' | 'enterprise'
  ownedTokenCount: bigint
  isOwner: boolean
  tokenMetadata?: { tokenUniformResourceIdentifier?: string }
}

function getTierFromTokenIdentifier(
  tokenIdentifier: number
): 'standard' | 'premium' | 'enterprise' {
  const premiumTokenIdentifiers =
    process.env.TIER_PREMIUM_TOKEN_IDS?.split(',').map((tokenIdentifierText) =>
      Number(tokenIdentifierText)
    ) ?? []
  const enterpriseTokenIdentifiers =
    process.env.TIER_ENTERPRISE_TOKEN_IDS?.split(',').map((tokenIdentifierText) =>
      Number(tokenIdentifierText)
    ) ?? []

  if (enterpriseTokenIdentifiers.includes(tokenIdentifier)) {
    return 'enterprise'
  }

  if (premiumTokenIdentifiers.includes(tokenIdentifier)) {
    return 'premium'
  }

  return 'standard'
}

/**
 * This function resolves resource limits by access tier.
 */
export function getTierLimits(tier: string) {
  const tierLimits = {
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
  } as const

  return tierLimits[tier as keyof typeof tierLimits] ?? tierLimits.none
}

/**
 * This function verifies ownership and tier for a PulseChain non-fungible token.
 */
export async function verifyNonFungibleTokenOwnership(
  walletAddress: Address
): Promise<NonFungibleTokenOwnershipResult> {
  /**
   * Step 1: Validate required configuration before making chain calls.
   */
  const nonFungibleTokenContractAddress = process.env
    .NFT_CONTRACT_ADDRESS as Address | undefined

  if (!nonFungibleTokenContractAddress) {
    logger.error('NFT_CONTRACT_ADDRESS is required for verification')
    throw new Error('VERIFICATION_FAILED')
  }

  try {
    /**
     * Step 2: Initialize the contract client for ERC-721 reads.
     */
    const contract = getContract({
      address: nonFungibleTokenContractAddress,
      abi: nonFungibleTokenStandardAbi,
      client: publicClient,
    })

    /**
     * Step 3: Read the owner balance to detect token ownership.
     */
    const ownedTokenCount = await contract.read.balanceOf([walletAddress])

    if (ownedTokenCount === 0n) {
      return {
        hasNonFungibleToken: false,
        tier: 'none',
        ownedTokenCount: 0n,
        isOwner: false,
      }
    }

    /**
     * Step 4: Resolve the token identifier for tier detection.
     */
    let tokenIdentifier: number | undefined

    try {
      const tokenIdentifierBigInt = await contract.read.tokenOfOwnerByIndex([
        walletAddress,
        0n,
      ])
      tokenIdentifier = Number(tokenIdentifierBigInt)
    } catch (error) {
      logger.warn('tokenOfOwnerByIndex is not supported, using fallback lookup', {
        walletAddress,
      })

      try {
        const tokenOwnerAddress = await contract.read.ownerOf([1n])
        if (tokenOwnerAddress.toLowerCase() === walletAddress.toLowerCase()) {
          tokenIdentifier = 1
        }
      } catch {
        /**
         * Step 4a: Preserve ownership false when token identifier cannot be resolved.
         */
      }
    }

    if (!tokenIdentifier) {
      return {
        hasNonFungibleToken: false,
        tier: 'none',
        ownedTokenCount,
        isOwner: false,
      }
    }

    /**
     * Step 5: Confirm ownership for the resolved token identifier.
     */
    const tokenOwnerAddress = await contract.read.ownerOf([BigInt(tokenIdentifier)])
    const isOwner = tokenOwnerAddress.toLowerCase() === walletAddress.toLowerCase()

    if (!isOwner) {
      return {
        hasNonFungibleToken: false,
        tier: 'none',
        ownedTokenCount,
        isOwner: false,
      }
    }

    /**
     * Step 6: Determine tier and optional metadata.
     */
    const tier = getTierFromTokenIdentifier(tokenIdentifier)
    let tokenUniformResourceIdentifier: string | undefined

    try {
      tokenUniformResourceIdentifier = await contract.read.tokenURI([
        BigInt(tokenIdentifier),
      ])
    } catch {
      /**
       * Step 6a: Proceed without metadata when tokenURI is unavailable.
       */
    }

    return {
      hasNonFungibleToken: true,
      tokenIdentifier,
      tier,
      ownedTokenCount,
      isOwner: true,
      tokenMetadata: { tokenUniformResourceIdentifier },
    }
  } catch (error) {
    logger.error('Non-fungible token verification failed', { error, walletAddress })
    throw new Error('VERIFICATION_FAILED')
  }
}

/**
 * This function rechecks ownership against an expected token identifier.
 */
export async function reverifyNonFungibleTokenOwnership(
  walletAddress: Address,
  expectedTokenIdentifier: number
): Promise<boolean> {
  /**
   * Step 1: Run a full verification pass for the wallet address.
   */
  try {
    const verificationResult = await verifyNonFungibleTokenOwnership(walletAddress)
    return (
      verificationResult.hasNonFungibleToken &&
      verificationResult.tokenIdentifier === expectedTokenIdentifier &&
      verificationResult.isOwner
    )
  } catch {
    /**
     * Step 2: Return a safe negative result when verification fails.
     */
    return false
  }
}
