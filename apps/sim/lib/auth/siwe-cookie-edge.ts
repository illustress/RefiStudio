// Edge-runtime compatible SIWE cookie signer/verifier using Web Crypto

export interface SiweCookiePayloadEdge {
  uid: string
  addr: string
  iat: number
  exp: number
}

function te(input: string): Uint8Array {
  return new TextEncoder().encode(input)
}

function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let str = ''
  for (let i = 0; i < b.length; i++) str += String.fromCharCode(b[i])
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64urlDecodeToUint8(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const s = str.replaceAll('-', '+').replaceAll('_', '/') + pad
  const binary = atob(s)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function deriveInternalKeyBytes(): Promise<Uint8Array> {
  const explicit = (process.env.INTERNAL_API_SECRET || '') as string
  if (explicit && explicit.length >= 32) {
    return te(explicit)
  }

  const base = (process.env.BETTER_AUTH_SECRET || process.env.ENCRYPTION_KEY || '') as string
  const baseKey = await crypto.subtle.importKey(
    'raw',
    te(String(base)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const digest = await crypto.subtle.sign('HMAC', baseKey, te('sim-internal-api-secret-v1'))
  return new Uint8Array(digest)
}

async function importHmacKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

async function signPayloadB64(payloadB64: string, key: CryptoKey): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', key, te(payloadB64))
  return base64urlEncode(sig)
}

export async function encodeSignedSiweCookieEdge(payload: SiweCookiePayloadEdge): Promise<string> {
  const payloadJson = JSON.stringify(payload)
  const payloadB64 = base64urlEncode(te(payloadJson))
  const keyBytes = await deriveInternalKeyBytes()
  const key = await importHmacKey(keyBytes)
  const sig = await signPayloadB64(payloadB64, key)
  return `${payloadB64}.${sig}`
}

export async function decodeAndVerifySiweCookieEdge(
  value: string | undefined | null
): Promise<SiweCookiePayloadEdge | null> {
  try {
    if (!value) return null
    const parts = value.split('.')
    if (parts.length !== 2) return null
    const [payloadB64, sig] = parts
    const keyBytes = await deriveInternalKeyBytes()
    const key = await importHmacKey(keyBytes)
    const expectedSig = await signPayloadB64(payloadB64, key)
    if (sig.length !== expectedSig.length) return null
    // Best-effort constant-time compare
    let mismatch = 0
    for (let i = 0; i < sig.length; i++) mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i)
    if (mismatch !== 0) return null
    const payloadBytes = base64urlDecodeToUint8(payloadB64)
    const payloadStr = new TextDecoder().decode(payloadBytes)
    const payload = JSON.parse(payloadStr) as SiweCookiePayloadEdge
    if (!payload?.uid || !payload?.addr || !payload?.iat || !payload?.exp) return null
    const nowSec = Math.floor(Date.now() / 1000)
    if (nowSec >= payload.exp) return null
    return payload
  } catch {
    return null
  }
}
