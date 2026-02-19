import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientModule from '../../database/client.ts'
import { findContactMethodsByAccountId } from '../storage.ts'

const mockExecute = vi.fn()

vi.mock('../../database/client.ts', () => ({
  getDatabaseClient: vi.fn(),
}))

vi.mock('../../database/config.ts', () => ({
  getDatabaseConfig: vi.fn(() => ({ keyspace: 'jlj2_users' })),
}))

describe('User Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientModule.getDatabaseClient).mockReturnValue({
      execute: mockExecute,
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('findContactMethodsByAccountId', () => {
    it('should return empty array when account has no contacts', async () => {
      mockExecute.mockResolvedValue({ rows: [] })

      const result = await findContactMethodsByAccountId('account-123')

      expect(result).toEqual([])
    })

    it('should return all contact methods for account', async () => {
      const now = new Date()
      mockExecute.mockResolvedValue({
        rows: [
          {
            account_id: 'account-123',
            contact_id: 'contact-1',
            contact_type: 'email',
            contact_value: 'user@example.com',
            is_primary: true,
            verified_at: now,
            created_at: now,
            updated_at: now,
          },
          {
            account_id: 'account-123',
            contact_id: 'contact-2',
            contact_type: 'phone',
            contact_value: '+15551234567',
            is_primary: true,
            verified_at: undefined,
            created_at: now,
            updated_at: now,
          },
        ],
      })

      const result = await findContactMethodsByAccountId('account-123')

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        account_id: 'account-123',
        contact_id: 'contact-1',
        contact_type: 'email',
        contact_value: 'user@example.com',
        is_primary: true,
      })
      expect(result[0].verified_at).toBeDefined()
      expect(result[1]).toMatchObject({
        account_id: 'account-123',
        contact_id: 'contact-2',
        contact_type: 'phone',
        contact_value: '+15551234567',
        is_primary: true,
      })
      expect(result[1].verified_at).toBeUndefined()
    })
  })
})
