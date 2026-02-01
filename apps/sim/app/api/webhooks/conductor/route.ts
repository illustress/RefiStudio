import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateRequestId } from '@/lib/core/utils/request'

/**
 * Conductor Webhook Handler
 * 
 * Receives commands from Conductor-USER service when users
 * mention @conductor in Slack threads.
 */

export const dynamic = 'force-dynamic'

const logger = createLogger('ConductorWebhook')

// Validation schema
const ConductorCommandSchema = z.object({
  event: z.literal('conductor_command'),
  command: z.enum(['start', 'status', 'pause', 'resume', 'approve', 'reject', 'help']),
  args: z.record(z.string()),
  storyId: z.string().optional(),
  user: z.string(),
  channel: z.string(),
  thread_ts: z.string(),
  text: z.string(),
})

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  
  try {
    // Verify webhook secret (ALWAYS required for security)
    const authHeader = request.headers.get('authorization')
    const expectedSecret = process.env.CONDUCTOR_WEBHOOK_SECRET
    
    // STRICT: Secret must be set and must match
    if (!expectedSecret) {
      logger.error(`[${requestId}] CONDUCTOR_WEBHOOK_SECRET not configured`)
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }
    
    if (authHeader !== `Bearer ${expectedSecret}`) {
      logger.warn(`[${requestId}] Unauthorized webhook attempt - invalid or missing bearer token`)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Parse and validate body
    const body = await request.json()
    const validatedData = ConductorCommandSchema.parse(body)
    
    logger.info(`[${requestId}] Received Conductor command`, {
      command: validatedData.command,
      storyId: validatedData.storyId,
      user: validatedData.user,
      channel: validatedData.channel,
      thread_ts: validatedData.thread_ts,
    })
    
    // Handle different commands
    switch (validatedData.command) {
      case 'start':
        return handleStartCommand(validatedData, requestId)
        
      case 'status':
        return handleStatusCommand(validatedData, requestId)
        
      case 'pause':
        return handlePauseCommand(validatedData, requestId)
        
      case 'resume':
        return handleResumeCommand(validatedData, requestId)
        
      case 'approve':
        return handleApproveCommand(validatedData, requestId)
        
      case 'reject':
        return handleRejectCommand(validatedData, requestId)
        
      case 'help':
        return handleHelpCommand(validatedData, requestId)
        
      default:
        return NextResponse.json(
          { error: 'Unknown command' },
          { status: 400 }
        )
    }
    
  } catch (error) {
    logger.error(`[${requestId}] Error processing Conductor webhook:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Command handlers

async function handleStartCommand(data: z.infer<typeof ConductorCommandSchema>, requestId: string) {
  if (!data.storyId) {
    return NextResponse.json(
      { error: 'Story ID required for start command' },
      { status: 400 }
    )
  }
  
  logger.info(`[${requestId}] Starting workflow for story ${data.storyId}`)
  
  // Return success - actual workflow trigger would be implemented
  // based on Sim Studio's internal job queue system
  
  return NextResponse.json({
    success: true,
    message: `Started workflow for ${data.storyId}`,
    workflowId: `conductor-${data.storyId}-${Date.now()}`,
    context: {
      storyId: data.storyId,
      channel: data.channel,
      thread_ts: data.thread_ts,
      user: data.user,
    }
  })
}

async function handleStatusCommand(data: z.infer<typeof ConductorCommandSchema>, requestId: string) {
  logger.info(`[${requestId}] Getting status for thread ${data.thread_ts}`)
  
  return NextResponse.json({
    success: true,
    status: 'running',
    thread_ts: data.thread_ts,
    message: 'Workflow is running',
  })
}

async function handlePauseCommand(data: z.infer<typeof ConductorCommandSchema>, requestId: string) {
  logger.info(`[${requestId}] Pausing workflow for thread ${data.thread_ts}`)
  
  return NextResponse.json({
    success: true,
    status: 'paused',
    message: 'Workflow paused',
  })
}

async function handleResumeCommand(data: z.infer<typeof ConductorCommandSchema>, requestId: string) {
  logger.info(`[${requestId}] Resuming workflow for thread ${data.thread_ts}`)
  
  return NextResponse.json({
    success: true,
    status: 'running',
    message: 'Workflow resumed',
  })
}

async function handleApproveCommand(data: z.infer<typeof ConductorCommandSchema>, requestId: string) {
  logger.info(`[${requestId}] Human approval received for thread ${data.thread_ts}`)
  
  return NextResponse.json({
    success: true,
    status: 'approved',
    message: 'Checkpoint approved',
  })
}

async function handleRejectCommand(data: z.infer<typeof ConductorCommandSchema>, requestId: string) {
  logger.info(`[${requestId}] Human rejection received for thread ${data.thread_ts}`)
  
  return NextResponse.json({
    success: true,
    status: 'rejected',
    message: 'Checkpoint rejected',
  })
}

async function handleHelpCommand(data: z.infer<typeof ConductorCommandSchema>, requestId: string) {
  const helpText = `
*Conductor Commands:*
• \`@conductor start STORY-123\` - Start a new workflow
• \`@conductor status\` - Check workflow status
• \`@conductor pause\` - Pause autonomous actions
• \`@conductor resume\` - Resume workflow
• \`@conductor approve\` - Approve checkpoint
• \`@conductor reject\` - Reject checkpoint
  `.trim()
  
  return NextResponse.json({
    success: true,
    helpText,
  })
}
