import { getOAuthProviderStatus } from '@/app/(auth)/components/oauth-provider-checker'
import LoginForm from '@/app/(auth)/login/login-form'
import { PulseChainLogin } from '@/components/auth/pulsechain-login'
import { getEnv } from '@/lib/core/config/env'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const nonFungibleTokenContractAddress = getEnv('NEXT_PUBLIC_NFT_CONTRACT')

  if (nonFungibleTokenContractAddress) {
    return <PulseChainLogin />
  }

  const { githubAvailable, googleAvailable, isProduction } = await getOAuthProviderStatus()

  return (
    <LoginForm
      githubAvailable={githubAvailable}
      googleAvailable={googleAvailable}
      isProduction={isProduction}
    />
  )
}
