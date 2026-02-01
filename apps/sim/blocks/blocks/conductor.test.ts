import { describe, expect, it } from 'vitest'
import { ConductorBlock } from './conductor'

/**
 * Tests for Conductor Block
 * 
 * Covers:
 * - Block configuration validation
 * - Action routing
 * - Parameter validation
 * - Error handling
 */

describe('ConductorBlock', () => {
  describe('block configuration', () => {
    it('should have correct type and name', () => {
      expect(ConductorBlock.type).toBe('conductor')
      expect(ConductorBlock.name).toBe('Conductor')
    })

    it('should have correct category and auth mode', () => {
      expect(ConductorBlock.category).toBe('tools')
      expect(ConductorBlock.authMode).toBe('none')
    })

    it('should reference the correct tool', () => {
      expect(ConductorBlock.tools?.access).toContain('conductor_slack_actor')
    })
  })

  describe('tools.config.tool', () => {
    it('should always return conductor_slack_actor', () => {
      const toolId = ConductorBlock.tools?.config?.tool?.({ action: 'send_mention' })
      expect(toolId).toBe('conductor_slack_actor')
    })
  })

  describe('tools.config.params', () => {
    const baseParams = {
      conductorUrl: 'http://localhost:3000',
      channelId: 'C123',
      threadTs: '1234567890.123456',
    }

    it('should map send_mention action correctly', () => {
      const result = ConductorBlock.tools?.config?.params?.({
        ...baseParams,
        action: 'send_mention',
        mentionTarget: '@cursor',
        messageText: 'Implement this feature',
        requireApproval: true,
      })

      expect(result).toEqual({
        conductorUrl: 'http://localhost:3000',
        action: 'send_mention',
        channelId: 'C123',
        threadTs: '1234567890.123456',
        mention: '@cursor',
        messageText: 'Implement this feature',
        requireHumanConfirmation: true,
      })
    })

    it('should throw error for empty custom mention', () => {
      expect(() =>
        ConductorBlock.tools?.config?.params?.({
          ...baseParams,
          action: 'send_mention',
          mentionTarget: 'custom',
          customMention: '',
          messageText: 'Hello',
        })
      ).toThrow('Mention target is required')
    })

    it('should throw error for whitespace-only custom mention', () => {
      expect(() =>
        ConductorBlock.tools?.config?.params?.({
          ...baseParams,
          action: 'send_mention',
          mentionTarget: 'custom',
          customMention: '   ',
          messageText: 'Hello',
        })
      ).toThrow('Mention target is required')
    })

    it('should use custom mention when mentionTarget is custom', () => {
      const result = ConductorBlock.tools?.config?.params?.({
        ...baseParams,
        action: 'send_mention',
        mentionTarget: 'custom',
        customMention: '@mybot',
        messageText: 'Hello',
      })

      expect(result?.mention).toBe('@mybot')
    })

    it('should map click_cursor_link action correctly', () => {
      const result = ConductorBlock.tools?.config?.params?.({
        ...baseParams,
        action: 'click_cursor_link',
        cursorLinkUrl: 'https://cursor.com/agents/abc123',
      })

      expect(result).toEqual({
        conductorUrl: 'http://localhost:3000',
        action: 'click_cursor_link',
        channelId: 'C123',
        threadTs: '1234567890.123456',
        cursorLinkUrl: 'https://cursor.com/agents/abc123',
      })
    })

    it('should map human_checkpoint action correctly', () => {
      const result = ConductorBlock.tools?.config?.params?.({
        ...baseParams,
        action: 'human_checkpoint',
        checkpointMessage: 'Ready to create PR?',
        timeoutMinutes: '30',
      })

      expect(result).toEqual({
        conductorUrl: 'http://localhost:3000',
        action: 'human_checkpoint',
        channelId: 'C123',
        threadTs: '1234567890.123456',
        checkpointMessage: 'Ready to create PR?',
        timeoutMinutes: 30,
      })
    })

    it('should use default timeout for human_checkpoint', () => {
      const result = ConductorBlock.tools?.config?.params?.({
        ...baseParams,
        action: 'human_checkpoint',
        checkpointMessage: 'Ready?',
      })

      expect(result?.timeoutMinutes).toBe(60)
    })

    it('should map wait_for_signal action correctly', () => {
      const result = ConductorBlock.tools?.config?.params?.({
        ...baseParams,
        action: 'wait_for_signal',
        signalPatterns: 'implementation complete\nall tests passing',
        maxWaitMinutes: '45',
        pollIntervalSeconds: '60',
        postStatusUpdates: true,
      })

      expect(result).toEqual({
        conductorUrl: 'http://localhost:3000',
        action: 'wait_for_signal',
        channelId: 'C123',
        threadTs: '1234567890.123456',
        signalPatterns: ['implementation complete', 'all tests passing'],
        maxWaitMinutes: 45,
        pollIntervalSeconds: 60,
        postStatusUpdates: true,
      })
    })

    it('should use default values for wait_for_signal', () => {
      const result = ConductorBlock.tools?.config?.params?.({
        ...baseParams,
        action: 'wait_for_signal',
        signalPatterns: 'done',
      })

      expect(result?.maxWaitMinutes).toBe(30)
      expect(result?.pollIntervalSeconds).toBe(30)
      expect(result?.signalPatterns).toEqual(['done'])
    })

    it('should filter empty signal patterns', () => {
      const result = ConductorBlock.tools?.config?.params?.({
        ...baseParams,
        action: 'wait_for_signal',
        signalPatterns: 'done\n\ncomplete\n   \nfinished',
      })

      expect(result?.signalPatterns).toEqual(['done', 'complete', 'finished'])
    })

    it('should map get_status action correctly', () => {
      const result = ConductorBlock.tools?.config?.params?.({
        ...baseParams,
        action: 'get_status',
      })

      expect(result).toEqual({
        conductorUrl: 'http://localhost:3000',
        action: 'get_status',
        channelId: 'C123',
        threadTs: '1234567890.123456',
      })
    })

    it('should throw error for unknown actions', () => {
      expect(() =>
        ConductorBlock.tools?.config?.params?.({
          ...baseParams,
          action: 'unknown_action',
        })
      ).toThrow('Unknown Conductor action: unknown_action')
    })

    it('should include apiKey when provided', () => {
      const result = ConductorBlock.tools?.config?.params?.({
        ...baseParams,
        action: 'send_mention',
        mentionTarget: '@cursor',
        messageText: 'Hello',
        apiKey: 'secret-key',
      })

      expect(result?.apiKey).toBe('secret-key')
    })
  })

  describe('subBlocks', () => {
    it('should have conductorUrl subBlock', () => {
      const subBlock = ConductorBlock.subBlocks?.find((sb) => sb.id === 'conductorUrl')
      expect(subBlock).toBeDefined()
      expect(subBlock?.type).toBe('short-input')
      expect(subBlock?.required).toBe(true)
    })

    it('should have apiKey subBlock', () => {
      const subBlock = ConductorBlock.subBlocks?.find((sb) => sb.id === 'apiKey')
      expect(subBlock).toBeDefined()
      expect(subBlock?.type).toBe('short-input')
      expect(subBlock?.password).toBe(true)
    })

    it('should have action dropdown with correct options', () => {
      const subBlock = ConductorBlock.subBlocks?.find((sb) => sb.id === 'action')
      expect(subBlock).toBeDefined()
      expect(subBlock?.type).toBe('dropdown')
      expect(subBlock?.options?.map((o) => o.id)).toEqual([
        'send_mention',
        'click_cursor_link',
        'human_checkpoint',
        'wait_for_signal',
        'get_status',
      ])
    })

    it('should have channelId and threadTs subBlocks', () => {
      const channelBlock = ConductorBlock.subBlocks?.find((sb) => sb.id === 'channelId')
      const threadBlock = ConductorBlock.subBlocks?.find((sb) => sb.id === 'threadTs')
      expect(channelBlock).toBeDefined()
      expect(threadBlock).toBeDefined()
    })
  })

  describe('inputs and outputs', () => {
    it('should define all expected inputs', () => {
      const inputKeys = Object.keys(ConductorBlock.inputs || {})
      expect(inputKeys).toContain('conductorUrl')
      expect(inputKeys).toContain('action')
      expect(inputKeys).toContain('channelId')
      expect(inputKeys).toContain('threadTs')
      expect(inputKeys).toContain('mentionTarget')
      expect(inputKeys).toContain('messageText')
      expect(inputKeys).toContain('signalPatterns')
    })

    it('should define all expected outputs', () => {
      const outputKeys = Object.keys(ConductorBlock.outputs || {})
      expect(outputKeys).toContain('success')
      expect(outputKeys).toContain('completionSignal')
      expect(outputKeys).toContain('elapsedMinutes')
      expect(outputKeys).toContain('sessionId')
    })
  })
})
