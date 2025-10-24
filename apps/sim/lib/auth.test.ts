import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSession, isWalletUser, getWalletAddress, getUserDisplayName } from './auth'

// Mock the auth module
vi.mock('./auth', async () => {
  const actual = await vi.importActual('./auth')
  return {
    ...actual,
    auth: {
      api: {
        getSession: vi.fn()
      }
    }
  }
})

// Mock headers
vi.mock('next/headers', () => ({
  headers: vi.fn()
}))

// Mock the SIWE cookie decoder
vi.mock('@/lib/auth/siwe-cookie', () => ({
  decodeAndVerifySiweCookie: vi.fn()
}))

describe('getSession with SIWE integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return Better Auth session when available', async () => {
    const mockSession = {
      user: {
        id: 'user_123',
        email: 'john@example.com',
        name: 'John Doe'
      }
    }

    const { auth } = await import('./auth')
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)

    const result = await getSession()
    
    expect(result).toEqual(mockSession)
  })

  it('should fallback to SIWE session when Better Auth session is null', async () => {
    const { auth } = await import('./auth')
    const { decodeAndVerifySiweCookie } = await import('@/lib/auth/siwe-cookie')
    const { headers } = await import('next/headers')

    // Mock Better Auth returning null
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    
    // Mock headers returning SIWE cookie
    vi.mocked(headers).mockResolvedValue({
      get: vi.fn().mockReturnValue('siwe_session=eyJ1aWQiOiJ1c2VyXzEyMyIsImFkZHIiOiIweDc0MmQzNWNjNjYzNGMwNTMyOTI1YTNiOGQ0YzlkYjk2YzRiNGQ4YjYiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDA4NjQwMH0.signature')
    })
    
    // Mock SIWE cookie decoder
    vi.mocked(decodeAndVerifySiweCookie).mockReturnValue({
      uid: 'user_123',
      addr: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
      iat: 1700000000,
      exp: 1700086400
    })

    const result = await getSession()
    
    expect(result).toEqual({
      user: {
        id: 'user_123',
        email: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6@wallet.user',
        name: 'Wallet 0x742d…4d8b6',
        image: null,
        emailVerified: true
      },
      session: {
        id: 'siwe_user_123',
        userId: 'user_123',
        expiresAt: new Date(1700086400 * 1000),
        token: 'siwe_session',
        createdAt: new Date(1700000000 * 1000),
        updatedAt: new Date(1700000000 * 1000)
      }
    })
  })

  it('should return null when no session is available', async () => {
    const { auth } = await import('./auth')
    const { headers } = await import('next/headers')

    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    vi.mocked(headers).mockResolvedValue({
      get: vi.fn().mockReturnValue('other_cookie=value')
    })

    const result = await getSession()
    
    expect(result).toBeNull()
  })
})

describe('utility functions', () => {
  it('should identify wallet users correctly', () => {
    const oauthSession = {
      user: { email: 'john@example.com' }
    }
    
    const walletSession = {
      user: { email: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6@wallet.user' }
    }

    expect(isWalletUser(oauthSession)).toBe(false)
    expect(isWalletUser(walletSession)).toBe(true)
    expect(isWalletUser(null)).toBe(false)
  })

  it('should extract wallet address correctly', () => {
    const walletSession = {
      user: { email: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6@wallet.user' }
    }

    expect(getWalletAddress(walletSession)).toBe('0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6')
    expect(getWalletAddress({ user: { email: 'john@example.com' } })).toBeNull()
  })

  it('should generate user-friendly display names', () => {
    const oauthSession = {
      user: { name: 'John Doe' }
    }
    
    const walletSession = {
      user: { 
        name: 'Wallet 0x742d…4d8b6',
        email: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6@wallet.user'
      }
    }

    expect(getUserDisplayName(oauthSession)).toBe('John Doe')
    expect(getUserDisplayName(walletSession)).toBe('Wallet 0x742d…4d8b6')
  })
})