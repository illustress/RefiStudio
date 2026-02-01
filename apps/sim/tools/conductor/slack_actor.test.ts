import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { conductorSlackActorTool } from './slack_actor'

/**
 * Tests for Conductor Slack Actor Tool
 * 
 * Covers:
 * - Payload key mapping (camelCase → snake_case)
 * - URL generation for different actions
 * - Polling logic for wait_for_signal
 * - Response transformation
 */

describe('conductorSlackActorTool', () => {
  describe('request.url', () => {
    it('should generate correct URL for send_mention action', () => {
      const url = conductorSlackActorTool.request.url({
        conductorUrl: 'http://localhost:3000',
        action: 'send_mention',
        channelId: 'C123',
        threadTs: '1234567890.123456',
      })
      expect(url).toBe('http://localhost:3000/api/slack/send-mention')
    })

    it('should generate correct URL for click_cursor_link action', () => {
      const url = conductorSlackActorTool.request.url({
        conductorUrl: 'http://localhost:3000/',
        action: 'click_cursor_link',
        channelId: 'C123',
        threadTs: '1234567890.123456',
      })
      expect(url).toBe('http://localhost:3000/api/cursor/click-link')
    })

    it('should generate correct URL for human_checkpoint action', () => {
      const url = conductorSlackActorTool.request.url({
        conductorUrl: 'http://localhost:3000',
        action: 'human_checkpoint',
        channelId: 'C123',
        threadTs: '1234567890.123456',
      })
      expect(url).toBe('http://localhost:3000/api/human_checkpoint')
    })

    it('should generate correct URL for wait_for_signal action', () => {
      const url = conductorSlackActorTool.request.url({
        conductorUrl: 'http://localhost:3000',
        action: 'wait_for_signal',
        channelId: 'C123',
        threadTs: '1234567890.123456',
      })
      expect(url).toBe('http://localhost:3000/api/wait_for_signal')
    })

    it('should generate correct URL for get_status action', () => {
      const url = conductorSlackActorTool.request.url({
        conductorUrl: 'http://localhost:3000',
        action: 'get_status',
        channelId: 'C123',
        threadTs: '1234567890.123456',
      })
      expect(url).toBe('http://localhost:3000/api/thread/1234567890.123456/status')
    })
  })

  describe('request.method', () => {
    it('should return GET for get_status action', () => {
      const method = conductorSlackActorTool.request.method({
        conductorUrl: 'http://localhost:3000',
        action: 'get_status',
        channelId: 'C123',
        threadTs: '1234567890.123456',
      })
      expect(method).toBe('GET')
    })

    it('should return POST for send_mention action', () => {
      const method = conductorSlackActorTool.request.method({
        conductorUrl: 'http://localhost:3000',
        action: 'send_mention',
        channelId: 'C123',
        threadTs: '1234567890.123456',
      })
      expect(method).toBe('POST')
    })

    it('should return POST for unknown actions', () => {
      const method = conductorSlackActorTool.request.method({
        conductorUrl: 'http://localhost:3000',
        action: 'unknown_action',
        channelId: 'C123',
        threadTs: '1234567890.123456',
      })
      expect(method).toBe('POST')
    })
  })

  describe('request.headers', () => {
    it('should include X-API-Key header when apiKey is provided', () => {
      const headers = conductorSlackActorTool.request.headers({
        conductorUrl: 'http://localhost:3000',
        action: 'send_mention',
        apiKey: 'test-api-key',
        channelId: 'C123',
        threadTs: '1234567890.123456',
      })
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'X-API-Key': 'test-api-key',
      })
    })

    it('should use env var for X-API-Key when apiKey not provided', () => {
      const originalEnv = process.env.CONDUCTOR_API_KEY
      process.env.CONDUCTOR_API_KEY = 'env-api-key'

      const headers = conductorSlackActorTool.request.headers({
        conductorUrl: 'http://localhost:3000',
        action: 'send_mention',
        channelId: 'C123',
        threadTs: '1234567890.123456',
      })
      expect(headers['X-API-Key']).toBe('env-api-key')

      process.env.CONDUCTOR_API_KEY = originalEnv
    })

    it('should have empty X-API-Key when neither param nor env is set', () => {
      const originalEnv = process.env.CONDUCTOR_API_KEY
      delete process.env.CONDUCTOR_API_KEY

      const headers = conductorSlackActorTool.request.headers({
        conductorUrl: 'http://localhost:3000',
        action: 'send_mention',
        channelId: 'C123',
        threadTs: '1234567890.123456',
      })
      expect(headers['X-API-Key']).toBe('')

      process.env.CONDUCTOR_API_KEY = originalEnv
    })
  })

  describe('request.body', () => {
    it('should map camelCase to snake_case keys', () => {
      const body = conductorSlackActorTool.request.body({
        conductorUrl: 'http://localhost:3000',
        action: 'send_mention',
        apiKey: 'test-key',
        channelId: 'C123',
        threadTs: '1234567890.123456',
        mention: '@cursor',
        messageText: 'Hello world',
        cursorLinkUrl: 'https://cursor.com/link',
        checkpointMessage: 'Approve this?',
        signalPatterns: ['done', 'complete'],
      })

      expect(body).toEqual({
        action: 'send_mention',
        channel: 'C123',
        thread_ts: '1234567890.123456',
        mention: '@cursor',
        text: 'Hello world',
        linkUrl: 'https://cursor.com/link',
        checkpointMessage: 'Approve this?',
        signalPatterns: ['done', 'complete'],
      })

      // Should NOT include conductorUrl or apiKey
      expect(body).not.toHaveProperty('conductorUrl')
      expect(body).not.toHaveProperty('apiKey')
      expect(body).not.toHaveProperty('channelId')
      expect(body).not.toHaveProperty('threadTs')
      expect(body).not.toHaveProperty('messageText')
      expect(body).not.toHaveProperty('cursorLinkUrl')
    })

    it('should only include defined values', () => {
      const body = conductorSlackActorTool.request.body({
        conductorUrl: 'http://localhost:3000',
        action: 'send_mention',
        channelId: 'C123',
        threadTs: '1234567890.123456',
        mention: '@cursor',
      })

      expect(body).toEqual({
        action: 'send_mention',
        channel: 'C123',
        thread_ts: '1234567890.123456',
        mention: '@cursor',
      })

      // Undefined optional fields should not be present
      expect(body).not.toHaveProperty('text')
      expect(body).not.toHaveProperty('linkUrl')
    })
  })

  describe('transformResponse', () => {
    it('should throw error for non-OK responses', async () => {
      const response = new Response(JSON.stringify({ error: 'Something went wrong' }), {
        status: 500,
        statusText: 'Internal Server Error',
      })

      await expect(
        conductorSlackActorTool.transformResponse(response, {} as any)
      ).rejects.toThrow('Conductor error: 500')
    })

    it('should throw error with custom error message', async () => {
      const response = new Response(JSON.stringify({ error: 'Custom error' }), {
        status: 400,
        statusText: 'Bad Request',
      })

      await expect(
        conductorSlackActorTool.transformResponse(response, {} as any)
      ).rejects.toThrow('Custom error')
    })

    it('should return success response for OK status', async () => {
      const response = new Response(JSON.stringify({ success: true, message: 'Done' }), {
        status: 200,
      })

      const result = await conductorSlackActorTool.transformResponse(response, {
        action: 'send_mention',
      } as any)

      expect(result).toEqual({
        success: true,
        output: { success: true, message: 'Done' },
      })
    })

    it('should poll for wait_for_signal and return result on completion', async () => {
      // Mock fetch for polling
      const mockFetch = vi.fn()
      global.fetch = mockFetch

      // First call starts polling
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'polling' }), { status: 200 })
      )

      // Subsequent poll calls return completed
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            completed: true,
            completionSignal: 'implementation complete',
            elapsedMinutes: 5,
          }),
          { status: 200 }
        )
      )

      const response = new Response(JSON.stringify({ status: 'polling' }), { status: 200 })

      const result = await conductorSlackActorTool.transformResponse(response, {
        action: 'wait_for_signal',
        conductorUrl: 'http://localhost:3000',
        threadTs: '1234567890.123456',
        apiKey: 'test-key',
        maxWaitMinutes: 30,
        pollIntervalSeconds: 1, // Fast for testing
      } as any)

      expect(result.success).toBe(true)
      expect(result.output.completed).toBe(true)
      expect(result.output.completionSignal).toBe('implementation complete')
      expect(result.output.elapsedMinutes).toBe(5)
    })

    it('should handle timeout in wait_for_signal polling', async () => {
      const mockFetch = vi.fn()
      global.fetch = mockFetch

      // Always return not completed
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ completed: false, status: 'waiting' }), { status: 200 })
      )

      const response = new Response(JSON.stringify({ status: 'polling' }), { status: 200 })

      const result = await conductorSlackActorTool.transformResponse(response, {
        action: 'wait_for_signal',
        conductorUrl: 'http://localhost:3000',
        threadTs: '1234567890.123456',
        apiKey: 'test-key',
        maxWaitMinutes: 0.01, // ~0.6 seconds for fast test
        pollIntervalSeconds: 0.1,
      } as any)

      expect(result.success).toBe(false)
      expect(result.output.timedOut).toBe(true)
      expect(result.output.completed).toBe(false)
    })
  })
})
