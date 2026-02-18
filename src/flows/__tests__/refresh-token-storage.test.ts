import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientModule from '../../database/client.ts'
import * as loggerModule from '../../plumbing/logger.ts'
import {
  consumeRefreshToken,
  generateRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokensByUser,
} from '../refresh-token-storage.ts'

const mockExecute = vi.fn()

vi.mock('../../database/client.ts', () => ({
  getDatabaseClient: vi.fn(),
}))

vi.mock('../../database/config.ts', () => ({
  getDatabaseConfig: vi.fn(() => ({ keyspace: 'jlj2_users' })),
}))

vi.mock('../../plumbing/logger.ts', () => ({
  log: vi.fn(),
}))

describe('Refresh Token Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientModule.getDatabaseClient).mockReturnValue({
      execute: mockExecute,
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('generateRefreshToken', () => {
    it('should return a non-empty token string', async () => {
      mockExecute.mockResolvedValue(undefined)

      const token = await generateRefreshToken({
        client_id: 'client-uuid',
        user_id: 'user-id',
        scopes: ['openid', 'offline_access'],
      })

      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    })

    it('should produce a token that can be consumed to return user data', async () => {
      mockExecute.mockResolvedValue(undefined)

      const token = await generateRefreshToken({
        client_id: 'client-uuid',
        user_id: 'user-id',
        scopes: ['openid', 'offline_access'],
      })

      mockExecute.mockReset()
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              token_value: token,
              client_id: 'client-uuid',
              user_id: 'user-id',
              scopes: ['openid', 'offline_access'],
              expires_at: new Date(Date.now() + 86400000),
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ wasApplied: () => true })
        .mockResolvedValueOnce(undefined)

      const result = await consumeRefreshToken(token, 'client-uuid')

      expect(result).not.toBeNull()
      expect(result?.user_id).toBe('user-id')
      expect(result?.client_id).toBe('client-uuid')
      expect(result?.scopes).toEqual(['openid', 'offline_access'])
    })
  })

  describe('consumeRefreshToken', () => {
    it('should return null when token not found', async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] })

      const result = await consumeRefreshToken('invalid-token', 'client-uuid')

      expect(result).toBeNull()
    })

    it('should return null when client_id does not match and log security event', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [
          {
            token_value: 'valid-token',
            client_id: 'other-client',
            user_id: 'user-id',
            scopes: ['openid'],
            expires_at: new Date(Date.now() + 86400000),
            created_at: new Date(),
          },
        ],
      })

      const result = await consumeRefreshToken('valid-token', 'client-uuid')

      expect(result).toBeNull()
      expect(loggerModule.log).toHaveBeenCalledWith({
        message: 'Refresh token client mismatch (security event)',
        tokenClientId: 'other-client',
        requestClientId: 'client-uuid',
        userId: 'user-id',
      })
    })

    it('should return null when token expired', async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              token_value: 'valid-token',
              client_id: 'client-uuid',
              user_id: 'user-id',
              scopes: ['openid'],
              expires_at: new Date(Date.now() - 1000),
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)

      const result = await consumeRefreshToken('valid-token', 'client-uuid')

      expect(result).toBeNull()
    })

    it('should return null and log when token already used (replay attempt)', async () => {
      const expiresAt = new Date(Date.now() + 86400000)
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              token_value: 'valid-token',
              client_id: 'client-uuid',
              user_id: 'user-id',
              scopes: ['openid', 'offline_access'],
              expires_at: expiresAt,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ wasApplied: () => false })

      const result = await consumeRefreshToken('valid-token', 'client-uuid')

      expect(result).toBeNull()
      expect(loggerModule.log).toHaveBeenCalledWith({
        message: 'Refresh token already used (replay attempt)',
        userId: 'user-id',
        clientId: 'client-uuid',
      })
    })

    it('should return token data when valid and consume successfully', async () => {
      const expiresAt = new Date(Date.now() + 86400000)
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              token_value: 'valid-token',
              client_id: 'client-uuid',
              user_id: 'user-id',
              scopes: ['openid', 'offline_access'],
              expires_at: expiresAt,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ wasApplied: () => true })
        .mockResolvedValueOnce(undefined)

      const result = await consumeRefreshToken('valid-token', 'client-uuid')

      expect(result).not.toBeNull()
      expect(result?.user_id).toBe('user-id')
      expect(result?.client_id).toBe('client-uuid')
      expect(result?.scopes).toEqual(['openid', 'offline_access'])
    })
  })

  describe('revokeRefreshToken', () => {
    it('should return false when token not found', async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] })

      const result = await revokeRefreshToken('invalid-token', 'client-uuid')

      expect(result).toBe(false)
    })

    it('should return false when client_id does not match', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [
          {
            token_value: 'valid-token',
            client_id: 'other-client',
            user_id: 'user-id',
            scopes: ['openid'],
            expires_at: new Date(Date.now() + 86400000),
            created_at: new Date(),
          },
        ],
      })

      const result = await revokeRefreshToken('valid-token', 'client-uuid')

      expect(result).toBe(false)
    })

    it('should return true and delete token when valid', async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              token_value: 'valid-token',
              client_id: 'client-uuid',
              user_id: 'user-id',
              scopes: ['openid'],
              expires_at: new Date(Date.now() + 86400000),
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValue(undefined)

      const result = await revokeRefreshToken('valid-token', 'client-uuid')

      expect(result).toBe(true)

      mockExecute.mockReset()
      mockExecute.mockResolvedValueOnce({ rows: [] })

      const consumeResult = await consumeRefreshToken(
        'valid-token',
        'client-uuid',
      )

      expect(consumeResult).toBeNull()
    })
  })

  describe('revokeRefreshTokensByUser', () => {
    it('should return 0 when no tokens for user and client', async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined)

      const count = await revokeRefreshTokensByUser('client-uuid', 'user-id')

      expect(count).toBe(0)
    })

    it('should return count of revoked tokens', async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [{ token_value: 'token-1' }, { token_value: 'token-2' }],
        })
        .mockResolvedValue(undefined)

      const count = await revokeRefreshTokensByUser('client-uuid', 'user-id')

      expect(count).toBe(2)
    })

    it('should revoke tokens so they can no longer be consumed', async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [{ token_value: 'revoked-token' }],
        })
        .mockResolvedValue(undefined)

      const count = await revokeRefreshTokensByUser('client-uuid', 'user-id')

      expect(count).toBe(1)

      mockExecute.mockReset()
      mockExecute.mockResolvedValueOnce({ rows: [] })

      const result = await consumeRefreshToken('revoked-token', 'client-uuid')

      expect(result).toBeNull()
    })
  })
})
