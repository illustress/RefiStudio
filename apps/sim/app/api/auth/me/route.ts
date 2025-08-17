import { NextResponse, type NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { decodeAndVerifySiweCookie } from '@/lib/auth/siwe-cookie'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (session?.user?.id) {
      return NextResponse.json({
        userId: session.user.id,
        email: session.user.email || null,
        walletAddress: null,
      })
    }

    // Fallback to signed SIWE cookie
    const cookie = req.cookies.get('siwe_session')?.value
    const payload = decodeAndVerifySiweCookie(cookie)
    if (payload?.uid || payload?.addr) {
      return NextResponse.json({
        userId: payload.uid || null,
        email: payload.addr ? `${payload.addr.toLowerCase()}@wallet.user` : null,
        walletAddress: payload.addr || null,
      })
    }

    return NextResponse.json({
      userId: null,
      email: null,
      walletAddress: null,
    })
  } catch (error) {
    return NextResponse.json({
      userId: null,
      email: null,
      walletAddress: null,
    })
  }
}
