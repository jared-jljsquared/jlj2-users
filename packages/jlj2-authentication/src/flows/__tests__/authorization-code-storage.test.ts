import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientModule from '../../database/client.ts'
import { consumeAuthorizationCode } from '../authorization-code-storage.ts'

const mockExecute = vi.fn()

vi.mock('../../database/client.ts', () => ({
  getDatabaseClient: vi.fn(),
}))

vi.mock('../../database/config.ts', () => ({
  getDatabaseConfig: vi.fn(() => ({ keyspace: 'jlj2_users' })),
}))

describe('Authorization Code Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientModule.getDatabaseClient).mockReturnValue({
      execute: mockExecute,
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('consumeAuthorizationCode', () => {
    it('should return null when code not found', async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] })

      const result = await consumeAuthorizationCode(
        'invalid-code',
        'client-uuid',
        'https://example.com/callback',
      )

      expect(result).toBeNull()
    })

    it('should return null when client_id does not match', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [
          {
            code: 'abc123',
            client_id: 'other-client',
            redirect_uri: 'https://example.com/callback',
            scopes: ['openid'],
            user_id: 'user-id',
            code_challenge: null,
            code_challenge_method: null,
            nonce: null,
            expires_at: new Date(Date.now() + 60000),
            created_at: new Date(),
            auth_time: new Date(),
          },
        ],
      })

      const result = await consumeAuthorizationCode(
        'abc123',
        'client-uuid',
        'https://example.com/callback',
      )

      expect(result).toBeNull()
    })

    it('should return null when redirect_uri does not match', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [
          {
            code: 'abc123',
            client_id: 'client-uuid',
            redirect_uri: 'https://other.com/callback',
            scopes: ['openid'],
            user_id: 'user-id',
            code_challenge: null,
            code_challenge_method: null,
            nonce: null,
            expires_at: new Date(Date.now() + 60000),
            created_at: new Date(),
            auth_time: new Date(),
          },
        ],
      })

      const result = await consumeAuthorizationCode(
        'abc123',
        'client-uuid',
        'https://example.com/callback',
      )

      expect(result).toBeNull()
    })

    it('should return null when code expired', async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              code: 'abc123',
              client_id: 'client-uuid',
              redirect_uri: 'https://example.com/callback',
              scopes: ['openid'],
              user_id: 'user-id',
              code_challenge: null,
              code_challenge_method: null,
              nonce: null,
              expires_at: new Date(Date.now() - 1000),
              created_at: new Date(),
              auth_time: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce(undefined)

      const result = await consumeAuthorizationCode(
        'abc123',
        'client-uuid',
        'https://example.com/callback',
      )

      expect(result).toBeNull()
    })

    it('should return null when already consumed (concurrent consumption)', async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              code: 'abc123',
              client_id: 'client-uuid',
              redirect_uri: 'https://example.com/callback',
              scopes: ['openid'],
              user_id: 'user-id',
              code_challenge: null,
              code_challenge_method: null,
              nonce: null,
              expires_at: new Date(Date.now() + 60000),
              created_at: new Date(),
              auth_time: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ wasApplied: () => false })

      const result = await consumeAuthorizationCode(
        'abc123',
        'client-uuid',
        'https://example.com/callback',
      )

      expect(result).toBeNull()
    })

    it('should return code data when valid', async () => {
      const expiresAt = new Date(Date.now() + 60000)
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              code: 'abc123',
              client_id: 'client-uuid',
              redirect_uri: 'https://example.com/callback',
              scopes: ['openid', 'profile'],
              user_id: 'user-id',
              code_challenge: 'challenge',
              code_challenge_method: 'S256',
              nonce: 'nonce',
              expires_at: expiresAt,
              created_at: new Date(),
              auth_time: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ wasApplied: () => true })

      const result = await consumeAuthorizationCode(
        'abc123',
        'client-uuid',
        'https://example.com/callback',
      )

      expect(result).not.toBeNull()
      expect(result?.user_id).toBe('user-id')
      expect(result?.client_id).toBe('client-uuid')
      expect(result?.redirect_uri).toBe('https://example.com/callback')
      expect(result?.scopes).toEqual(['openid', 'profile'])
      expect(result?.code_challenge).toBe('challenge')
      expect(result?.code_challenge_method).toBe('S256')
      expect(result?.nonce).toBe('nonce')
    })
  })
})
