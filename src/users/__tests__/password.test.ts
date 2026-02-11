import { nanoid } from 'nanoid'
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../password.ts'

describe('Password Hashing', () => {
  it('should hash passwords correctly', async () => {
    const password = 'test-password-123'
    const { hash, salt } = await hashPassword(password)

    expect(hash).toBeDefined()
    expect(salt).toBeDefined()
    expect(typeof hash).toBe('string')
    expect(typeof salt).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
    expect(salt.length).toBeGreaterThan(0)
  })

  it('should produce different hashes for same password', async () => {
    const password = 'test-password'
    const { hash: hash1, salt: salt1 } = await hashPassword(password)
    const { hash: hash2, salt: salt2 } = await hashPassword(password)

    expect(hash1).not.toBe(hash2) // Different salts produce different hashes
    expect(salt1).not.toBe(salt2) // nanoid generates unique salts
  })

  it('should verify correct password', async () => {
    const password = 'test-password'
    const { hash, salt } = await hashPassword(password)
    const isValid = await verifyPassword(password, hash, salt)

    expect(isValid).toBe(true)
  })

  it('should reject incorrect password', async () => {
    const password = 'test-password'
    const { hash, salt } = await hashPassword(password)
    const isValid = await verifyPassword('wrong-password', hash, salt)

    expect(isValid).toBe(false)
  })

  it('should reject password with incorrect salt', async () => {
    const password = 'test-password'
    const { hash } = await hashPassword(password)
    const wrongSalt = nanoid()
    const isValid = await verifyPassword(password, hash, wrongSalt)

    expect(isValid).toBe(false)
  })

  it('should handle empty password', async () => {
    const password = ''
    const { hash, salt } = await hashPassword(password)
    const isValid = await verifyPassword(password, hash, salt)

    expect(isValid).toBe(true)
  })

  it('should handle long passwords', async () => {
    const password = 'a'.repeat(1000)
    const { hash, salt } = await hashPassword(password)
    const isValid = await verifyPassword(password, hash, salt)

    expect(isValid).toBe(true)
  })
})
