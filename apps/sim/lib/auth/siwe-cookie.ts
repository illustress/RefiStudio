import { createHmac, timingSafeEqual } from 'crypto'
import { getInternalApiSecretKey } from '@/lib/security/internal-secret'

export interface SiweCookiePayload {
  uid: string
  addr: string
  iat: number // issued at (epoch seconds)
  exp: number // expires at (epoch seconds)
}

function base64urlEncode(input: Uint8Array | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input)
  return buffer.toString('base64url')
}

function base64urlDecodeToString(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function sign(input: string): string {
  const key = Buffer.from(getInternalApiSecretKey())
  const mac = createHmac('sha256', key).update(input).digest()
  return base64urlEncode(mac)
}

export function encodeSignedSiweCookie(payload: SiweCookiePayload): string {
  const payloadJson = JSON.stringify(payload)
  const payloadB64 = base64urlEncode(payloadJson)
  const sig = sign(payloadB64)
  return `${payloadB64}.${sig}`
}

export function decodeAndVerifySiweCookie(
  value: string | undefined | null
): SiweCookiePayload | null {
  try {
    if (!value) return null
    const parts = value.split('.')
    if (parts.length !== 2) return null
    const [payloadB64, sig] = parts
    const expectedSig = sign(payloadB64)
    // Constant-time compare (Node crypto)
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payloadStr = base64urlDecodeToString(payloadB64)
    const payload = JSON.parse(payloadStr) as SiweCookiePayload
    if (!payload?.uid || !payload?.addr || !payload?.iat || !payload?.exp) return null
    const nowSec = Math.floor(Date.now() / 1000)
    if (nowSec >= payload.exp) return null
    return payload
  } catch {
    return null
  }
}

// Transitional support for legacy unsigned cookie (base64url JSON {uid, addr})
export function decodeLegacySiweCookie(
  value: string | undefined | null
): { uid?: string; addr?: string } | null {
  try {
    if (!value) return null
    if (value.includes('.')) return null // not legacy format
    const raw = Buffer.from(value, 'base64url').toString('utf8')
    const parsed = JSON.parse(raw) as { uid?: string; addr?: string }
    if (parsed && (parsed.uid || parsed.addr)) return parsed
    return null
  } catch {
    return null
  }
}

// Last-resort parser for signed-format value without verifying signature
export function parseUnsignedSignedSiweCookie(
  value: string | undefined | null
): SiweCookiePayload | null {
  try {
    if (!value) return null
    const parts = value.split('.')
    if (parts.length !== 2) return null
    const [payloadB64] = parts
    const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8')
    const payload = JSON.parse(payloadStr) as SiweCookiePayload
    if (!payload?.uid || !payload?.exp) return null
    const nowSec = Math.floor(Date.now() / 1000)
    if (nowSec >= payload.exp) return null
    return payload
  } catch {
    return null
  }
}
