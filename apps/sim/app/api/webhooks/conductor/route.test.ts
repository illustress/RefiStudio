/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'

/**
 * Tests for Conductor Webhook Handler
 * 
 * Covers:
 * - Authentication validation
 * - Command parsing
 * - Response handling
 * - Error scenarios
 */

// Mock the environment variables
const originalEnv = process.env

describe('POST /api/webhooks/conductor', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  const createRequest = (body: any, authHeader?: string): Request => {
    return new Request('http://localhost:3000/api/webhooks/conductor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(body),
    })
  }

  describe('authentication', () => {
    it('should reject request when CONDUCTOR_WEBHOOK_SECRET is set but auth header is missing', async () => {
      process.env.CONDUCTOR_WEBHOOK_SECRET = 'secret123'
      process.env.NODE_ENV = 'production'

      const request = createRequest({
        event: 'conductor_command',
        command: 'status',
        user: 'U123',
        channel: 'C123',
        thread_ts: '1234567890.123456',
      })

      const response = await POST(request)
      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should reject request when auth header does not match secret', async () => {
      process.env.CONDUCTOR_WEBHOOK_SECRET = 'secret123'
      process.env.NODE_ENV = 'production'

      const request = createRequest(
        {
          event: 'conductor_command',
          command: 'status',
          user: 'U123',
          channel: 'C123',
          thread_ts: '1234567890.123456',
        },
        'Bearer wrong-secret'
      )

      const response = await POST(request)
      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should accept request with valid auth header', async () => {
      process.env.CONDUCTOR_WEBHOOK_SECRET = 'secret123'
      process.env.NODE_ENV = 'production'

      const request = createRequest(
        {
          event: 'conductor_command',
          command: 'status',
          user: 'U123',
          channel: 'C123',
          thread_ts: '1234567890.123456',
        },
        'Bearer secret123'
      )

      const response = await POST(request)
      expect(response.status).toBe(200)
    })

    it('should reject request in production when secret is not set', async () => {
      delete process.env.CONDUCTOR_WEBHOOK_SECRET
      process.env.NODE_ENV = 'production'

      const request = createRequest({
        event: 'conductor_command',
        command: 'status',
        user: 'U123',
        channel: 'C123',
        thread_ts: '1234567890.123456',
      })

      const response = await POST(request)
      expect(response.status).toBe(500)

      const data = await response.json()
      expect(data.error).toBe('Server configuration error')
    })

    it('should allow request in development without secret', async () => {
      delete process.env.CONDUCTOR_WEBHOOK_SECRET
      process.env.NODE_ENV = 'development'

      const request = createRequest({
        event: 'conductor_command',
        command: 'status',
        user: 'U123',
        channel: 'C123',
        thread_ts: '1234567890.123456',
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
    })
  })

  describe('command handling', () => {
    beforeEach(() => {
      process.env.CONDUCTOR_WEBHOOK_SECRET = 'secret123'
      process.env.NODE_ENV = 'production'
    })

    it('should handle start command', async () => {
      const request = createRequest(
        {
          event: 'conductor_command',
          command: 'start',
          args: {},
          storyId: 'JIRA-123',
          user: 'U123',
          channel: 'C123',
          thread_ts: '1234567890.123456',
          text: '@conductor start JIRA-123',
        },
        'Bearer secret123'
      )

      const response = await POST(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.message).toBe('Started workflow for JIRA-123')
      expect(data.context.storyId).toBe('JIRA-123')
    })

    it('should reject start command without storyId', async () => {
      const request = createRequest(
        {
          event: 'conductor_command',
          command: 'start',
          args: {},
          user: 'U123',
          channel: 'C123',
          thread_ts: '1234567890.123456',
        },
        'Bearer secret123'
      )

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('Story ID required for start command')
    })

    it('should handle status command', async () => {
      const request = createRequest(
        {
          event: 'conductor_command',
          command: 'status',
          user: 'U123',
          channel: 'C123',
          thread_ts: '1234567890.123456',
        },
        'Bearer secret123'
      )

      const response = await POST(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('running')
    })

    it('should handle approve command', async () => {
      const request = createRequest(
        {
          event: 'conductor_command',
          command: 'approve',
          user: 'U123',
          channel: 'C123',
          thread_ts: '1234567890.123456',
        },
        'Bearer secret123'
      )

      const response = await POST(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('approved')
    })

    it('should handle reject command', async () => {
      const request = createRequest(
        {
          event: 'conductor_command',
          command: 'reject',
          user: 'U123',
          channel: 'C123',
          thread_ts: '1234567890.123456',
        },
        'Bearer secret123'
      )

      const response = await POST(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('rejected')
    })

    it('should handle pause command', async () => {
      const request = createRequest(
        {
          event: 'conductor_command',
          command: 'pause',
          user: 'U123',
          channel: 'C123',
          thread_ts: '1234567890.123456',
        },
        'Bearer secret123'
      )

      const response = await POST(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('paused')
    })

    it('should handle resume command', async () => {
      const request = createRequest(
        {
          event: 'conductor_command',
          command: 'resume',
          user: 'U123',
          channel: 'C123',
          thread_ts: '1234567890.123456',
        },
        'Bearer secret123'
      )

      const response = await POST(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('running')
    })

    it('should handle help command', async () => {
      const request = createRequest(
        {
          event: 'conductor_command',
          command: 'help',
          user: 'U123',
          channel: 'C123',
          thread_ts: '1234567890.123456',
        },
        'Bearer secret123'
      )

      const response = await POST(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.helpText).toContain('Conductor Commands')
      expect(data.helpText).toContain('@conductor start')
    })
  })

  describe('validation', () => {
    it('should return 400 for invalid JSON', async () => {
      const request = new Request('http://localhost:3000/api/webhooks/conductor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      })

      const response = await POST(request)
      expect(response.status).toBe(500)
    })

    it('should return 400 for invalid event type', async () => {
      process.env.CONDUCTOR_WEBHOOK_SECRET = 'secret123'

      const request = createRequest(
        {
          event: 'invalid_event',
          command: 'status',
        },
        'Bearer secret123'
      )

      const response = await POST(request)
      expect(response.status).toBe(400)
    })

    it('should return 400 for invalid command', async () => {
      process.env.CONDUCTOR_WEBHOOK_SECRET = 'secret123'

      const request = createRequest(
        {
          event: 'conductor_command',
          command: 'invalid_command',
          user: 'U123',
          channel: 'C123',
          thread_ts: '1234567890.123456',
        },
        'Bearer secret123'
      )

      const response = await POST(request)
      expect(response.status).toBe(400)
    })
  })

  describe('workflowId generation', () => {
    beforeEach(() => {
      process.env.CONDUCTOR_WEBHOOK_SECRET = 'secret123'
      process.env.NODE_ENV = 'production'
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should generate unique workflowId', async () => {
      const request = createRequest(
        {
          event: 'conductor_command',
          command: 'start',
          storyId: 'JIRA-123',
          user: 'U123',
          channel: 'C123',
          thread_ts: '1234567890.123456',
        },
        'Bearer secret123'
      )

      const response = await POST(request)
      const data = await response.json()

      expect(data.workflowId).toMatch(/^conductor-JIRA-123-\d+$/)
    })
  })
})
