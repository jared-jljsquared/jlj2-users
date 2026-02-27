import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearConfigCache } from '../../oidc/config.ts'
import { clearKeyStore, initializeKeys } from '../../tokens/key-management.ts'
import { handleAuthorization } from '../authorization.ts'
import * as authorizationCodeStorage from '../authorization-code-storage.ts'
import * as authorizationValidation from '../authorization-validation.ts'
import { createSessionToken, getSessionCookieName } from '../session.ts'

vi.mock('../authorization-validation.ts', () => ({
  validateAuthorizationRequest: vi.fn(),
}))

vi.mock('../authorization-code-storage.ts', () => ({
  generateAuthorizationCode: vi.fn(),
}))

const createAuthorizationApp = () => {
  const app = new Hono()
  app.get('/authorize', handleAuthorization)
  return app
}

describe('Authorization Endpoint', () => {
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

  it('should redirect to login when unauthenticated', async () => {
    vi.mocked(
      authorizationValidation.validateAuthorizationRequest,
    ).mockResolvedValue({
      isValid: true,
      data: {
        clientId: 'client-123',
        redirectUri: 'https://example.com/callback',
        scopes: ['openid'],
        state: 'state-123',
        codeChallenge: null,
        codeChallengeMethod: null,
        nonce: null,
        prompt: null,
        maxAge: null,
      },
    })

    const app = createAuthorizationApp()
    const res = await app.request(
      '/authorize?client_id=client-123&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&response_type=code&scope=openid&state=state-123',
    )

    expect(res.status).toBe(302)
    const location = res.headers.get('Location') ?? ''
    expect(location).toContain('/login')
    expect(location).toContain('return_to=')
    expect(location).toContain('authorize')
  })

  it('should redirect to redirect_uri with code when authenticated', async () => {
    vi.mocked(
      authorizationValidation.validateAuthorizationRequest,
    ).mockResolvedValue({
      isValid: true,
      data: {
        clientId: 'client-123',
        redirectUri: 'https://example.com/callback',
        scopes: ['openid', 'profile'],
        state: 'state-456',
        codeChallenge: null,
        codeChallengeMethod: null,
        nonce: null,
        prompt: null,
        maxAge: null,
      },
    })
    vi.mocked(
      authorizationCodeStorage.generateAuthorizationCode,
    ).mockResolvedValue('auth-code-789')

    const sessionToken = createSessionToken('user-123')
    const cookieName = getSessionCookieName()

    const app = createAuthorizationApp()
    const res = await app.request(
      '/authorize?client_id=client-123&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&response_type=code&scope=openid%20profile&state=state-456',
      {
        headers: { Cookie: `${cookieName}=${sessionToken}` },
      },
    )

    expect(res.status).toBe(302)
    const location = res.headers.get('Location') ?? ''
    expect(location).toContain('https://example.com/callback')
    expect(location).toContain('code=auth-code-789')
    expect(location).toContain('state=state-456')
  })

  it('should redirect to redirect_uri with error when validation fails and redirect_uri is valid', async () => {
    vi.mocked(
      authorizationValidation.validateAuthorizationRequest,
    ).mockResolvedValue({
      isValid: false,
      error: 'invalid_scope',
      errorDescription: 'Scope not allowed',
      redirectUri: 'https://example.com/callback',
      state: 'my-state',
    })

    const app = createAuthorizationApp()
    const res = await app.request(
      '/authorize?client_id=client-123&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&response_type=code&scope=profile&state=my-state',
    )

    expect(res.status).toBe(302)
    const location = res.headers.get('Location') ?? ''
    expect(location).toContain('https://example.com/callback')
    expect(location).toContain('error=invalid_scope')
    expect(location).toContain('state=my-state')
  })

  it('should return 400 error page when validation fails and no redirect_uri', async () => {
    vi.mocked(
      authorizationValidation.validateAuthorizationRequest,
    ).mockResolvedValue({
      isValid: false,
      error: 'invalid_client',
      errorDescription: 'Unknown client',
    })

    const app = createAuthorizationApp()
    const res = await app.request(
      '/authorize?client_id=unknown&response_type=code&scope=openid',
    )

    expect(res.status).toBe(400)
    const body = await res.text()
    expect(body).toContain('Authorization Error')
    expect(body).toContain('invalid_client')
  })
})
