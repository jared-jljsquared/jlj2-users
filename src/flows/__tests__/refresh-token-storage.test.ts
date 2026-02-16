import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientModule from '../../database/client.ts'
import {
  consumeRefreshToken,
  generateRefreshToken,
} from '../refresh-token-storage.ts'

const mockExecute = vi.fn()

vi.mock('../../database/client.ts', () => ({
  getDatabaseClient: vi.fn(),
}))

vi.mock('../../database/config.ts', () => ({
  getDatabaseConfig: vi.fn(() => ({ keyspace: 'jlj2_users' })),
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
    it('should generate and store refresh token', async () => {
      mockExecute.mockResolvedValue(undefined)

      const token = await generateRefreshToken({
        client_id: 'client-uuid',
        user_id: 'user-id',
        scopes: ['openid', 'offline_access'],
      })

      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining([
          expect.any(String),
          'client-uuid',
          'user-id',
          ['openid', 'offline_access'],
          expect.any(Date),
          expect.any(Date),
        ]),
      )
    })
  })

  describe('consumeRefreshToken', () => {
    it('should return null when token not found', async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] })

      const result = await consumeRefreshToken('invalid-token', 'client-uuid')

      expect(result).toBeNull()
    })

    it('should return null when client_id does not match', async () => {
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

      const result = await consumeRefreshToken('valid-token', 'client-uuid')

      expect(result).toBeNull()
    })

    it('should return data and delete token when valid', async () => {
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

      const result = await consumeRefreshToken('valid-token', 'client-uuid')

      expect(result).not.toBeNull()
      expect(result?.user_id).toBe('user-id')
      expect(result?.client_id).toBe('client-uuid')
      expect(result?.scopes).toEqual(['openid', 'offline_access'])
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        expect.arrayContaining(['valid-token']),
      )
    })
  })
})
