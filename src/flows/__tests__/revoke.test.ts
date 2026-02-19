import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientService from '../../clients/service.ts'
import { clearConfigCache } from '../../oidc/config.ts'
import * as refreshTokenStorage from '../refresh-token-storage.ts'
import { handleRevokeRequest } from '../revoke.ts'

vi.mock('../refresh-token-storage.ts', () => ({
  revokeRefreshToken: vi.fn(),
}))

vi.mock('../../clients/service.ts', () => ({
  authenticateClient: vi.fn(),
  getClientById: vi.fn(),
}))

const createRevokeApp = () => {
  const app = new Hono()
  app.post('/revoke', handleRevokeRequest)
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
  scopes: ['openid', 'profile', 'email'],
  tokenEndpointAuthMethod: 'client_secret_post' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('Revoke Endpoint', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.OIDC_ISSUER = 'http://localhost:3000'
    clearConfigCache()
    vi.clearAllMocks()

    vi.mocked(clientService.authenticateClient).mockResolvedValue(
      confidentialClient,
    )
    vi.mocked(refreshTokenStorage.revokeRefreshToken).mockResolvedValue(true)
  })

  afterEach(() => {
    process.env = originalEnv
    clearConfigCache()
    vi.restoreAllMocks()
  })

  it('should return 400 when Content-Type is not form-urlencoded', async () => {
    const app = createRevokeApp()
    const res = await app.request('/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'refresh-token' }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('invalid_request')
  })

  it('should return 400 when token is missing', async () => {
    const app = createRevokeApp()
    const res = await app.request('/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuth('client-123:secret'),
      },
      body: formBody({ client_id: 'client-123' }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('invalid_request')
    expect(body.error_description).toContain('token')
  })

  it('should return 401 when client credentials are invalid', async () => {
    vi.mocked(clientService.authenticateClient).mockResolvedValue(null)

    const app = createRevokeApp()
    const res = await app.request('/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuth('client-123:wrong-secret'),
      },
      body: formBody({
        token: 'refresh-token',
      }),
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('invalid_client')
  })

  it('should return 400 when token_type_hint is invalid', async () => {
    const app = createRevokeApp()
    const res = await app.request('/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuth('client-123:secret'),
      },
      body: formBody({
        token: 'refresh-token',
        token_type_hint: 'invalid',
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('unsupported_token_type')
  })

  it('should return 200 when refresh token is revoked', async () => {
    const app = createRevokeApp()
    const res = await app.request('/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuth('client-123:secret'),
      },
      body: formBody({
        token: 'refresh-token-to-revoke',
        token_type_hint: 'refresh_token',
      }),
    })

    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
    expect(refreshTokenStorage.revokeRefreshToken).toHaveBeenCalledWith(
      'refresh-token-to-revoke',
      'client-123',
    )
  })

  it('should return 200 even when token is invalid (RFC 7009)', async () => {
    vi.mocked(refreshTokenStorage.revokeRefreshToken).mockResolvedValue(false)

    const app = createRevokeApp()
    const res = await app.request('/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuth('client-123:secret'),
      },
      body: formBody({ token: 'invalid-token' }),
    })

    expect(res.status).toBe(200)
  })

  it('should accept client_secret_post', async () => {
    const app = createRevokeApp()
    const res = await app.request('/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        token: 'refresh-token',
        client_id: 'client-123',
        client_secret: 'secret',
      }),
    })

    expect(res.status).toBe(200)
    expect(refreshTokenStorage.revokeRefreshToken).toHaveBeenCalledWith(
      'refresh-token',
      'client-123',
    )
  })
})
