'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSession } from '@/lib/auth-client'

/**
 * Workspace entity interface
 */
interface Workspace {
  id: string
  name: string
  ownerId: string
  role?: string
}

/**
 * Main WorkspaceHeader component props
 */
interface WorkspaceHeaderProps {
  onCreateWorkflow: () => void
  isWorkspaceSelectorVisible: boolean
  onToggleWorkspaceSelector: () => void
  onToggleSidebar: () => void
  activeWorkspace: Workspace | null
  isWorkspacesLoading: boolean
}

/**
 * WorkspaceHeader component - Single row header with all elements
 */
export const WorkspaceHeader = React.memo<WorkspaceHeaderProps>(
  ({
    onCreateWorkflow,
    isWorkspaceSelectorVisible,
    onToggleWorkspaceSelector,
    onToggleSidebar,
    activeWorkspace,
    isWorkspacesLoading,
  }) => {
    // External hooks
    const { data: sessionData } = useSession()
    const [isClientLoading, setIsClientLoading] = useState(true)
    const [walletAddress, setWalletAddress] = useState<string | null>(null)

    // Computed values
    const userName = useMemo(
      () => sessionData?.user?.name || sessionData?.user?.email || 'User',
      [sessionData?.user?.name, sessionData?.user?.email]
    )

    const truncateAddress = (addr: string): string => {
      if (!addr) return ''
      const a = addr.startsWith('0x') ? addr : `0x${addr}`
      return `${a.slice(0, 6)}…${a.slice(-4)}`
    }

    const displayName = useMemo(() => {
      if (walletAddress) {
        return truncateAddress(walletAddress)
      }
      return activeWorkspace?.name || `${userName}'s Workspace`
    }, [walletAddress, activeWorkspace?.name, userName])

    // Effects
    useEffect(() => {
      setIsClientLoading(false)
    }, [])

    // Load connected wallet address for display in header
    useEffect(() => {
      let cancelled = false
      async function loadWallet() {
        try {
          const res = await fetch('/api/auth/me', { credentials: 'include' })
          if (!res.ok) return
          const data = (await res.json()) as {
            userId: string | null
            email: string | null
            walletAddress: string | null
          }
          if (!cancelled) {
            setWalletAddress(data.walletAddress || null)
          }
        } catch {
          // ignore
        }
      }
      loadWallet()
      return () => {
        cancelled = true
      }
    }, [])

    // Handle header click to toggle workspace selector
    const handleHeaderClick = useCallback(() => {
      onToggleWorkspaceSelector()
    }, [onToggleWorkspaceSelector])

    // Handle sidebar toggle click
    const handleSidebarToggle = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation() // Prevent header click
        onToggleSidebar()
      },
      [onToggleSidebar]
    )

    // Render loading state
    const renderLoadingState = () => (
      <>
        {/* Loading workspace name - matches actual layout */}
        <div className='flex min-w-0 flex-1 items-center pl-1'>
          <Skeleton className='h-4 w-24' />
        </div>

        {/* Chevron - actual element, not skeleton */}
        <div className='flex h-5 w-5 items-center justify-center text-muted-foreground'>
          {!isWorkspaceSelectorVisible ? (
            <ChevronUp className='h-4 w-4' />
          ) : (
            <ChevronDown className='h-4 w-4' />
          )}
        </div>

        {/* Toggle Sidebar - actual element, not skeleton */}
        <Button
          variant='ghost'
          size='icon'
          className='h-6 w-6 text-muted-foreground hover:bg-secondary'
          disabled
        >
          <PanelLeft className='h-4 w-4' />
        </Button>
      </>
    )

    // Render workspace info
    const renderWorkspaceInfo = () => (
      <>
        {/* Wallet Address (preferred) or Workspace Name - Display only */}
        <div className='flex min-w-0 flex-1 items-center pl-1'>
          <span
            className='truncate font-medium text-sm leading-none'
            style={{
              minHeight: '1rem',
              lineHeight: '1rem',
            }}
          >
            {displayName}
          </span>
        </div>

        {/* Chevron - Display only */}
        <div className='flex h-5 w-5 items-center justify-center text-muted-foreground'>
          {!isWorkspaceSelectorVisible ? (
            <ChevronUp className='h-4 w-4' />
          ) : (
            <ChevronDown className='h-4 w-4' />
          )}
        </div>

        {/* Toggle Sidebar - with gap-1 from chevron */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              onClick={handleSidebarToggle}
              className='h-6 w-6 text-muted-foreground hover:bg-secondary'
            >
              <PanelLeft className='h-4 w-4' />
            </Button>
          </TooltipTrigger>
          <TooltipContent side='bottom'>Toggle sidebar</TooltipContent>
        </Tooltip>
      </>
    )

    // Main render - using h-12 to match control bar height
    return (
      <div className='h-12 rounded-[10px] border bg-background shadow-xs'>
        <div
          className='flex h-full cursor-pointer items-center gap-1 rounded-[10px] pr-[10px] pl-3 transition-colors hover:bg-muted/50'
          onClick={handleHeaderClick}
        >
          {isClientLoading || isWorkspacesLoading ? renderLoadingState() : renderWorkspaceInfo()}
        </div>
      </div>
    )
  }
)

WorkspaceHeader.displayName = 'WorkspaceHeader'
