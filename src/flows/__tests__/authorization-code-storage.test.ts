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
    it('should return null when DELETE IF EXISTS was not applied (concurrent consumption)', async () => {
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
      expect(mockExecute).toHaveBeenCalledTimes(2)
      expect(mockExecute).toHaveBeenLastCalledWith(
        expect.stringContaining('DELETE'),
        expect.arrayContaining(['abc123']),
      )
      expect(mockExecute).toHaveBeenLastCalledWith(
        expect.stringContaining('IF EXISTS'),
        expect.any(Array),
      )
    })

    it('should return data when DELETE IF EXISTS was applied', async () => {
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
      expect(result?.scopes).toEqual(['openid', 'profile'])
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        expect.any(Array),
      )
    })
  })
})
