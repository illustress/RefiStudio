import { createPublicClient, http } from 'viem'
import { createLogger } from '@sim/logger'

/**
 * This module configures PulseChain RPC access using viem v2.x.
 */
const logger = createLogger('PulseChainClient')

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
      http: [process.env.PULSECHAIN_RPC_URL as string],
      webSocket: process.env.PULSECHAIN_WS_URL ? [process.env.PULSECHAIN_WS_URL] : [],
    },
    public: {
      http: [process.env.PULSECHAIN_RPC_URL as string],
      webSocket: process.env.PULSECHAIN_WS_URL ? [process.env.PULSECHAIN_WS_URL] : [],
    },
  },
  blockExplorers: {
    default: { name: 'PulseScan', url: 'https://scan.pulsechain.com' },
  },
} as const

export const publicClient = createPublicClient({
  chain: pulsechainConfig,
  transport: http(process.env.PULSECHAIN_RPC_URL as string, {
    retryCount: 3,
    retryDelay: 1000,
  }),
})

/**
 * This function performs a health check against PulseChain RPC.
 */
export async function checkPulseConnection(): Promise<boolean> {
  /**
   * Step 1: Request the latest block number to validate connectivity.
   */
  try {
    const blockNumber = await publicClient.getBlockNumber()
    logger.info('PulseChain connected', { blockNumber: blockNumber.toString() })
    return true
  } catch (error) {
    /**
     * Step 2: Log failures in a structured, actionable format.
     */
    logger.error('PulseChain RPC connection failed', { error })
    return false
  }
}
