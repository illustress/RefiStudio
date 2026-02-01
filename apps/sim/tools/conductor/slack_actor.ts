import type { ToolConfig } from '@/tools/types'

/**
 * Conductor Slack Actor Tool
 * 
 * Communicates with Conductor-USER service to perform
 * browser automation actions in Slack.
 */

export const conductorSlackActorTool: ToolConfig<any, any> = {
  id: 'conductor_slack_actor',
  name: 'Conductor Slack Actor',
  description:
    'Send @mentions to Cursor/Codex in Slack threads, click Cursor links, and manage human-in-the-loop checkpoints via Conductor-USER browser automation.',
  version: '1.0.0',

  params: {
    conductorUrl: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'URL of the Conductor-USER service',
    },
    apiKey: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'API key for Conductor-USER authentication (optional if set in env)',
    },
    action: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Action to perform',
    },
    channelId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Slack channel ID',
    },
    threadTs: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Thread timestamp',
    },
    // send_mention params
    mention: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Mention target',
    },
    messageText: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Message text to send',
    },
    requireHumanConfirmation: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description: 'Require human approval before sending',
    },
    // click_cursor_link params
    cursorLinkUrl: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Cursor link URL to click',
    },
    // human_checkpoint params
    checkpointMessage: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Checkpoint message to show',
    },
    timeoutMinutes: {
      type: 'number',
      required: false,
      visibility: 'user-only',
      description: 'Timeout for human response',
    },
    // wait_for_signal params
    signalPatterns: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Array of regex patterns for completion detection',
    },
    maxWaitMinutes: {
      type: 'number',
      required: false,
      visibility: 'user-only',
      description: 'Maximum time to wait',
    },
    pollIntervalSeconds: {
      type: 'number',
      required: false,
      visibility: 'user-only',
      description: 'Poll interval in seconds',
    },
    postStatusUpdates: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description: 'Post status updates to Slack',
    },
  },

  request: {
    url: (params) => {
      const baseUrl = params.conductorUrl.replace(/\/$/, '')
      
      switch (params.action) {
        case 'send_mention':
          return `${baseUrl}/api/slack/send-mention`
        case 'click_cursor_link':
          return `${baseUrl}/api/cursor/click-link`
        case 'human_checkpoint':
          return `${baseUrl}/api/human_checkpoint`
        case 'wait_for_signal':
          return `${baseUrl}/api/wait_for_signal`
        case 'get_status':
          return `${baseUrl}/api/thread/${params.threadTs}/status`
        default:
          return `${baseUrl}/api/${params.action}`
      }
    },
    method: (params) => {
      return params.action === 'get_status' ? 'GET' : 'POST'
    },
    headers: (params) => ({
      'Content-Type': 'application/json',
      'X-API-Key': params.apiKey || process.env.CONDUCTOR_API_KEY || '',
    }),
    body: (params) => {
      const { conductorUrl, action, apiKey, channelId, threadTs, messageText, cursorLinkUrl, checkpointMessage, signalPatterns, ...rest } = params
      
      // Map camelCase keys to snake_case keys that Conductor-USER expects
      const mappedParams: Record<string, any> = {
        ...rest,
        action,
      }
      
      if (channelId !== undefined) mappedParams.channel = channelId
      if (threadTs !== undefined) mappedParams.thread_ts = threadTs
      if (messageText !== undefined) mappedParams.text = messageText
      if (cursorLinkUrl !== undefined) mappedParams.linkUrl = cursorLinkUrl
      if (checkpointMessage !== undefined) mappedParams.checkpointMessage = checkpointMessage
      if (signalPatterns !== undefined) mappedParams.signalPatterns = signalPatterns
      
      return mappedParams
    },

  transformResponse: async (response) => {
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.error || `Conductor error: ${response.status}`)
    }
    
    return {
      success: true,
      output: data,
    }
  },

  outputs: {
    success: {
      type: 'boolean',
      description: 'Whether the action succeeded',
    },
    messageId: {
      type: 'string',
      description: 'Slack message ID',
    },
    queued: {
      type: 'boolean',
      description: 'Whether message is queued for approval',
    },
    sessionId: {
      type: 'string',
      description: 'Cursor session ID',
    },
    completionSignal: {
      type: 'string',
      description: 'Detected completion signal',
    },
    elapsedMinutes: {
      type: 'number',
      description: 'Elapsed time in minutes',
    },
    threadStatus: {
      type: 'string',
      description: 'Thread status',
    },
    cursorSessionId: {
      type: 'string',
      description: 'Cursor session ID',
    },
    lastActivity: {
      type: 'string',
      description: 'Last activity timestamp',
    },
  },
}
