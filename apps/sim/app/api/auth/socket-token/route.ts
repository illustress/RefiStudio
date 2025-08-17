import { headers, cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { auth } from '@/lib/auth'
import { getInternalApiSecretKey } from '@/lib/security/internal-secret'
import { decodeAndVerifySiweCookie } from '@/lib/auth/siwe-cookie'

export async function POST() {
  try {
    const response = await auth.api.generateOneTimeToken({
      headers: await headers(),
    })

    if (!response) {
      // Fallback: read SIWE cookie directly and issue internal socket token
      const cookieStore = await cookies()
      const siweRaw = cookieStore.get('siwe_session')?.value
      const siwe = decodeAndVerifySiweCookie(siweRaw)
      if (!siwe?.uid) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      }
      try {
        const secret = getInternalApiSecretKey()
        const token = await new SignJWT({ type: 'socket', userId: siwe.uid })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(secret)
        return NextResponse.json({ token })
      } catch {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      }
    }

    return NextResponse.json({ token: response.token })
  } catch (error) {
    // Attempt SIWE cookie fallback on error
    try {
      const cookieStore = await cookies()
      const siweRaw = cookieStore.get('siwe_session')?.value
      const siwe = decodeAndVerifySiweCookie(siweRaw)
      if (siwe?.uid) {
        const secret = getInternalApiSecretKey()
        const token = await new SignJWT({ type: 'socket', userId: siwe.uid })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(secret)
        return NextResponse.json({ token })
      }
    } catch {}
    console.error('Error generating one-time token:', error)
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
}
