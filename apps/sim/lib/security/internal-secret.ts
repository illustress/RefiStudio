import { createHmac } from 'crypto'

let cachedKey: Uint8Array | null = null

// Returns a stable secret key for internal JWT signing/verification.
// Prefers explicit INTERNAL_API_SECRET; otherwise derives from BETTER_AUTH_SECRET (or ENCRYPTION_KEY).
export function getInternalApiSecretKey(): Uint8Array {
  if (cachedKey) return cachedKey

  const explicit = process.env.INTERNAL_API_SECRET as string | undefined
  if (explicit && explicit.length >= 32) {
    cachedKey = new TextEncoder().encode(explicit)
    return cachedKey
  }

  const base = (process.env.BETTER_AUTH_SECRET || process.env.ENCRYPTION_KEY || '') as string
  const digest = createHmac('sha256', String(base)).update('sim-internal-api-secret-v1').digest()
  cachedKey = new Uint8Array(digest)
  return cachedKey
}
