import { ConductorIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode } from '@/blocks/types'

/**
 * Conductor Block - Sim Studio Custom Block
 * 
 * Integrates with Conductor-USER service to:
 * - Send @mentions to Cursor/Codex in Slack threads
 * - Click "Open in Cursor" links via browser automation
 * - Support human-in-the-loop checkpoints
 * - Poll for completion signals
 */

export const ConductorBlock: BlockConfig = {
  type: 'conductor',
  name: 'Conductor',
  description: 'Control Slack @mentions and Cursor IDE via Conductor-USER browser automation',
  longDescription:
    'Integrate with Conductor-USER service to send @mentions to Cursor or Codex bots in Slack threads, click "Open in Cursor" links, and manage human-in-the-loop checkpoints. Requires Conductor-USER Node.js service running.',
  docsLink: 'https://docs.sim.ai/tools/conductor',
  category: 'tools',
  bgColor: '#4A154B',
  icon: ConductorIcon,
  authMode: AuthMode.None,

  subBlocks: [
    // Connection
    {
      id: 'conductorUrl',
      title: 'Conductor Service URL',
      type: 'short-input',
      placeholder: 'http://localhost:3000',
      required: true,
      description: 'URL of the Conductor-USER service',
    },

    // Action selector
    {
      id: 'action',
      title: 'Action',
      type: 'dropdown',
      options: [
        { label: 'Send @mention', id: 'send_mention' },
        { label: 'Click Cursor Link', id: 'click_cursor_link' },
        { label: 'Human Checkpoint', id: 'human_checkpoint' },
        { label: 'Wait for Signal', id: 'wait_for_signal' },
        { label: 'Get Thread Status', id: 'get_status' },
      ],
      value: () => 'send_mention',
    },

    // Slack Context (usually from trigger)
    {
      id: 'channelId',
      title: 'Slack Channel ID',
      type: 'short-input',
      placeholder: 'C1234567890',
      required: true,
      description: 'Slack channel ID (from trigger or manual)',
    },
    {
      id: 'threadTs',
      title: 'Thread Timestamp',
      type: 'short-input',
      placeholder: '1234567890.123456',
      required: true,
      description: 'Thread timestamp for reply threading',
    },

    // Send @mention fields
    {
      id: 'mentionTarget',
      title: 'Mention Target',
      type: 'dropdown',
      options: [
        { label: '@cursor', id: '@cursor' },
        { label: '@codex', id: '@codex' },
        { label: '@user (custom)', id: 'custom' },
      ],
      condition: { field: 'action', value: 'send_mention' },
      value: () => '@cursor',
    },
    {
      id: 'customMention',
      title: 'Custom Mention',
      type: 'short-input',
      placeholder: '@username',
      condition: { 
        field: 'mentionTarget', 
        value: 'custom',
        and: { field: 'action', value: 'send_mention' }
      },
    },
    {
      id: 'messageText',
      title: 'Message Text',
      type: 'long-input',
      placeholder: 'Implement the login validation feature on branch feature/JIRA-123...',
      condition: { field: 'action', value: 'send_mention' },
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `Generate a clear, concise Slack message for the Cursor AI coding assistant.
The message should include:
1. The task to perform
2. Branch name to work on
3. Any specific requirements or context

Be direct and specific. Output only the message text.`,
        placeholder: 'Describe what Cursor should implement...',
      },
    },
    {
      id: 'requireApproval',
      title: 'Require Human Approval',
      type: 'switch',
      description: 'Pause workflow and wait for @conductor approve/reject',
      condition: { field: 'action', value: 'send_mention' },
    },

    // Click Cursor Link fields
    {
      id: 'cursorLinkUrl',
      title: 'Cursor Link URL',
      type: 'short-input',
      placeholder: 'https://cursor.com/agents?selectedBcId=...',
      condition: { field: 'action', value: 'click_cursor_link' },
      required: true,
      description: 'The "Open in Cursor" link from Cursor Cloud Agent',
    },

    // Human Checkpoint fields
    {
      id: 'checkpointMessage',
      title: 'Checkpoint Message',
      type: 'long-input',
      placeholder: 'Ready to create PR. Review the changes and confirm?',
      condition: { field: 'action', value: 'human_checkpoint' },
      required: true,
      description: 'Message shown to user in Slack',
    },
    {
      id: 'timeoutMinutes',
      title: 'Timeout (minutes)',
      type: 'short-input',
      placeholder: '60',
      condition: { field: 'action', value: 'human_checkpoint' },
      value: () => '60',
    },

    // Wait for Signal fields
    {
      id: 'signalPatterns',
      title: 'Completion Signals',
      type: 'long-input',
      placeholder: 'implementation complete\nall tests passing\nready for review',
      condition: { field: 'action', value: 'wait_for_signal' },
      required: true,
      description: 'One pattern per line. Regex supported.',
    },
    {
      id: 'maxWaitMinutes',
      title: 'Maximum Wait (minutes)',
      type: 'short-input',
      placeholder: '30',
      condition: { field: 'action', value: 'wait_for_signal' },
      value: () => '30',
    },
    {
      id: 'pollIntervalSeconds',
      title: 'Poll Interval (seconds)',
      type: 'short-input',
      placeholder: '30',
      condition: { field: 'action', value: 'wait_for_signal' },
      value: () => '30',
    },
    {
      id: 'postStatusUpdates',
      title: 'Post Status Updates to Slack',
      type: 'switch',
      condition: { field: 'action', value: 'wait_for_signal' },
    },
  ],

  tools: {
    access: ['conductor_slack_actor'],
    config: {
      tool: () => 'conductor_slack_actor',
      params: (params) => {
        const { conductorUrl, action, channelId, threadTs, ...rest } = params

        const baseParams = {
          conductorUrl,
          action,
          channelId,
          threadTs,
        }

        switch (action) {
          case 'send_mention': {
            const mention = rest.mentionTarget === 'custom' 
              ? rest.customMention 
              : rest.mentionTarget
            
            return {
              ...baseParams,
              mention,
              messageText: rest.messageText,
              requireHumanConfirmation: rest.requireApproval === true,
            }
          }

          case 'click_cursor_link': {
            return {
              ...baseParams,
              cursorLinkUrl: rest.cursorLinkUrl,
            }
          }

          case 'human_checkpoint': {
            return {
              ...baseParams,
              checkpointMessage: rest.checkpointMessage,
              timeoutMinutes: parseInt(rest.timeoutMinutes || '60', 10),
            }
          }

          case 'wait_for_signal': {
            const patterns = (rest.signalPatterns || '')
              .split('\n')
              .map((p: string) => p.trim())
              .filter((p: string) => p.length > 0)
            
            return {
              ...baseParams,
              signalPatterns: patterns,
              maxWaitMinutes: parseInt(rest.maxWaitMinutes || '30', 10),
              pollIntervalSeconds: parseInt(rest.pollIntervalSeconds || '30', 10),
              postStatusUpdates: rest.postStatusUpdates === true,
            }
          }

          case 'get_status': {
            return baseParams
          }

          default:
            throw new Error(`Unknown Conductor action: ${action}`)
        }
      },
    },
  },

  inputs: {
    conductorUrl: { type: 'string', description: 'Conductor-USER service URL' },
    action: { type: 'string', description: 'Action to perform' },
    channelId: { type: 'string', description: 'Slack channel ID' },
    threadTs: { type: 'string', description: 'Thread timestamp' },
    // send_mention inputs
    mentionTarget: { type: 'string', description: 'Who to mention' },
    customMention: { type: 'string', description: 'Custom mention text' },
    messageText: { type: 'string', description: 'Message content' },
    requireApproval: { type: 'boolean', description: 'Require human approval' },
    // click_cursor_link inputs
    cursorLinkUrl: { type: 'string', description: 'Cursor link URL' },
    // human_checkpoint inputs
    checkpointMessage: { type: 'string', description: 'Checkpoint message' },
    timeoutMinutes: { type: 'string', description: 'Timeout in minutes' },
    // wait_for_signal inputs
    signalPatterns: { type: 'string', description: 'Completion signal patterns' },
    maxWaitMinutes: { type: 'string', description: 'Maximum wait time' },
    pollIntervalSeconds: { type: 'string', description: 'Poll interval' },
    postStatusUpdates: { type: 'boolean', description: 'Post status to Slack' },
  },

  outputs: {
    // Common outputs
    success: { type: 'boolean', description: 'Whether action succeeded' },
    messageId: { type: 'string', description: 'Slack message ID (if applicable)' },
    
    // send_mention outputs
    queued: { type: 'boolean', description: 'Whether message is queued for approval' },
    
    // click_cursor_link outputs
    sessionId: { type: 'string', description: 'Cursor session ID' },
    
    // wait_for_signal outputs
    completionSignal: { type: 'string', description: 'Detected completion signal' },
    elapsedMinutes: { type: 'number', description: 'Time waited in minutes' },
    
    // get_status outputs
    threadStatus: { type: 'string', description: 'Thread status' },
    cursorSessionId: { type: 'string', description: 'Cursor session ID' },
    lastActivity: { type: 'string', description: 'Last activity timestamp' },
  },
}
