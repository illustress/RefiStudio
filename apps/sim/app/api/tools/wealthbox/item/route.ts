import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { checkHybridAuth } from '@/lib/auth/hybrid'
import { createLogger } from '@/lib/logs/console/logger'
import { refreshAccessTokenIfNeeded } from '@/app/api/auth/oauth/utils'
import { db } from '@/db'
import { account } from '@/db/schema'

export const dynamic = 'force-dynamic'

const logger = createLogger('WealthboxItemAPI')

/**
 * Get a single item (note, contact, task) from Wealthbox
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)

  try {
    // Get the session
    const auth = await checkHybridAuth(request as any)

    // Check if the user is authenticated
    if (!auth?.success || !auth.userId) {
      logger.warn(`[${requestId}] Unauthenticated request rejected`)
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    // Get parameters from query
    const { searchParams } = new URL(request.url)
    const credentialId = searchParams.get('credentialId')
    const itemId = searchParams.get('itemId')
    const type = searchParams.get('type') || 'note'

    if (!credentialId || !itemId) {
      logger.warn(`[${requestId}] Missing required parameters`, {
        credentialId,
        itemId,
      })
      return NextResponse.json({ error: 'Credential ID and Item ID are required' }, { status: 400 })
    }

    // Validate item type
    if (!['note', 'contact', 'task'].includes(type)) {
      logger.warn(`[${requestId}] Invalid item type: ${type}`)
      return NextResponse.json({ error: 'Invalid item type' }, { status: 400 })
    }

    // Get the credential from the database
    const credentials = await db.select().from(account).where(eq(account.id, credentialId)).limit(1)

    if (!credentials.length) {
      logger.warn(`[${requestId}] Credential not found`, { credentialId })
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    }

    const credential = credentials[0]

    // Check if the credential belongs to the user
    if (credential.userId !== auth.userId) {
      logger.warn(`[${requestId}] Unauthorized credential access attempt`, {
        credentialUserId: credential.userId,
        requestUserId: auth.userId,
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Refresh access token if needed
    const accessToken = await refreshAccessTokenIfNeeded(credentialId, auth.userId!, requestId)

    if (!accessToken) {
      logger.error(`[${requestId}] Failed to obtain valid access token`)
      return NextResponse.json({ error: 'Failed to obtain valid access token' }, { status: 401 })
    }

    // Determine the endpoint based on item type
    const endpoints = {
      note: 'notes',
      contact: 'contacts',
      task: 'tasks',
    }
    const endpoint = endpoints[type as keyof typeof endpoints]

    logger.info(`[${requestId}] Fetching ${type} ${itemId} from Wealthbox`)

    // Make request to Wealthbox API
    const response = await fetch(`https://api.crmworkspace.com/v1/${endpoint}/${itemId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(
        `[${requestId}] Wealthbox API error: ${response.status} ${response.statusText}`,
        {
          error: errorText,
          endpoint,
          itemId,
        }
      )

      if (response.status === 404) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 })
      }

      return NextResponse.json(
        { error: `Failed to fetch ${type} from Wealthbox` },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Transform the response to match our expected format
    const item = {
      id: data.id?.toString() || itemId,
      name:
        data.content || data.name || `${data.first_name} ${data.last_name}` || `${type} ${data.id}`,
      type,
      content: data.content || '',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }

    logger.info(`[${requestId}] Successfully fetched ${type} ${itemId} from Wealthbox`)

    return NextResponse.json({ item }, { status: 200 })
  } catch (error) {
    logger.error(`[${requestId}] Error fetching Wealthbox item`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
