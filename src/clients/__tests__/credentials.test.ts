import { describe, expect, it } from 'vitest'
import { hashClientSecret, verifyClientSecret } from '../credentials.ts'

describe('Client Credentials', () => {
  describe('hashClientSecret', () => {
    it('should hash a client secret', () => {
      const secret = 'my-secret-value'
      const hash = hashClientSecret(secret)

      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(64) // SHA-256 hex is 64 chars
      expect(hash).toMatch(/^[a-f0-9]+$/)
    })

    it('should produce consistent hashes for same input', () => {
      const secret = 'consistent-secret'
      const hash1 = hashClientSecret(secret)
      const hash2 = hashClientSecret(secret)

      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashClientSecret('secret1')
      const hash2 = hashClientSecret('secret2')

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('verifyClientSecret', () => {
    it('should verify correct password', () => {
      const secret = 'test-secret'
      const hash = hashClientSecret(secret)

      const isValid = verifyClientSecret(secret, hash)
      expect(isValid).toBe(true)
    })

    it('should reject incorrect password', () => {
      const secret = 'test-secret'
      const hash = hashClientSecret(secret)

      const isValid = verifyClientSecret('wrong-secret', hash)
      expect(isValid).toBe(false)
    })

    it('should reject empty secret when hash exists', () => {
      const hash = hashClientSecret('non-empty')

      const isValid = verifyClientSecret('', hash)
      expect(isValid).toBe(false)
    })

    it('should handle different hash length gracefully', () => {
      const hash = 'short'
      const isValid = verifyClientSecret('secret', hash)
      expect(isValid).toBe(false)
    })
  })
})
