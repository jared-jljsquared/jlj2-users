import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientModule from '../../database/client.ts'
import * as loggerModule from '../../plumbing/logger.ts'
import {
  consumeRefreshToken,
  generateRefreshToken,
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
    it('should generate and store refresh token in both tables', async () => {
      mockExecute.mockResolvedValue(undefined)

      const token = await generateRefreshToken({
        client_id: 'client-uuid',
        user_id: 'user-id',
        scopes: ['openid', 'offline_access'],
      })

      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
      expect(mockExecute).toHaveBeenCalledTimes(2)
      expect(mockExecute).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('refresh_tokens'),
        expect.arrayContaining([
          expect.any(String),
          'client-uuid',
          'user-id',
          ['openid', 'offline_access'],
          expect.any(Date),
          expect.any(Date),
        ]),
      )
      expect(mockExecute).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('refresh_tokens_by_user'),
        expect.arrayContaining(['user-id', 'client-uuid', expect.any(String)]),
      )
    })
  })

  describe('consumeRefreshToken', () => {
    it('should return null when token not found', async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] })

      const result = await consumeRefreshToken('invalid-token', 'client-uuid')

      expect(result).toBeNull()
    })

    it('should return null and log when client_id does not match', async () => {
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
      expect(mockExecute).toHaveBeenCalledTimes(3)
    })

    it('should return null and log when token already used', async () => {
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

    it('should return data and delete token from both tables when valid', async () => {
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
      expect(mockExecute).toHaveBeenCalledTimes(3)
      expect(mockExecute).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('refresh_tokens'),
        expect.arrayContaining(['valid-token']),
      )
      expect(mockExecute).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('refresh_tokens_by_user'),
        expect.arrayContaining(['user-id', 'client-uuid', 'valid-token']),
      )
    })
  })

  describe('revokeRefreshTokensByUser', () => {
    it('should return 0 when no tokens for user and client', async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined)

      const count = await revokeRefreshTokensByUser('client-uuid', 'user-id')

      expect(count).toBe(0)
      expect(mockExecute).toHaveBeenCalledTimes(2)
    })

    it('should revoke all tokens and return count', async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [{ token_value: 'token-1' }, { token_value: 'token-2' }],
        })
        .mockResolvedValue(undefined)

      const count = await revokeRefreshTokensByUser('client-uuid', 'user-id')

      expect(count).toBe(2)
      expect(mockExecute).toHaveBeenCalledTimes(4)
      expect(mockExecute).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('SELECT'),
        ['user-id', 'client-uuid'],
      )
      expect(mockExecute).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('DELETE FROM'),
        ['token-1'],
      )
      expect(mockExecute).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('DELETE FROM'),
        ['token-2'],
      )
      expect(mockExecute).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining('refresh_tokens_by_user'),
        ['user-id', 'client-uuid'],
      )
    })
  })
})
