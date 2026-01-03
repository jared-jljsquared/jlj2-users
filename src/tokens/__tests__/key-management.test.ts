import { beforeEach, describe, expect, it } from 'vitest'
import {
  cleanupExpiredKeys,
  clearKeyStore,
  generateKeyPair,
  getActiveKeyPair,
  getActiveKeys,
  getAllKeyPairs,
  getJwks,
  getKeyPair,
  getLatestActiveKey,
  initializeKeys,
  keyToJwk,
  retireKey,
  rotateKeys,
} from '../key-management.ts'

describe('Key Management', () => {
  beforeEach(() => {
    clearKeyStore()
  })

  describe('generateKeyPair', () => {
    it('should generate RSA key pair with RS256 algorithm', () => {
      const keyPair = generateKeyPair('RS256')
      expect(keyPair.algorithm).toBe('RS256')
      expect(keyPair.kid).toBeTruthy()
      expect(keyPair.kid).toMatch(/^kid-/)
      expect(keyPair.privateKey).toBeTruthy()
      expect(keyPair.publicKey).toBeTruthy()
      expect(keyPair.createdAt).toBeGreaterThan(0)
      expect(keyPair.isActive).toBe(true)
      expect(keyPair.expiresAt).toBeGreaterThan(keyPair.createdAt)
    })

    it('should generate ECDSA key pair with ES256 algorithm', () => {
      const keyPair = generateKeyPair('ES256')
      expect(keyPair.algorithm).toBe('ES256')
      expect(keyPair.kid).toBeTruthy()
      expect(keyPair.privateKey).toBeTruthy()
      expect(keyPair.publicKey).toBeTruthy()
      expect(keyPair.isActive).toBe(true)
    })

    it('should generate ECDSA key pair with ES384 algorithm', () => {
      const keyPair = generateKeyPair('ES384')
      expect(keyPair.algorithm).toBe('ES384')
      expect(keyPair.privateKey).toBeTruthy()
      expect(keyPair.publicKey).toBeTruthy()
    })

    it('should generate unique key IDs for each key', () => {
      const keyPair1 = generateKeyPair('RS256')
      const keyPair2 = generateKeyPair('RS256')
      expect(keyPair1.kid).not.toBe(keyPair2.kid)
    })

    it('should throw error for unsupported algorithms', () => {
      // HS256 is a valid JwtAlgorithm but not supported for key pair generation
      // The function accepts the type but throws at runtime for HMAC algorithms
      expect(() => {
        generateKeyPair('HS256')
      }).toThrow()
    })

    it('should accept custom expiration time', () => {
      const expirationMs = 1000 * 60 * 60 * 24 // 1 day
      const keyPair = generateKeyPair('RS256', expirationMs)
      const expectedExpiration = keyPair.createdAt + expirationMs
      expect(keyPair.expiresAt).toBe(expectedExpiration)
    })
  })

  describe('getKeyPair', () => {
    it('should retrieve key pair by kid', () => {
      const keyPair = generateKeyPair('RS256')
      const retrieved = getKeyPair(keyPair.kid)
      expect(retrieved).toBeDefined()
      expect(retrieved?.kid).toBe(keyPair.kid)
      expect(retrieved?.algorithm).toBe(keyPair.algorithm)
    })

    it('should return undefined for non-existent kid', () => {
      const retrieved = getKeyPair('non-existent-kid')
      expect(retrieved).toBeUndefined()
    })
  })

  describe('getAllKeyPairs', () => {
    it('should return all key pairs', () => {
      const keyPair1 = generateKeyPair('RS256')
      const keyPair2 = generateKeyPair('ES256')
      const allKeys = getAllKeyPairs()
      expect(allKeys.length).toBe(2)
      expect(allKeys.map((k) => k.kid)).toContain(keyPair1.kid)
      expect(allKeys.map((k) => k.kid)).toContain(keyPair2.kid)
    })

    it('should return empty array when no keys exist', () => {
      const allKeys = getAllKeyPairs()
      expect(allKeys).toEqual([])
    })
  })

  describe('getActiveKeys', () => {
    it('should return only active keys', () => {
      const keyPair1 = generateKeyPair('RS256')
      const keyPair2 = generateKeyPair('ES256')
      retireKey(keyPair1.kid)

      const activeKeys = getActiveKeys()
      expect(activeKeys.length).toBe(1)
      expect(activeKeys[0].kid).toBe(keyPair2.kid)
    })

    it('should exclude expired keys', () => {
      // Create a key with very short expiration (1ms)
      generateKeyPair('RS256', 1)
      // Wait for expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const activeKeys = getActiveKeys()
          expect(activeKeys.length).toBe(0)
          resolve()
        }, 10)
      })
    })

    it('should return empty array when no active keys exist', () => {
      const activeKeys = getActiveKeys()
      expect(activeKeys).toEqual([])
    })
  })

  describe('getActiveKeyPair', () => {
    it('should retrieve active key pair by kid', () => {
      const keyPair = generateKeyPair('RS256')
      const retrieved = getActiveKeyPair(keyPair.kid)
      expect(retrieved).toBeDefined()
      expect(retrieved?.kid).toBe(keyPair.kid)
    })

    it('should return undefined for retired key', () => {
      const keyPair = generateKeyPair('RS256')
      retireKey(keyPair.kid)
      const retrieved = getActiveKeyPair(keyPair.kid)
      expect(retrieved).toBeUndefined()
    })

    it('should return undefined for non-existent kid', () => {
      const retrieved = getActiveKeyPair('non-existent-kid')
      expect(retrieved).toBeUndefined()
    })
  })

  describe('getLatestActiveKey', () => {
    it('should return the most recent active key for algorithm', () => {
      generateKeyPair('RS256')
      // Small delay to ensure different timestamps
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const keyPair2 = generateKeyPair('RS256')
          const latest = getLatestActiveKey('RS256')
          expect(latest).toBeDefined()
          expect(latest?.kid).toBe(keyPair2.kid)
          resolve()
        }, 10)
      })
    })

    it('should return undefined when no active keys exist for algorithm', () => {
      generateKeyPair('ES256')
      const latest = getLatestActiveKey('RS256')
      expect(latest).toBeUndefined()
    })

    it('should use default algorithm when not specified', () => {
      const keyPair = generateKeyPair('RS256')
      const latest = getLatestActiveKey()
      expect(latest).toBeDefined()
      expect(latest?.kid).toBe(keyPair.kid)
    })
  })

  describe('retireKey', () => {
    it('should retire a key pair', () => {
      const keyPair = generateKeyPair('RS256')
      const retired = retireKey(keyPair.kid)
      expect(retired).toBe(true)

      const retrieved = getKeyPair(keyPair.kid)
      expect(retrieved?.isActive).toBe(false)
    })

    it('should return false for non-existent kid', () => {
      const retired = retireKey('non-existent-kid')
      expect(retired).toBe(false)
    })

    it('should remove key from active keys after retirement', () => {
      const keyPair = generateKeyPair('RS256')
      retireKey(keyPair.kid)
      const activeKeys = getActiveKeys()
      expect(activeKeys.map((k) => k.kid)).not.toContain(keyPair.kid)
    })
  })

  describe('cleanupExpiredKeys', () => {
    it('should remove expired keys', () => {
      // Create a key with very short expiration
      const keyPair = generateKeyPair('RS256', 1)
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const removedCount = cleanupExpiredKeys()
          expect(removedCount).toBe(1)
          const retrieved = getKeyPair(keyPair.kid)
          expect(retrieved).toBeUndefined()
          resolve()
        }, 10)
      })
    })

    it('should not remove active keys', () => {
      const keyPair = generateKeyPair('RS256')
      const removedCount = cleanupExpiredKeys()
      expect(removedCount).toBe(0)
      const retrieved = getKeyPair(keyPair.kid)
      expect(retrieved).toBeDefined()
    })

    it('should return count of removed keys', () => {
      // Create multiple expired keys
      generateKeyPair('RS256', 1)
      generateKeyPair('ES256', 1)
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const removedCount = cleanupExpiredKeys()
          expect(removedCount).toBe(2)
          resolve()
        }, 10)
      })
    })
  })

  describe('initializeKeys', () => {
    it('should generate default key if none exist', () => {
      const keyPair = initializeKeys()
      expect(keyPair).toBeDefined()
      expect(keyPair.algorithm).toBe('RS256')
      expect(keyPair.isActive).toBe(true)
    })

    it('should return existing active key if available', () => {
      const existingKey = generateKeyPair('RS256')
      const keyPair = initializeKeys()
      expect(keyPair.kid).toBe(existingKey.kid)
    })

    it('should generate new key if all existing keys are expired', () => {
      generateKeyPair('RS256', 1)
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          cleanupExpiredKeys()
          const keyPair = initializeKeys()
          expect(keyPair).toBeDefined()
          expect(keyPair.isActive).toBe(true)
          resolve()
        }, 10)
      })
    })
  })

  describe('rotateKeys', () => {
    it('should generate new key pair', () => {
      const oldKey = generateKeyPair('RS256')
      const newKey = rotateKeys('RS256')
      expect(newKey.kid).not.toBe(oldKey.kid)
      expect(newKey.algorithm).toBe('RS256')
    })

    it('should keep old keys active by default', () => {
      const oldKey = generateKeyPair('RS256')
      rotateKeys('RS256')
      const activeKeys = getActiveKeys()
      expect(activeKeys.length).toBeGreaterThan(1)
      expect(activeKeys.map((k) => k.kid)).toContain(oldKey.kid)
    })

    it('should retire old keys when retireOldKeys is true', () => {
      const oldKey = generateKeyPair('RS256')
      rotateKeys('RS256', true)
      const activeKeys = getActiveKeys()
      expect(activeKeys.map((k) => k.kid)).not.toContain(oldKey.kid)
    })

    it('should use default algorithm when not specified', () => {
      const newKey = rotateKeys()
      expect(newKey.algorithm).toBe('RS256')
    })
  })

  describe('keyToJwk', () => {
    it('should convert RSA public key to JWK format', () => {
      const keyPair = generateKeyPair('RS256')
      const jwk = keyToJwk(keyPair.publicKey, keyPair.kid, 'RS256')
      expect(jwk.kty).toBe('RSA')
      expect(jwk.kid).toBe(keyPair.kid)
      expect(jwk.use).toBe('sig')
      expect(jwk.alg).toBe('RS256')
      if (jwk.kty === 'RSA') {
        expect(jwk.n).toBeTruthy()
        expect(jwk.e).toBeTruthy()
        expect(typeof jwk.n).toBe('string')
        expect(typeof jwk.e).toBe('string')
      }
    })

    it('should convert ECDSA public key to JWK format', () => {
      const keyPair = generateKeyPair('ES256')
      const jwk = keyToJwk(keyPair.publicKey, keyPair.kid, 'ES256')
      expect(jwk.kty).toBe('EC')
      expect(jwk.kid).toBe(keyPair.kid)
      expect(jwk.use).toBe('sig')
      expect(jwk.alg).toBe('ES256')
      if (jwk.kty === 'EC') {
        expect(jwk.crv).toBe('P-256')
        expect(jwk.x).toBeTruthy()
        expect(jwk.y).toBeTruthy()
        expect(typeof jwk.x).toBe('string')
        expect(typeof jwk.y).toBe('string')
      }
    })

    it('should convert ES384 key with correct curve', () => {
      const keyPair = generateKeyPair('ES384')
      const jwk = keyToJwk(keyPair.publicKey, keyPair.kid, 'ES384')
      expect(jwk.kty).toBe('EC')
      if (jwk.kty === 'EC') {
        expect(jwk.crv).toBe('P-384')
      }
    })
  })

  describe('getJwks', () => {
    it('should return JWKS with all active keys', () => {
      const keyPair1 = generateKeyPair('RS256')
      const keyPair2 = generateKeyPair('ES256')
      const jwks = getJwks()
      expect(jwks.keys.length).toBe(2)
      expect(jwks.keys.map((k) => k.kid)).toContain(keyPair1.kid)
      expect(jwks.keys.map((k) => k.kid)).toContain(keyPair2.kid)
    })

    it('should exclude retired keys', () => {
      const keyPair1 = generateKeyPair('RS256')
      const keyPair2 = generateKeyPair('ES256')
      retireKey(keyPair1.kid)
      const jwks = getJwks()
      expect(jwks.keys.length).toBe(1)
      expect(jwks.keys[0].kid).toBe(keyPair2.kid)
    })

    it('should exclude expired keys', () => {
      const keyPair1 = generateKeyPair('RS256')
      generateKeyPair('ES256', 1)
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          cleanupExpiredKeys()
          const jwks = getJwks()
          expect(jwks.keys.length).toBe(1)
          expect(jwks.keys[0].kid).toBe(keyPair1.kid)
          resolve()
        }, 10)
      })
    })

    it('should return empty keys array when no active keys', () => {
      const jwks = getJwks()
      expect(jwks.keys).toEqual([])
    })

    it('should return valid JWK format for each key', () => {
      generateKeyPair('RS256')
      generateKeyPair('ES256')
      const jwks = getJwks()
      for (const jwk of jwks.keys) {
        expect(jwk).toHaveProperty('kty')
        expect(jwk).toHaveProperty('kid')
        expect(jwk).toHaveProperty('use')
        expect(jwk).toHaveProperty('alg')
        if (jwk.kty === 'RSA') {
          expect(jwk).toHaveProperty('n')
          expect(jwk).toHaveProperty('e')
        } else if (jwk.kty === 'EC') {
          expect(jwk).toHaveProperty('crv')
          expect(jwk).toHaveProperty('x')
          expect(jwk).toHaveProperty('y')
        }
      }
    })
  })
})
