import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientService from '../../clients/service.ts'
import { handleIntrospectRequest } from '../introspect.ts'
import * as refreshTokenStorage from '../refresh-token-storage.ts'

vi.mock('../../clients/service.ts', () => ({
  authenticateClient: vi.fn(),
  getClientById: vi.fn(),
}))

vi.mock('../refresh-token-storage.ts', () => ({
  getRefreshTokenByValue: vi.fn(),
}))

describe('Token Introspection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OIDC_ISSUER = 'http://localhost:3000'
    vi.mocked(clientService.authenticateClient).mockResolvedValue({
      id: 'client-123',
      name: 'Test',
      redirectUris: ['https://example.com/cb'],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scopes: ['openid'],
      tokenEndpointAuthMethod: 'client_secret_post',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return 401 when client authentication is missing', async () => {
    const app = new Hono()
    app.post('/introspect', handleIntrospectRequest)

    const res = await app.request('/introspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: 'some-token' }),
    })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('invalid_client')
  })

  it('should return invalid_request when token is missing', async () => {
    const app = new Hono()
    app.post('/introspect', handleIntrospectRequest)

    const res = await app.request('/introspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from('client-123:secret').toString('base64')}`,
      },
      body: new URLSearchParams({}),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_request')
  })

  it('should return active: false for invalid token', async () => {
    const app = new Hono()
    app.post('/introspect', handleIntrospectRequest)

    const res = await app.request('/introspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from('client-123:secret').toString('base64')}`,
      },
      body: new URLSearchParams({ token: 'invalid.jwt.token' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.active).toBe(false)
  })

  it('should return active: true for valid refresh token', async () => {
    vi.mocked(refreshTokenStorage.getRefreshTokenByValue).mockResolvedValue({
      token_value: 'refresh-token-123',
      client_id: 'client-123',
      user_id: 'user-456',
      scopes: ['openid', 'profile'],
      expires_at: new Date(Date.now() + 86400000),
      created_at: new Date(),
    })

    const app = new Hono()
    app.post('/introspect', handleIntrospectRequest)

    const res = await app.request('/introspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from('client-123:secret').toString('base64')}`,
      },
      body: new URLSearchParams({
        token: 'refresh-token-123',
        token_type_hint: 'refresh_token',
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.active).toBe(true)
    expect(body.sub).toBe('user-456')
    expect(body.client_id).toBe('client-123')
    expect(body.token_type).toBe('refresh_token')
  })
})
