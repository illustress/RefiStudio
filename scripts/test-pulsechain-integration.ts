#!/usr/bin/env bun
import { createLogger } from '@sim/logger'
import { sql } from 'drizzle-orm'
import { db } from '@sim/db'
import { publicClient } from '@/lib/pulsechain/client'
import { getTierLimits, verifyNonFungibleTokenOwnership } from '@/lib/pulsechain/nft-verification'

const logger = createLogger('PulseChainIntegrationTest')

const testWalletConfiguration = {
  walletWithNonFungibleToken: process.env.TEST_WALLET_WITH_NFT || '0x...',
  walletWithoutNonFungibleToken: process.env.TEST_WALLET_WITHOUT_NFT || '0x...',
} as const

/**
 * This function executes end-to-end PulseChain non-fungible token gating checks.
 */
async function runTests() {
  logger.info('Starting PulseChain non-fungible token integration tests')

  let passedCount = 0
  let failedCount = 0

  /**
   * Step 1: Validate RPC connectivity.
   */
  try {
    const blockNumber = await publicClient.getBlockNumber()
    logger.info('Test 1 passed: RPC connection', { blockNumber: blockNumber.toString() })
    passedCount += 1
  } catch (error) {
    logger.error('Test 1 failed: RPC connection', { error })
    failedCount += 1
  }

  /**
   * Step 2: Verify ownership for a wallet expected to hold a token.
   */
  try {
    const ownershipResult = await verifyNonFungibleTokenOwnership(
      testWalletConfiguration.walletWithNonFungibleToken as `0x${string}`
    )
    if (!ownershipResult.hasNonFungibleToken) {
      throw new Error('Expected wallet to hold a non-fungible token')
    }
    if (!ownershipResult.isOwner) {
      throw new Error('Expected wallet to be the token owner')
    }
    logger.info('Test 2 passed: Ownership verification (holder)', {
      tier: ownershipResult.tier,
      tokenIdentifier: ownershipResult.tokenIdentifier,
    })
    passedCount += 1
  } catch (error) {
    logger.error('Test 2 failed: Ownership verification (holder)', { error })
    failedCount += 1
  }

  /**
   * Step 3: Verify rejection for a wallet without tokens.
   */
  try {
    const ownershipResult = await verifyNonFungibleTokenOwnership(
      testWalletConfiguration.walletWithoutNonFungibleToken as `0x${string}`
    )
    if (ownershipResult.hasNonFungibleToken) {
      throw new Error('Expected wallet to be rejected for non-ownership')
    }
    logger.info('Test 3 passed: Ownership verification (non-holder)')
    passedCount += 1
  } catch (error) {
    logger.error('Test 3 failed: Ownership verification (non-holder)', { error })
    failedCount += 1
  }

  /**
   * Step 4: Verify tier limits ordering.
   */
  try {
    const standardLimits = getTierLimits('standard')
    const premiumLimits = getTierLimits('premium')
    const enterpriseLimits = getTierLimits('enterprise')

    if (standardLimits.maxWorkflows >= premiumLimits.maxWorkflows) {
      throw new Error('Standard tier should allow fewer workflows than premium tier')
    }
    if (premiumLimits.maxWorkflows >= enterpriseLimits.maxWorkflows) {
      throw new Error('Premium tier should allow fewer workflows than enterprise tier')
    }

    logger.info('Test 4 passed: Tier limits ordering', {
      standard: standardLimits.maxWorkflows,
      premium: premiumLimits.maxWorkflows,
      enterprise: enterpriseLimits.maxWorkflows,
    })
    passedCount += 1
  } catch (error) {
    logger.error('Test 4 failed: Tier limits ordering', { error })
    failedCount += 1
  }

  /**
   * Step 5: Verify database schema availability.
   */
  try {
    await db.execute(sql`SELECT 1 FROM user_nft_access LIMIT 1`)
    logger.info('Test 5 passed: user_nft_access table exists')
    passedCount += 1
  } catch (error) {
    logger.error('Test 5 failed: user_nft_access table exists', { error })
    failedCount += 1
  }

  const totalCount = passedCount + failedCount
  logger.info('PulseChain test summary', {
    passed: passedCount,
    failed: failedCount,
    total: totalCount,
  })

  if (failedCount > 0) {
    process.exit(1)
  }
}

runTests().catch((error) => {
  logger.error('PulseChain test runner failed', { error })
  process.exit(1)
})
