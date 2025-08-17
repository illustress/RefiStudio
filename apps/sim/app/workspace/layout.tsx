'use client'

import { useEffect } from 'react'
import { useSession } from '@/lib/auth-client'
import { SocketProvider } from '@/contexts/socket-context'
import { useRouter } from 'next/navigation'

interface WorkspaceRootLayoutProps {
  children: React.ReactNode
}

export default function WorkspaceRootLayout({ children }: WorkspaceRootLayoutProps) {
  const session = useSession()
  const user = session.data?.user
    ? {
        id: session.data.user.id,
        name: session.data.user.name,
        email: session.data.user.email,
      }
    : undefined

  return (
    <SocketProvider user={user}>
      <WalletConnectionGuard />
      {children}
    </SocketProvider>
  )
}

function WalletConnectionGuard() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me', {
          cache: 'no-store',
          credentials: 'include',
        })
        if (!res.ok) return
        const me = (await res.json()) as {
          userId: string | null
          email: string | null
          walletAddress: string | null
        }
        if (me?.walletAddress) {
          const provider: any = (globalThis as any).ethereum
          let accounts: string[] = []
          try {
            if (provider?.request) {
              accounts = await provider.request({ method: 'eth_accounts' })
            }
          } catch {}
          const isConnected = Array.isArray(accounts) && accounts.length > 0
          if (!isConnected && !cancelled) {
            try {
              await fetch('/api/auth/siwe/logout', {
                method: 'POST',
                credentials: 'include',
              })
            } catch {}
            router.replace('/login?disconnected=1')
          }
        }
      } catch {}
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  return null
}
