'use client'

import { useState } from 'react'
import { siweClient } from '@better-auth/siwe/client'
import { createLogger } from '@sim/logger'
import { createAuthClient } from 'better-auth/client'
import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getEnv } from '@/lib/core/config/env'
import { getBaseUrl } from '@/lib/core/utils/urls'

const logger = createLogger('PulseChainLogin')

const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [siweClient()],
})

interface PulseChainLoginProps {}

/**
 * This component renders a PulseChain SIWE login flow using Better Auth.
 */
export function PulseChainLogin(props: PulseChainLoginProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const nonFungibleTokenContractAddress = getEnv('NEXT_PUBLIC_NFT_CONTRACT')
  const contractPreview = nonFungibleTokenContractAddress
    ? `${nonFungibleTokenContractAddress.slice(0, 16)}...`
    : 'Not configured'

  const normalizeAuthError = (error: unknown): { code?: string | number; message?: string } => {
    if (error && typeof error === 'object') {
      const errorCode = 'code' in error ? (error as { code?: string | number }).code : undefined
      const errorMessage =
        'message' in error ? (error as { message?: string }).message : undefined
      return { code: errorCode, message: errorMessage }
    }
    return { message: undefined }
  }

  const handleAuthError = (error: unknown) => {
    /**
     * Step 1: Normalize the error shape for consistent messaging.
     */
    const normalizedError = normalizeAuthError(error)

    /**
     * Step 2: Map error codes to user-facing messages.
     */
    if (normalizedError.code === 'NO_NFT_PULSECHAIN') {
      setErrorMessage(
        `Access denied. Your wallet does not hold the required non-fungible token on PulseChain. Contract: ${contractPreview}`
      )
    } else if (normalizedError.code === 4001 || normalizedError.code === '4001') {
      setErrorMessage('You rejected the signature request.')
    } else {
      setErrorMessage(normalizedError.message || 'Authentication failed.')
    }

    logger.error('PulseChain login error', { error })
  }

  const handleLogin = async () => {
    /**
     * Step 1: Initialize UI state for the sign-in attempt.
     */
    setIsLoading(true)
    setErrorMessage(null)

    try {
      /**
       * Step 2: Request SIWE sign-in through Better Auth.
       */
      const result = await authClient.signIn.social({
        provider: 'siwe',
        callbackURL: '/dashboard',
      })

      if (result?.error) {
        handleAuthError(result.error)
        return
      }
    } catch (error) {
      handleAuthError(error)
    } finally {
      /**
       * Step 3: Reset loading state after completion.
       */
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4 w-full max-w-md">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Sim Studio</h1>
          <p className="text-muted-foreground">NFT-gated access on PulseChain</p>
        </div>

        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription className="text-sm">{errorMessage}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full h-12"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying non-fungible token...
            </>
          ) : (
            <>
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 12l10 10 10-10L12 2z" />
              </svg>
              Connect PulseChain wallet
            </>
          )}
        </Button>

        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>Requires MetaMask on PulseChain (Chain ID: 369)</p>
          <p>Non-fungible token: {contractPreview}</p>
        </div>
    </div>
  )
}
