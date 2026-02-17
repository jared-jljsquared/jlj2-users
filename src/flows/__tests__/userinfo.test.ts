import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAccessToken } from '../../middleware/require-access-token.ts'
import { clearConfigCache, getOidcConfig } from '../../oidc/config.ts'
import { signJwt } from '../../tokens/jwt.ts'
import { clearKeyStore, initializeKeys } from '../../tokens/key-management.ts'
import * as userService from '../../users/service.ts'
import * as userStorage from '../../users/storage.ts'
import { handleUserInfo } from '../userinfo.ts'

vi.mock('../../users/service.ts', () => ({
  getUserById: vi.fn(),
}))

vi.mock('../../users/storage.ts', () => ({
  findContactMethodsByAccountId: vi.fn(),
}))

describe('UserInfo endpoint', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.OIDC_ISSUER = 'http://localhost:3000'
    clearConfigCache()
    clearKeyStore()
    initializeKeys()
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
    clearConfigCache()
    clearKeyStore()
    vi.restoreAllMocks()
  })

  const createApp = () => {
    const app = new Hono()
    app.get('/userinfo', requireAccessToken, handleUserInfo)
    return app
  }

  const createValidToken = (scope: string) => {
    const keyPair = initializeKeys()
    const issuer = getOidcConfig().issuer
    const now = Math.floor(Date.now() / 1000)
    return signJwt(
      {
        iss: issuer,
        sub: 'user-123',
        aud: 'client-456',
        exp: now + 3600,
        iat: now,
        scope,
        client_id: 'client-456',
      },
      keyPair.privateKey,
      'RS256',
      keyPair.kid,
    )
  }

  it('should return 401 when Authorization header is missing', async () => {
    const app = createApp()
    const res = await app.request('/userinfo')
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toContain('Bearer')
  })

  it('should return 401 when token is invalid', async () => {
    const app = createApp()
    const res = await app.request('/userinfo', {
      headers: { Authorization: 'Bearer invalid-token' },
    })
    expect(res.status).toBe(401)
  })

  it('should return 404 when user is not found', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue(null)

    const token = createValidToken('openid profile email')
    const app = createApp()
    const res = await app.request('/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('user_not_found')
    expect(userService.getUserById).toHaveBeenCalledWith('user-123')
  })

  it('should return 403 when user is inactive', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      sub: 'user-123',
      email: 'user@example.com',
      emailVerified: true,
      name: 'Test User',
      givenName: 'Test',
      familyName: 'User',
      picture: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: false,
    })

    const token = createValidToken('openid profile email')
    const app = createApp()
    const res = await app.request('/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('user_inactive')
  })

  it('should return sub only when scope is openid only', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      sub: 'user-123',
      email: 'user@example.com',
      emailVerified: true,
      name: 'Test User',
      givenName: 'Test',
      familyName: 'User',
      picture: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    })

    const token = createValidToken('openid')
    const app = createApp()
    const res = await app.request('/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ sub: 'user-123' })
    expect(body.email).toBeUndefined()
    expect(body.name).toBeUndefined()
  })

  it('should return email claims when email scope is granted', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      sub: 'user-123',
      email: 'user@example.com',
      emailVerified: true,
      name: 'Test User',
      givenName: 'Test',
      familyName: 'User',
      picture: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    })
    vi.mocked(userStorage.findContactMethodsByAccountId).mockResolvedValue([
      {
        account_id: 'user-123',
        contact_id: 'c1',
        contact_type: 'email',
        contact_value: 'user@example.com',
        is_primary: true,
        verified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    const token = createValidToken('openid email')
    const app = createApp()
    const res = await app.request('/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.sub).toBe('user-123')
    expect(body.email).toBe('user@example.com')
    expect(body.email_verified).toBe(true)
    expect(body.emails).toEqual([
      { value: 'user@example.com', verified: true, primary: true },
    ])
    expect(body.phone_numbers).toEqual([])
  })

  it('should return emails and phone_numbers arrays when email scope is granted', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      sub: 'user-123',
      email: 'primary@example.com',
      emailVerified: true,
      name: undefined,
      givenName: undefined,
      familyName: undefined,
      picture: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    })
    vi.mocked(userStorage.findContactMethodsByAccountId).mockResolvedValue([
      {
        account_id: 'user-123',
        contact_id: 'c1',
        contact_type: 'email',
        contact_value: 'primary@example.com',
        is_primary: true,
        verified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        account_id: 'user-123',
        contact_id: 'c2',
        contact_type: 'email',
        contact_value: 'secondary@example.com',
        is_primary: false,
        verified_at: undefined,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        account_id: 'user-123',
        contact_id: 'c3',
        contact_type: 'phone',
        contact_value: '+15551234567',
        is_primary: true,
        verified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        account_id: 'user-123',
        contact_id: 'c4',
        contact_type: 'phone',
        contact_value: '+15559876543',
        is_primary: false,
        verified_at: undefined,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    const token = createValidToken('openid email')
    const app = createApp()
    const res = await app.request('/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.email).toBe('primary@example.com')
    expect(body.email_verified).toBe(true)
    expect(body.emails).toEqual([
      { value: 'primary@example.com', verified: true, primary: true },
      { value: 'secondary@example.com', verified: false, primary: false },
    ])
    expect(body.phone_numbers).toEqual([
      { value: '+15551234567', verified: true, primary: true },
      { value: '+15559876543', verified: false, primary: false },
    ])
    expect(userStorage.findContactMethodsByAccountId).toHaveBeenCalledWith(
      'user-123',
    )
  })

  it('should return profile claims when profile scope is granted', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      sub: 'user-123',
      email: 'user@example.com',
      emailVerified: true,
      name: 'Test User',
      givenName: 'Test',
      familyName: 'User',
      picture: 'https://example.com/avatar.png',
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    })

    const token = createValidToken('openid profile')
    const app = createApp()
    const res = await app.request('/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.sub).toBe('user-123')
    expect(body.name).toBe('Test User')
    expect(body.given_name).toBe('Test')
    expect(body.family_name).toBe('User')
    expect(body.picture).toBe('https://example.com/avatar.png')
  })

  it('should return full claims when openid profile email scopes are granted', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      sub: 'user-123',
      email: 'user@example.com',
      emailVerified: true,
      name: 'Test User',
      givenName: 'Test',
      familyName: 'User',
      picture: 'https://example.com/avatar.png',
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    })
    vi.mocked(userStorage.findContactMethodsByAccountId).mockResolvedValue([
      {
        account_id: 'user-123',
        contact_id: 'c1',
        contact_type: 'email',
        contact_value: 'user@example.com',
        is_primary: true,
        verified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    const token = createValidToken('openid profile email')
    const app = createApp()
    const res = await app.request('/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      sub: 'user-123',
      email: 'user@example.com',
      email_verified: true,
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      picture: 'https://example.com/avatar.png',
    })
    expect(body.emails).toEqual([
      { value: 'user@example.com', verified: true, primary: true },
    ])
    expect(body.phone_numbers).toEqual([])
  })

  it('should omit optional profile fields when undefined', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      sub: 'user-123',
      email: 'user@example.com',
      emailVerified: false,
      name: undefined,
      givenName: undefined,
      familyName: undefined,
      picture: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    })
    vi.mocked(userStorage.findContactMethodsByAccountId).mockResolvedValue([])

    const token = createValidToken('openid profile email')
    const app = createApp()
    const res = await app.request('/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.sub).toBe('user-123')
    expect(body.email).toBe('user@example.com')
    expect(body.email_verified).toBe(false)
    expect(body.emails).toEqual([])
    expect(body.phone_numbers).toEqual([])
    expect(body.name).toBeUndefined()
    expect(body.given_name).toBeUndefined()
    expect(body.family_name).toBeUndefined()
    expect(body.picture).toBeUndefined()
  })

  it('should set Cache-Control and Pragma headers', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      sub: 'user-123',
      email: 'user@example.com',
      emailVerified: true,
      name: undefined,
      givenName: undefined,
      familyName: undefined,
      picture: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    })

    const token = createValidToken('openid')
    const app = createApp()
    const res = await app.request('/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Pragma')).toBe('no-cache')
  })
})
