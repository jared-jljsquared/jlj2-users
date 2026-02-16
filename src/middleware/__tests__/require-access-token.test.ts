import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearConfigCache, getOidcConfig } from '../../oidc/config.ts'
import { signJwt } from '../../tokens/jwt.ts'
import { clearKeyStore, initializeKeys } from '../../tokens/key-management.ts'
import { requireAccessToken, requireScope } from '../require-access-token.ts'

describe('requireAccessToken', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    clearConfigCache()
    clearKeyStore()
    initializeKeys()
  })

  afterEach(() => {
    process.env = originalEnv
    clearConfigCache()
    clearKeyStore()
  })

  it('should return 401 when Authorization header is missing', async () => {
    const app = new Hono()
    app.get('/protected', requireAccessToken, (c) => {
      const payload = c.get('accessTokenPayload')
      return c.json({ sub: payload?.sub })
    })

    const res = await app.request('/protected')
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toContain('Bearer')
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('invalid_token')
  })

  it('should return 401 when Authorization header does not use Bearer scheme', async () => {
    const app = new Hono()
    app.get('/protected', requireAccessToken, (c) =>
      c.json({ sub: c.get('accessTokenPayload')?.sub }),
    )

    const res = await app.request('/protected', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    })
    expect(res.status).toBe(401)
  })

  it('should return 401 when token is invalid', async () => {
    const app = new Hono()
    app.get('/protected', requireAccessToken, (c) =>
      c.json({ sub: c.get('accessTokenPayload')?.sub }),
    )

    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer invalid-token' },
    })
    expect(res.status).toBe(401)
  })

  it('should attach payload to context when token is valid', async () => {
    process.env.OIDC_ISSUER = 'http://localhost:3000'
    clearConfigCache()

    const keyPair = initializeKeys()
    const issuer = getOidcConfig().issuer
    const now = Math.floor(Date.now() / 1000)

    const token = signJwt(
      {
        iss: issuer,
        sub: 'user-123',
        aud: 'client-456',
        exp: now + 3600,
        iat: now,
        scope: 'openid profile',
        client_id: 'client-456',
      },
      keyPair.privateKey,
      'RS256',
      keyPair.kid,
    )

    const app = new Hono()
    app.get('/protected', requireAccessToken, (c) => {
      const payload = c.get('accessTokenPayload')
      return c.json({ sub: payload?.sub, scope: payload?.scope })
    })

    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.sub).toBe('user-123')
    expect(body.scope).toBe('openid profile')
  })

  it('should return 401 when token is expired', async () => {
    process.env.OIDC_ISSUER = 'http://localhost:3000'
    clearConfigCache()

    const keyPair = initializeKeys()
    const issuer = getOidcConfig().issuer
    const now = Math.floor(Date.now() / 1000)

    const token = signJwt(
      {
        iss: issuer,
        sub: 'user-123',
        aud: 'client-456',
        exp: now - 3600,
        iat: now - 7200,
        scope: 'openid',
        client_id: 'client-456',
      },
      keyPair.privateKey,
      'RS256',
      keyPair.kid,
    )

    const app = new Hono()
    app.get('/protected', requireAccessToken, (c) =>
      c.json({ sub: c.get('accessTokenPayload')?.sub }),
    )

    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(401)
  })

  it('should return 401 when token issuer does not match', async () => {
    process.env.OIDC_ISSUER = 'http://localhost:3000'
    clearConfigCache()

    const keyPair = initializeKeys()
    const now = Math.floor(Date.now() / 1000)

    const token = signJwt(
      {
        iss: 'https://evil.com',
        sub: 'user-123',
        aud: 'client-456',
        exp: now + 3600,
        iat: now,
        scope: 'openid',
        client_id: 'client-456',
      },
      keyPair.privateKey,
      'RS256',
      keyPair.kid,
    )

    const app = new Hono()
    app.get('/protected', requireAccessToken, (c) =>
      c.json({ sub: c.get('accessTokenPayload')?.sub }),
    )

    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(401)
  })
})

describe('requireScope', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    clearConfigCache()
    clearKeyStore()
    initializeKeys()
  })

  afterEach(() => {
    process.env = originalEnv
    clearConfigCache()
    clearKeyStore()
  })

  it('should return 403 when required scope is missing', async () => {
    process.env.OIDC_ISSUER = 'http://localhost:3000'
    clearConfigCache()

    const keyPair = initializeKeys()
    const issuer = getOidcConfig().issuer
    const now = Math.floor(Date.now() / 1000)

    const token = signJwt(
      {
        iss: issuer,
        sub: 'user-123',
        aud: 'client-456',
        exp: now + 3600,
        iat: now,
        scope: 'openid',
        client_id: 'client-456',
      },
      keyPair.privateKey,
      'RS256',
      keyPair.kid,
    )

    const app = new Hono()
    app.get('/profile', requireAccessToken, requireScope('profile'), (c) =>
      c.json({ sub: c.get('accessTokenPayload')?.sub }),
    )

    const res = await app.request('/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('insufficient_scope')
  })

  it('should pass when token has required scope', async () => {
    process.env.OIDC_ISSUER = 'http://localhost:3000'
    clearConfigCache()

    const keyPair = initializeKeys()
    const issuer = getOidcConfig().issuer
    const now = Math.floor(Date.now() / 1000)

    const token = signJwt(
      {
        iss: issuer,
        sub: 'user-123',
        aud: 'client-456',
        exp: now + 3600,
        iat: now,
        scope: 'openid profile email',
        client_id: 'client-456',
      },
      keyPair.privateKey,
      'RS256',
      keyPair.kid,
    )

    const app = new Hono()
    app.get('/profile', requireAccessToken, requireScope('profile'), (c) =>
      c.json({ sub: c.get('accessTokenPayload')?.sub }),
    )

    const res = await app.request('/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.sub).toBe('user-123')
  })
})
