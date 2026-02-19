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

  describe('storeOAuthState and consumeOAuthState round-trip', () => {
    it('should return stored state when consumed after store', async () => {
      const state = 'state-123'
      const returnTo = '/dashboard'
      const codeVerifier = 'my-verifier'

      mockExecute
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [
            {
              return_to: returnTo,
              code_verifier: codeVerifier,
              expires_at: new Date(Date.now() + 600000),
            },
          ],
        })
        .mockResolvedValueOnce({ wasApplied: () => true })

      await storeOAuthState({ state, returnTo, codeVerifier })
      const result = await consumeOAuthState(state)

      expect(result).not.toBeNull()
      expect(result?.returnTo).toBe(returnTo)
      expect(result?.codeVerifier).toBe(codeVerifier)
    })

    it('should return state without codeVerifier when not stored', async () => {
      const state = 'state-no-pkce'
      const returnTo = '/profile'

      mockExecute
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [
            {
              return_to: returnTo,
              code_verifier: null,
              expires_at: new Date(Date.now() + 600000),
            },
          ],
        })
        .mockResolvedValueOnce({ wasApplied: () => true })

      await storeOAuthState({ state, returnTo })
      const result = await consumeOAuthState(state)

      expect(result).not.toBeNull()
      expect(result?.returnTo).toBe(returnTo)
      expect(result?.codeVerifier).toBeUndefined()
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
