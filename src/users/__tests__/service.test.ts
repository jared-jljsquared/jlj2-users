import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticateUser, getUserById, registerUser } from '../service.ts'
import * as storage from '../storage.ts'

// Mock storage layer
vi.mock('../storage.ts', () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  updateLastLogin: vi.fn(),
}))

// Mock password utilities
vi.mock('../password.ts', async () => {
  const actual = await vi.importActual('../password.ts')
  return {
    ...actual,
    hashPassword: vi.fn(),
    verifyPassword: vi.fn(),
  }
})

import { hashPassword, verifyPassword } from '../password.ts'

describe('User Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('registerUser', () => {
    it('should register new user successfully', async () => {
      const input = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      }

      vi.mocked(hashPassword).mockResolvedValue({
        hash: 'hashed-password',
        salt: 'salt-value',
      })

      vi.mocked(storage.findUserByEmail).mockResolvedValue(null)

      vi.mocked(storage.createUser).mockResolvedValue({
        sub: 'account-id',
        email: 'test@example.com',
        emailVerified: false,
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
      })

      const user = await registerUser(input)

      expect(user.email).toBe('test@example.com')
      expect(user.name).toBe('Test User')
      expect(storage.findUserByEmail).toHaveBeenCalledWith('test@example.com')
      expect(hashPassword).toHaveBeenCalledWith('password123')
      expect(storage.createUser).toHaveBeenCalledWith(
        input,
        'hashed-password',
        'salt-value',
      )
    })

    it('should reject invalid email format', async () => {
      const input = {
        email: 'invalid-email',
        password: 'password123',
      }

      await expect(registerUser(input)).rejects.toThrow('Invalid email address')
    })

    it('should reject duplicate email', async () => {
      const input = {
        email: 'existing@example.com',
        password: 'password123',
      }

      vi.mocked(storage.findUserByEmail).mockResolvedValue({
        sub: 'existing-id',
        email: 'existing@example.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        passwordDigest: 'hash',
        passwordSalt: 'salt',
      })

      await expect(registerUser(input)).rejects.toThrow(
        'User already exists with this email',
      )
    })
  })

  describe('authenticateUser', () => {
    it('should authenticate user with correct credentials', async () => {
      const input = {
        email: 'test@example.com',
        password: 'password123',
      }

      vi.mocked(storage.findUserByEmail).mockResolvedValue({
        sub: 'account-id',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        passwordDigest: 'hashed-password',
        passwordSalt: 'salt-value',
      })

      vi.mocked(verifyPassword).mockResolvedValue(true)
      vi.mocked(storage.updateLastLogin).mockResolvedValue()

      const user = await authenticateUser(input)

      expect(user.email).toBe('test@example.com')
      expect(verifyPassword).toHaveBeenCalledWith(
        'password123',
        'hashed-password',
        'salt-value',
      )
      expect(storage.updateLastLogin).toHaveBeenCalledWith('account-id')
    })

    it('should reject invalid email format', async () => {
      const input = {
        email: 'invalid-email',
        password: 'password123',
      }

      await expect(authenticateUser(input)).rejects.toThrow(
        'Invalid email address',
      )
    })

    it('should reject non-existent user', async () => {
      const input = {
        email: 'nonexistent@example.com',
        password: 'password123',
      }

      vi.mocked(storage.findUserByEmail).mockResolvedValue(null)

      await expect(authenticateUser(input)).rejects.toThrow(
        'Invalid email or password',
      )
    })

    it('should reject incorrect password', async () => {
      const input = {
        email: 'test@example.com',
        password: 'wrong-password',
      }

      vi.mocked(storage.findUserByEmail).mockResolvedValue({
        sub: 'account-id',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        passwordDigest: 'hashed-password',
        passwordSalt: 'salt-value',
      })

      vi.mocked(verifyPassword).mockResolvedValue(false)

      await expect(authenticateUser(input)).rejects.toThrow(
        'Invalid email or password',
      )
    })

    it('should reject inactive account', async () => {
      const input = {
        email: 'test@example.com',
        password: 'password123',
      }

      vi.mocked(storage.findUserByEmail).mockResolvedValue({
        sub: 'account-id',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: false,
        passwordDigest: 'hashed-password',
        passwordSalt: 'salt-value',
      })

      await expect(authenticateUser(input)).rejects.toThrow(
        'Account is not active',
      )
    })
  })

  describe('getUserById', () => {
    it('should return user by ID', async () => {
      const user = {
        sub: 'account-id',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
      }

      vi.mocked(storage.findUserById).mockResolvedValue(user)

      const result = await getUserById('account-id')

      expect(result).toEqual(user)
      expect(storage.findUserById).toHaveBeenCalledWith('account-id')
    })

    it('should return null for non-existent user', async () => {
      vi.mocked(storage.findUserById).mockResolvedValue(null)

      const result = await getUserById('non-existent-id')

      expect(result).toBeNull()
    })
  })
})
