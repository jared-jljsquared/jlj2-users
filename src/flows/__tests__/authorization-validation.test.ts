import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientService from '../../clients/service.ts'
import { validateAuthorizationRequest } from '../authorization-validation.ts'

vi.mock('../../clients/service.ts', () => ({
  getClientById: vi.fn(),
  isRedirectUriAllowed: vi.fn(),
}))

describe('Authorization Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientService.getClientById).mockResolvedValue({
      id: 'client-123',
      name: 'Test Client',
      redirectUris: ['https://example.com/callback'],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scopes: ['openid', 'profile', 'email'],
      tokenEndpointAuthMethod: 'client_secret_post',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(clientService.isRedirectUriAllowed).mockResolvedValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should accept valid authorization request', async () => {
    const result = await validateAuthorizationRequest({
      clientId: 'client-123',
      redirectUri: 'https://example.com/callback',
      responseType: 'code',
      scope: 'openid profile',
      state: 'state-123',
    })

    expect(result.isValid).toBe(true)
    if (result.isValid) {
      expect(result.data.clientId).toBe('client-123')
      expect(result.data.redirectUri).toBe('https://example.com/callback')
      expect(result.data.scopes).toContain('openid')
      expect(result.data.state).toBe('state-123')
    }
  })

  it('should reject missing client_id', async () => {
    const result = await validateAuthorizationRequest({
      redirectUri: 'https://example.com/callback',
      responseType: 'code',
      scope: 'openid',
    })
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.error).toBe('invalid_request')
    }
  })

  it('should reject missing redirect_uri', async () => {
    const result = await validateAuthorizationRequest({
      clientId: 'client-123',
      responseType: 'code',
      scope: 'openid',
    })
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.error).toBe('invalid_request')
    }
  })

  it('should reject invalid response_type', async () => {
    const result = await validateAuthorizationRequest({
      clientId: 'client-123',
      redirectUri: 'https://example.com/callback',
      responseType: 'token',
      scope: 'openid',
    })
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.error).toBe('unsupported_response_type')
    }
  })

  it('should reject scope without openid', async () => {
    const result = await validateAuthorizationRequest({
      clientId: 'client-123',
      redirectUri: 'https://example.com/callback',
      responseType: 'code',
      scope: 'profile email',
    })
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.error).toBe('invalid_scope')
    }
  })

  it('should reject scope with openid as substring (exact token match required)', async () => {
    const result = await validateAuthorizationRequest({
      clientId: 'client-123',
      redirectUri: 'https://example.com/callback',
      responseType: 'code',
      scope: 'fooopenidbar profile',
    })
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.error).toBe('invalid_scope')
    }
  })

  it('should reject unknown client', async () => {
    vi.mocked(clientService.getClientById).mockResolvedValue(null)

    const result = await validateAuthorizationRequest({
      clientId: 'unknown-client',
      redirectUri: 'https://example.com/callback',
      responseType: 'code',
      scope: 'openid',
    })
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.error).toBe('invalid_client')
    }
  })

  it('should reject unregistered redirect_uri', async () => {
    vi.mocked(clientService.isRedirectUriAllowed).mockResolvedValue(false)

    const result = await validateAuthorizationRequest({
      clientId: 'client-123',
      redirectUri: 'https://evil.com/callback',
      responseType: 'code',
      scope: 'openid',
    })
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.error).toBe('invalid_request')
    }
  })

  it('should accept valid request with PKCE', async () => {
    const result = await validateAuthorizationRequest({
      clientId: 'client-123',
      redirectUri: 'https://example.com/callback',
      responseType: 'code',
      scope: 'openid',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
    })
    expect(result.isValid).toBe(true)
    if (result.isValid) {
      expect(result.data.codeChallenge).toBe('challenge')
      expect(result.data.codeChallengeMethod).toBe('S256')
    }
  })

  it('should reject code_challenge_method without code_challenge', async () => {
    const result = await validateAuthorizationRequest({
      clientId: 'client-123',
      redirectUri: 'https://example.com/callback',
      responseType: 'code',
      scope: 'openid',
      codeChallengeMethod: 'S256',
    })
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.error).toBe('invalid_request')
      expect(result.redirectUri).toBe('https://example.com/callback')
    }
  })

  it('should return redirectUri for post-validation invalid_scope (client scope check)', async () => {
    const result = await validateAuthorizationRequest({
      clientId: 'client-123',
      redirectUri: 'https://example.com/callback',
      responseType: 'code',
      scope: 'openid offline_access',
      state: 'my-state',
    })
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.error).toBe('invalid_scope')
      expect(result.redirectUri).toBe('https://example.com/callback')
      expect(result.state).toBe('my-state')
    }
  })

  it('should reject public client without PKCE', async () => {
    vi.mocked(clientService.getClientById).mockResolvedValue({
      id: 'client-123',
      name: 'Public Client',
      redirectUris: ['https://example.com/callback'],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scopes: ['openid'],
      tokenEndpointAuthMethod: 'none',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await validateAuthorizationRequest({
      clientId: 'client-123',
      redirectUri: 'https://example.com/callback',
      responseType: 'code',
      scope: 'openid',
    })
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.error).toBe('invalid_request')
      expect(result.errorDescription).toContain('PKCE')
    }
  })

  it('should accept public client with PKCE', async () => {
    vi.mocked(clientService.getClientById).mockResolvedValue({
      id: 'client-123',
      name: 'Public Client',
      redirectUris: ['https://example.com/callback'],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scopes: ['openid'],
      tokenEndpointAuthMethod: 'none',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await validateAuthorizationRequest({
      clientId: 'client-123',
      redirectUri: 'https://example.com/callback',
      responseType: 'code',
      scope: 'openid',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
    })
    expect(result.isValid).toBe(true)
  })

  it('should reject client that does not support code response type', async () => {
    vi.mocked(clientService.getClientById).mockResolvedValue({
      id: 'client-123',
      name: 'Client Credentials Only',
      redirectUris: ['https://example.com/callback'],
      grantTypes: ['client_credentials'],
      responseTypes: ['token'],
      scopes: ['openid'],
      tokenEndpointAuthMethod: 'client_secret_post',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await validateAuthorizationRequest({
      clientId: 'client-123',
      redirectUri: 'https://example.com/callback',
      responseType: 'code',
      scope: 'openid',
    })
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.error).toBe('unsupported_response_type')
    }
  })
})
