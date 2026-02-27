import { describe, expect, it } from 'vitest'
import {
  generateCodeChallenge,
  generateCodeVerifier,
  verifyCodeVerifier,
} from '../pkce.ts'

describe('PKCE', () => {
  describe('generateCodeVerifier', () => {
    it('should generate base64url encoded random string', () => {
      const verifier = generateCodeVerifier()
      expect(verifier).toBeDefined()
      expect(verifier.length).toBeGreaterThanOrEqual(43)
      expect(verifier.length).toBeLessThanOrEqual(128)
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('should generate unique values', () => {
      const v1 = generateCodeVerifier()
      const v2 = generateCodeVerifier()
      expect(v1).not.toBe(v2)
    })
  })

  describe('verifyCodeVerifier', () => {
    it('should verify S256 code verifier', () => {
      const verifier = 'test-verifier-123'
      const challenge = generateCodeChallenge(verifier, 'S256')
      const isValid = verifyCodeVerifier(verifier, challenge, 'S256')
      expect(isValid).toBe(true)
    })

    it('should verify plain code verifier', () => {
      const verifier = 'test-verifier-123'
      const challenge = generateCodeChallenge(verifier, 'plain')
      const isValid = verifyCodeVerifier(verifier, challenge, 'plain')
      expect(isValid).toBe(true)
    })

    it('should reject invalid code verifier for S256', () => {
      const verifier = 'test-verifier-123'
      const challenge = generateCodeChallenge(verifier, 'S256')
      const isValid = verifyCodeVerifier('wrong-verifier', challenge, 'S256')
      expect(isValid).toBe(false)
    })

    it('should reject invalid code verifier for plain', () => {
      const verifier = 'test-verifier-123'
      const challenge = verifier
      const isValid = verifyCodeVerifier('wrong-verifier', challenge, 'plain')
      expect(isValid).toBe(false)
    })

    it('should reject unknown method', () => {
      const isValid = verifyCodeVerifier('verifier', 'challenge', 'unknown')
      expect(isValid).toBe(false)
    })
  })

  describe('generateCodeChallenge', () => {
    it('should generate base64url encoded S256 challenge', () => {
      const verifier = 'abc123'
      const challenge = generateCodeChallenge(verifier, 'S256')
      expect(challenge).toBeDefined()
      expect(challenge).not.toBe(verifier)
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('should return verifier as-is for plain', () => {
      const verifier = 'abc123'
      const challenge = generateCodeChallenge(verifier, 'plain')
      expect(challenge).toBe(verifier)
    })
  })
})
