import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { createLogger } from '@/lib/logs/console/logger'
import type { PermissionType, WorkspacePermissions } from '@/hooks/use-workspace-permissions'

const logger = createLogger('useUserPermissions')

export interface WorkspaceUserPermissions {
  // Core permission checks
  canRead: boolean
  canEdit: boolean
  canAdmin: boolean

  // Utility properties
  userPermissions: PermissionType
  isLoading: boolean
  error: string | null
}

/**
 * Custom hook to check current user's permissions within a workspace
 * This version accepts workspace permissions to avoid duplicate API calls
 *
 * @param workspacePermissions - The workspace permissions data
 * @param permissionsLoading - Whether permissions are currently loading
 * @param permissionsError - Any error from fetching permissions
 * @returns Object containing permission flags and utility properties
 */
export function useUserPermissions(
  workspacePermissions: WorkspacePermissions | null,
  permissionsLoading = false,
  permissionsError: string | null = null
): WorkspaceUserPermissions {
  const { data: session } = useSession()
  const [meEmail, setMeEmail] = useState<string | null>(null)

  function getSiweEmailFromCookie(): string | null {
    if (typeof document === 'undefined') return null
    try {
      const cookie = document.cookie
        .split('; ')
        .find((row) => row.startsWith('siwe_session='))
        ?.split('=')[1]
      if (!cookie) return null
      // base64url decode
      const base64 = cookie.replace(/-/g, '+').replace(/_/g, '/')
      const padded = base64 + '==='.slice((base64.length + 3) % 4)
      const json = atob(padded)
      const parsed = JSON.parse(json) as { addr?: string; uid?: string }
      if (parsed?.addr) {
        return `${parsed.addr.toLowerCase()}@wallet.user`
      }
      return null
    } catch {
      return null
    }
  }

  // Load identity from server (supports SIWE) when session email is absent
  useEffect(() => {
    let cancelled = false
    async function loadMe() {
      if (session?.user?.email) {
        setMeEmail(session.user.email)
        return
      }
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as {
          userId: string | null
          email: string | null
        }
        if (!cancelled) setMeEmail(data.email)
      } catch {
        // ignore
      }
    }
    loadMe()
    return () => {
      cancelled = true
    }
  }, [session?.user?.email])

  const userPermissions = useMemo((): WorkspaceUserPermissions => {
    const effectiveEmail = session?.user?.email || meEmail || getSiweEmailFromCookie()
    // If still loading or no identity, return safe defaults
    if (permissionsLoading || !effectiveEmail) {
      return {
        canRead: false,
        canEdit: false,
        canAdmin: false,
        userPermissions: 'read',
        isLoading: permissionsLoading,
        error: permissionsError,
      }
    }

    // Find current user in workspace permissions (case-insensitive)
    const currentUser = workspacePermissions?.users?.find(
      (user) => user.email.toLowerCase() === effectiveEmail.toLowerCase()
    )

    // If user not found in workspace, they have no permissions
    if (!currentUser) {
      logger.warn('User not found in workspace permissions', {
        userEmail: effectiveEmail,
        hasPermissions: !!workspacePermissions,
        userCount: workspacePermissions?.users?.length || 0,
      })

      return {
        canRead: false,
        canEdit: false,
        canAdmin: false,
        userPermissions: 'read',
        isLoading: false,
        error: permissionsError || 'User not found in workspace',
      }
    }

    const userPerms = currentUser.permissionType || 'read'

    // Core permission checks
    const canAdmin = userPerms === 'admin'
    const canEdit = userPerms === 'write' || userPerms === 'admin'
    const canRead = true // If user is found in workspace permissions, they have read access

    return {
      canRead,
      canEdit,
      canAdmin,
      userPermissions: userPerms,
      isLoading: false,
      error: permissionsError,
    }
  }, [session, meEmail, workspacePermissions, permissionsLoading, permissionsError])

  return userPermissions
}
