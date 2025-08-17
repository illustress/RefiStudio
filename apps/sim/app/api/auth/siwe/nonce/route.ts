import { NextResponse, type NextRequest } from 'next/server'
import { getRedisClient } from '@/lib/redis'
import { createLogger } from '@/lib/logs/console/logger'
import { env } from '@/lib/env'
import { generateNonce } from 'siwe'

const logger = createLogger('SIWE:Nonce')

const NONCE_PREFIX = 'siwe:nonce:'
const NONCE_TTL_SECONDS = 5 * 60

export async function GET(_req: NextRequest) {
  try {
    // SIWE requires an alphanumeric nonce (>= 8 chars). Use official helper.
    const nonce = generateNonce()
    if (env.REDIS_URL) {
      const redis = getRedisClient()
      if (redis) {
        await redis.set(`${NONCE_PREFIX}${nonce}`, '1', 'EX', NONCE_TTL_SECONDS)
      }
    }

    return new NextResponse(nonce, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })
  } catch (error) {
    logger.error('Failed to issue SIWE nonce', { error })
    return NextResponse.json({ error: 'Failed to issue nonce' }, { status: 500 })
  }
}
