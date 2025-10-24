# Session Refactoring: Seamless SIWE Integration

## Overview

The `getSession()` function has been refactored to seamlessly support both traditional OAuth authentication (GitHub, Google) and crypto wallet authentication (SIWE) without requiring any changes to existing route handlers.

## What Changed

### Before
```typescript
export async function getSession() {
  return await auth.api.getSession({
    headers: await headers(),
  })
}
```

### After
```typescript
export async function getSession() {
  // Step 1: Try Better Auth session first (for OAuth users)
  const betterAuthSession = await auth.api.getSession({
    headers: await headers(),
  })
  
  // If Better Auth session exists, return it
  if (betterAuthSession?.user?.id) {
    return betterAuthSession
  }
  
  // Step 2: Fallback to SIWE session (for crypto wallet users)
  try {
    const { decodeAndVerifySiweCookie } = await import('@/lib/auth/siwe-cookie')
    const headersList = await headers()
    const cookieHeader = headersList.get('cookie')
    
    if (cookieHeader) {
      // Extract siwe_session cookie value
      const cookies = cookieHeader.split(';').map(c => c.trim())
      const siweCookie = cookies.find(c => c.startsWith('siwe_session='))
      
      if (siweCookie) {
        const cookieValue = siweCookie.split('=')[1]
        const siwePayload = decodeAndVerifySiweCookie(cookieValue)
        
        if (siwePayload?.uid) {
          // Return a session object that matches Better Auth format
          return {
            user: {
              id: siwePayload.uid,
              email: `${siwePayload.addr}@wallet.user`,
              name: `Wallet ${siwePayload.addr.slice(0, 6)}…${siwePayload.addr.slice(-4)}`,
              image: null,
              emailVerified: true,
            },
            session: {
              id: `siwe_${siwePayload.uid}`,
              userId: siwePayload.uid,
              expiresAt: new Date(siwePayload.exp * 1000),
              token: 'siwe_session',
              createdAt: new Date(siwePayload.iat * 1000),
              updatedAt: new Date(siwePayload.iat * 1000),
            }
          }
        }
      }
    }
  } catch (error) {
    // Log error but don't throw - fall through to return null
    logger.debug('SIWE session fallback failed', { error })
  }
  
  // No valid session found
  return null
}
```

## Benefits

### 1. **Zero Breaking Changes**
- All existing route handlers continue to work unchanged
- No need to modify any `route.ts` files
- Existing tests continue to pass

### 2. **Seamless Integration**
- OAuth users get their normal session
- Wallet users get a compatible session object
- Both user types can use the same code paths

### 3. **Backward Compatibility**
- If Better Auth session exists, it takes priority
- SIWE is only used as a fallback
- No conflicts between authentication methods

## Session Object Structure

### OAuth User Session
```typescript
{
  user: {
    id: "user_1234567890_abc123",
    email: "john@example.com",
    name: "John Doe",
    image: "https://avatars.githubusercontent.com/...",
    emailVerified: true
  },
  session: {
    id: "session_abc123",
    userId: "user_1234567890_abc123",
    expiresAt: Date,
    token: "session_token",
    createdAt: Date,
    updatedAt: Date
  }
}
```

### Wallet User Session
```typescript
{
  user: {
    id: "user_1234567890_xyz789",
    email: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6@wallet.user",
    name: "Wallet 0x742d…4d8b6",
    image: null,
    emailVerified: true
  },
  session: {
    id: "siwe_user_1234567890_xyz789",
    userId: "user_1234567890_xyz789",
    expiresAt: Date,
    token: "siwe_session",
    createdAt: Date,
    updatedAt: Date
  }
}
```

## Utility Functions

New utility functions are available to work with hybrid sessions:

```typescript
import { isWalletUser, getWalletAddress, getUserDisplayName } from '@/lib/auth'

// Check if user is a wallet user
const isWallet = isWalletUser(session)

// Get wallet address for wallet users
const address = getWalletAddress(session) // "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"

// Get user-friendly display name
const displayName = getUserDisplayName(session) // "John Doe" or "Wallet 0x742d…4d8b6"
```

## Example Usage

### Route Handler (No Changes Required)
```typescript
// apps/sim/app/api/users/me/route.ts
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // This works for BOTH OAuth and wallet users
  return Response.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      isWalletUser: session.user.email?.includes('@wallet.user')
    }
  })
}
```

### Component (No Changes Required)
```typescript
// components/user-profile.tsx
import { getSession } from '@/lib/auth'

export async function UserProfile() {
  const session = await getSession()
  
  if (!session) {
    return <div>Please log in</div>
  }
  
  return (
    <div>
      <h1>Welcome, {session.user.name}!</h1>
      <p>Email: {session.user.email}</p>
    </div>
  )
}
```

## Migration Guide

### For Existing Code
**No changes required!** All existing code using `getSession()` will automatically work with both OAuth and wallet users.

### For New Features
Use the utility functions to handle wallet-specific logic:

```typescript
import { getSession, isWalletUser, getWalletAddress } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const response = {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name
  }
  
  // Add wallet-specific data if applicable
  if (isWalletUser(session)) {
    response.walletAddress = getWalletAddress(session)
    response.userType = 'wallet'
  } else {
    response.userType = 'oauth'
  }
  
  return Response.json(response)
}
```

## Testing

The refactored `getSession()` function maintains full backward compatibility:

- All existing tests continue to pass
- OAuth users get the same session object as before
- Wallet users get a compatible session object
- No breaking changes to the API

## Security Considerations

- SIWE sessions are cryptographically verified
- Session cookies are signed and time-limited
- Nonce system prevents replay attacks
- Domain validation ensures proper origin
- Fallback is only used when Better Auth session is not available