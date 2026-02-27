import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientService from '../../clients/service.ts'
import { clearConfigCache } from '../../oidc/config.ts'
import { parseJwt } from '../../tokens/jwt.ts'
import { clearKeyStore, initializeKeys } from '../../tokens/key-management.ts'
import * as userService from '../../users/service.ts'
import * as authorizationCodeStorage from '../authorization-code-storage.ts'
import { generateCodeChallenge } from '../pkce.ts'
import * as refreshTokenStorage from '../refresh-token-storage.ts'
import { handleTokenRequest } from '../token.ts'

vi.mock('../authorization-code-storage.ts', () => ({
  consumeAuthorizationCode: vi.fn(),
}))

vi.mock('../refresh-token-storage.ts', () => ({
  consumeRefreshToken: vi.fn(),
  generateRefreshToken: vi.fn(),
}))

vi.mock('../../clients/service.ts', () => ({
  authenticateClient: vi.fn(),
  getClientById: vi.fn(),
}))

vi.mock('../../users/service.ts', () => ({
  getUserById: vi.fn(),
}))

const createTokenApp = () => {
  const app = new Hono()
  app.post('/token', handleTokenRequest)
  return app
}

const formBody = (params: Record<string, string>): string =>
  new URLSearchParams(params).toString()

const basicAuth = (credentials: string): string =>
  `Basic ${Buffer.from(credentials).toString('base64')}`

const confidentialClient = {
  id: 'client-123',
  name: 'Test Client',
  redirectUris: ['https://example.com/callback'],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  scopes: ['openid', 'profile', 'email', 'offline_access'],
  tokenEndpointAuthMethod: 'client_secret_post' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const activeUser = {
  sub: 'user-456',
  email: 'user@example.com',
  emailVerified: true,
  name: 'Test User',
  givenName: 'Test',
  familyName: 'User',
  picture: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
  isActive: true,
}

describe('Token Endpoint', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.OIDC_ISSUER = 'http://localhost:3000'
    clearConfigCache()
    clearKeyStore()
    initializeKeys()
    vi.clearAllMocks()

    vi.mocked(clientService.authenticateClient).mockResolvedValue(
      confidentialClient,
    )
    vi.mocked(userService.getUserById).mockResolvedValue(activeUser)
    vi.mocked(refreshTokenStorage.generateRefreshToken).mockResolvedValue(
      'new-refresh-token',
    )
  })

  afterEach(() => {
    process.env = originalEnv
    clearConfigCache()
    clearKeyStore()
    vi.restoreAllMocks()
  })

  describe('request validation', () => {
    it('should return 400 when Content-Type is not form-urlencoded', async () => {
      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'authorization_code' }),
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('invalid_request')
      expect(body.error_description).toContain('Content-Type')
    })

    it('should return 400 when grant_type is missing', async () => {
      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:secret'),
        },
        body: formBody({ client_id: 'client-123' }),
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('unsupported_grant_type')
    })

    it('should return 400 when grant_type is invalid', async () => {
      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:secret'),
        },
        body: formBody({
          grant_type: 'client_credentials',
          client_id: 'client-123',
        }),
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('unsupported_grant_type')
    })

    it('should return 401 when client credentials are invalid', async () => {
      vi.mocked(clientService.authenticateClient).mockResolvedValue(null)

      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:wrong-secret'),
        },
        body: formBody({
          grant_type: 'authorization_code',
          code: 'auth-code',
          redirect_uri: 'https://example.com/callback',
        }),
      })

      expect(res.status).toBe(401)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('invalid_client')
    })
  })

  describe('authorization_code grant', () => {
    it('should return 400 when code or redirect_uri is missing', async () => {
      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:secret'),
        },
        body: formBody({
          grant_type: 'authorization_code',
          client_id: 'client-123',
        }),
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('invalid_request')
      expect(body.error_description).toContain('code and redirect_uri')
    })

    it('should return 400 when authorization code is invalid', async () => {
      vi.mocked(
        authorizationCodeStorage.consumeAuthorizationCode,
      ).mockResolvedValue(null)

      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:secret'),
        },
        body: formBody({
          grant_type: 'authorization_code',
          code: 'invalid-code',
          redirect_uri: 'https://example.com/callback',
        }),
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('invalid_grant')
    })

    it('should return 400 when code_verifier is invalid for PKCE', async () => {
      vi.mocked(
        authorizationCodeStorage.consumeAuthorizationCode,
      ).mockResolvedValue({
        code: 'auth-code',
        client_id: 'client-123',
        redirect_uri: 'https://example.com/callback',
        scopes: ['openid', 'profile'],
        user_id: 'user-456',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
        nonce: 'nonce-123',
        expires_at: new Date(Date.now() + 60000),
        created_at: new Date(),
        auth_time: Math.floor(Date.now() / 1000),
      })

      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:secret'),
        },
        body: formBody({
          grant_type: 'authorization_code',
          code: 'auth-code',
          redirect_uri: 'https://example.com/callback',
          code_verifier: 'wrong-verifier',
        }),
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('invalid_grant')
    })

    it('should return 200 with access_token and id_token when valid', async () => {
      vi.mocked(
        authorizationCodeStorage.consumeAuthorizationCode,
      ).mockResolvedValue({
        code: 'auth-code',
        client_id: 'client-123',
        redirect_uri: 'https://example.com/callback',
        scopes: ['openid', 'profile'],
        user_id: 'user-456',
        code_challenge: null,
        code_challenge_method: null,
        nonce: 'nonce-123',
        expires_at: new Date(Date.now() + 60000),
        created_at: new Date(),
        auth_time: Math.floor(Date.now() / 1000),
      })

      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:secret'),
        },
        body: formBody({
          grant_type: 'authorization_code',
          code: 'auth-code',
          redirect_uri: 'https://example.com/callback',
        }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.access_token).toBeDefined()
      expect(typeof body.access_token).toBe('string')
      expect(body.token_type).toBe('Bearer')
      expect(body.expires_in).toBe(3600)
      expect(body.id_token).toBeDefined()
      expect(typeof body.id_token).toBe('string')
      expect(body.scope).toBe('openid profile')

      const idTokenPayload = parseJwt(body.id_token as string).payload
      expect(idTokenPayload.aud).toBe('client-123')
      expect(idTokenPayload.jti).toBeDefined()
      expect(typeof idTokenPayload.jti).toBe('string')
      expect(idTokenPayload.jti).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    })

    it('should return refresh_token when offline_access scope granted', async () => {
      const authTime = Math.floor(Date.now() / 1000)
      vi.mocked(
        authorizationCodeStorage.consumeAuthorizationCode,
      ).mockResolvedValue({
        code: 'auth-code',
        client_id: 'client-123',
        redirect_uri: 'https://example.com/callback',
        scopes: ['openid', 'offline_access'],
        user_id: 'user-456',
        code_challenge: null,
        code_challenge_method: null,
        nonce: null,
        expires_at: new Date(Date.now() + 60000),
        created_at: new Date(),
        auth_time: authTime,
      })

      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:secret'),
        },
        body: formBody({
          grant_type: 'authorization_code',
          code: 'auth-code',
          redirect_uri: 'https://example.com/callback',
        }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.refresh_token).toBe('new-refresh-token')
      expect(refreshTokenStorage.generateRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          client_id: 'client-123',
          user_id: 'user-456',
          scopes: ['openid', 'offline_access'],
          auth_time: authTime,
        }),
      )
    })

    it('should accept valid PKCE with S256', async () => {
      const codeVerifier = 'verifier-12345'
      const codeChallenge = generateCodeChallenge(codeVerifier, 'S256')

      vi.mocked(
        authorizationCodeStorage.consumeAuthorizationCode,
      ).mockResolvedValue({
        code: 'auth-code',
        client_id: 'client-123',
        redirect_uri: 'https://example.com/callback',
        scopes: ['openid'],
        user_id: 'user-456',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        nonce: null,
        expires_at: new Date(Date.now() + 60000),
        created_at: new Date(),
        auth_time: Math.floor(Date.now() / 1000),
      })

      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:secret'),
        },
        body: formBody({
          grant_type: 'authorization_code',
          code: 'auth-code',
          redirect_uri: 'https://example.com/callback',
          code_verifier: codeVerifier,
        }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.access_token).toBeDefined()
      expect(body.id_token).toBeDefined()
    })
  })

  describe('refresh_token grant', () => {
    it('should return 400 when refresh_token is missing', async () => {
      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:secret'),
        },
        body: formBody({ grant_type: 'refresh_token' }),
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('invalid_request')
      expect(body.error_description).toContain('refresh_token')
    })

    it('should return 400 when refresh token is invalid', async () => {
      vi.mocked(refreshTokenStorage.consumeRefreshToken).mockResolvedValue(null)

      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:secret'),
        },
        body: formBody({
          grant_type: 'refresh_token',
          refresh_token: 'invalid-refresh-token',
        }),
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('invalid_grant')
    })

    it('should return 401 when public client requests refresh_token grant', async () => {
      vi.mocked(clientService.authenticateClient).mockResolvedValue(null)
      vi.mocked(clientService.getClientById).mockResolvedValue({
        ...confidentialClient,
        tokenEndpointAuthMethod: 'none',
      })

      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody({
          grant_type: 'refresh_token',
          client_id: 'client-123',
          refresh_token: 'refresh-token',
        }),
      })

      expect(res.status).toBe(401)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('invalid_client')
    })

    it('should return 200 with new tokens when refresh token is valid', async () => {
      const originalAuthTime = Math.floor(Date.now() / 1000) - 3600
      vi.mocked(refreshTokenStorage.consumeRefreshToken).mockResolvedValue({
        token: 'old-refresh-token',
        client_id: 'client-123',
        user_id: 'user-456',
        scopes: ['openid', 'profile'],
        expires_at: new Date(Date.now() + 86400000),
        created_at: new Date(),
        auth_time: originalAuthTime,
      })

      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:secret'),
        },
        body: formBody({
          grant_type: 'refresh_token',
          refresh_token: 'old-refresh-token',
        }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.access_token).toBeDefined()
      expect(body.id_token).toBeDefined()
      expect(body.refresh_token).toBe('new-refresh-token')
      expect(body.token_type).toBe('Bearer')
      expect(body.expires_in).toBe(3600)

      const idTokenPayload = parseJwt(body.id_token as string).payload
      expect(idTokenPayload.auth_time).toBe(originalAuthTime)
    })

    it('should use created_at as auth_time when refresh token has no auth_time (legacy token)', async () => {
      const createdDate = new Date(Date.now() - 7200000)
      vi.mocked(refreshTokenStorage.consumeRefreshToken).mockResolvedValue({
        token: 'legacy-refresh-token',
        client_id: 'client-123',
        user_id: 'user-456',
        scopes: ['openid', 'profile'],
        expires_at: new Date(Date.now() + 86400000),
        created_at: createdDate,
        auth_time: null,
      })

      const app = createTokenApp()
      const res = await app.request('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuth('client-123:secret'),
        },
        body: formBody({
          grant_type: 'refresh_token',
          refresh_token: 'legacy-refresh-token',
        }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      const idTokenPayload = parseJwt(body.id_token as string).payload
      const expectedAuthTime = Math.floor(createdDate.getTime() / 1000)
      expect(idTokenPayload.auth_time).toBe(expectedAuthTime)
    })
  })
})
