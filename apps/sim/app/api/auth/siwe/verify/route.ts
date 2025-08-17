import { NextResponse, type NextRequest } from 'next/server'
import { SiweMessage } from 'siwe'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { user as userTable } from '@/db/schema'
import { getRedisClient } from '@/lib/redis'
import { env } from '@/lib/env'
import { createLogger } from '@/lib/logs/console/logger'
import { encodeSignedSiweCookie } from '@/lib/auth/siwe-cookie'

const logger = createLogger('SIWE:Verify')

const NONCE_PREFIX = 'siwe:nonce:'

function toChecksumLower(addr: string) {
  return addr?.toLowerCase()
}

function setSiweSessionCookie(res: NextResponse, userId: string, address: string, reqUrl: string) {
  const isHttps = true // For localhost and dev, allow secure cookie too
  const nowSec = Math.floor(Date.now() / 1000)
  const payload = {
    uid: userId,
    addr: address,
    iat: nowSec,
    exp: nowSec + 24 * 60 * 60, // 24 hours validity
  }
  const value = encodeSignedSiweCookie(payload)
  res.cookies.set({
    name: 'siwe_session',
    value,
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60, // align cookie max-age with payload exp
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, signature } = body || {}
    if (!message || !signature) {
      return NextResponse.json({ error: 'Missing message or signature' }, { status: 400 })
    }

    const siwe = new SiweMessage(message)
    const domain = new URL(req.url).host
    const result = await siwe.verify({ signature, domain })
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid SIWE' }, { status: 401 })
    }

    if (env.REDIS_URL) {
      const redis = getRedisClient()
      if (redis) {
        const nonceKey = `${NONCE_PREFIX}${siwe.nonce}`
        const existed = await redis.get(nonceKey)
        if (!existed) {
          return NextResponse.json({ error: 'Nonce expired/used' }, { status: 401 })
        }
        await redis.del(nonceKey)
      }
    }

    const address = toChecksumLower(siwe.address)
    if (!address) {
      return NextResponse.json({ error: 'No address' }, { status: 400 })
    }

    // Find user by wallet; create if not found.
    const existing = await db
      .select()
      .from(userTable)
      .where(eq(userTable.walletAddress, address))
      .limit(1)

    let user = existing[0]
    if (!user) {
      const now = new Date()
      const id = `user_${now.getTime()}_${Math.random().toString(36).slice(2, 10)}`
      const name = `Wallet ${address.slice(0, 6)}…${address.slice(-4)}`
      const email = `${address}@wallet.user` // synthetic, never emailed

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
        .returning()
      user = inserted[0]
    }

    const res = NextResponse.json({ ok: true })
    setSiweSessionCookie(res, user.id, address, req.url)
    return res
  } catch (error) {
    logger.error('SIWE verify failed', { error })
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
