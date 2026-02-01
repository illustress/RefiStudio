import { NextResponse } from 'next/server'
import { getEnv } from '@/lib/core/config/env'
import { checkPulseConnection } from '@/lib/pulsechain/client'

/**
 * This route reports PulseChain RPC connectivity status.
 */
export async function GET() {
  /**
   * Step 1: Check PulseChain connectivity through the public client.
   */
  const isConnected = await checkPulseConnection()

  if (!isConnected) {
    return NextResponse.json(
      { status: 'error', message: 'PulseChain RPC unreachable' },
      { status: 503 }
    )
  }

  /**
   * Step 2: Return a masked RPC URL for observability without credential leakage.
   */
  const pulseChainRpcUrl = getEnv('PULSECHAIN_RPC_URL')
  const maskedRpcUrl = pulseChainRpcUrl?.replace(/\/\/.*@/, '//***@')

  return NextResponse.json({
    status: 'ok',
    chain: 'PulseChain',
    chainId: 369,
    rpc: maskedRpcUrl,
  })
}
