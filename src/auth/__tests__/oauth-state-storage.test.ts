import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientModule from '../../database/client.ts'
import { consumeOAuthState, storeOAuthState } from '../oauth-state-storage.ts'

const mockExecute = vi.fn()

vi.mock('../../database/client.ts', () => ({
  getDatabaseClient: vi.fn(),
}))

vi.mock('../../database/config.ts', () => ({
  getDatabaseConfig: vi.fn(() => ({ keyspace: 'jlj2_users' })),
}))

describe('oauth-state-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientModule.getDatabaseClient).mockReturnValue({
      execute: mockExecute,
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('storeOAuthState', () => {
    it('should store state with returnTo', async () => {
      mockExecute.mockResolvedValue(undefined)

      await storeOAuthState({
        state: 'state-123',
        returnTo: '/dashboard',
      })

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining([
          'state-123',
          '/dashboard',
          null,
          expect.any(Date),
          expect.any(Date),
        ]),
      )
    })

    it('should store state with codeVerifier', async () => {
      mockExecute.mockResolvedValue(undefined)

      await storeOAuthState({
        state: 'pkce-state',
        returnTo: '/profile',
        codeVerifier: 'my-verifier',
      })

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining([
          'pkce-state',
          '/profile',
          'my-verifier',
          expect.any(Date),
          expect.any(Date),
        ]),
      )
    })
  })

  describe('consumeOAuthState', () => {
    it('should return null when state not found', async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] })

      const result = await consumeOAuthState('nonexistent')

      expect(result).toBeNull()
    })

    it('should return and delete state when found', async () => {
      const expiresAt = new Date(Date.now() + 600000)
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              return_to: '/dashboard',
              code_verifier: null,
              expires_at: expiresAt,
            },
          ],
        })
        .mockResolvedValueOnce({ wasApplied: () => true })

      const result = await consumeOAuthState('valid-state')

      expect(result).not.toBeNull()
      expect(result?.returnTo).toBe('/dashboard')
      expect(result?.codeVerifier).toBeUndefined()
      expect(mockExecute).toHaveBeenCalledTimes(2)
    })

    it('should return codeVerifier when present', async () => {
      const expiresAt = new Date(Date.now() + 600000)
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              return_to: '/profile',
              code_verifier: 'stored-verifier',
              expires_at: expiresAt,
            },
          ],
        })
        .mockResolvedValueOnce({ wasApplied: () => true })

      const result = await consumeOAuthState('pkce-state')

      expect(result?.codeVerifier).toBe('stored-verifier')
    })

    it('should return null when state is expired', async () => {
      const expiresAt = new Date(Date.now() - 1000)
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              return_to: '/dashboard',
              code_verifier: null,
              expires_at: expiresAt,
            },
          ],
        })
        .mockResolvedValueOnce(undefined)

      const result = await consumeOAuthState('expired-state')

      expect(result).toBeNull()
    })

    it('should return null when delete was not applied (concurrent consume)', async () => {
      const expiresAt = new Date(Date.now() + 600000)
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              return_to: '/dashboard',
              code_verifier: null,
              expires_at: expiresAt,
            },
          ],
        })
        .mockResolvedValueOnce({ wasApplied: () => false })

      const result = await consumeOAuthState('concurrent-state')

      expect(result).toBeNull()
    })
  })
})
