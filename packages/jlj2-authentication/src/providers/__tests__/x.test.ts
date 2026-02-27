import { describe, expect, it, vi } from 'vitest'
import { generateCodeChallenge } from '../../flows/pkce.ts'
import { getXAuthorizationUrl, validateXToken } from '../x.ts'

vi.mock('../x-config.ts', () => ({
  getXConfig: vi.fn(() => ({
    clientId: 'test-x-client-id',
    clientSecret: 'test-x-client-secret',
    isConfigured: true,
  })),
  X_AUTH_URL: 'https://twitter.com/i/oauth2/authorize',
  X_TOKEN_URL: 'https://api.twitter.com/2/oauth2/token',
  X_USER_INFO_URL: 'https://api.twitter.com/2/users/me',
  X_SCOPES: ['tweet.read', 'users.read', 'offline.access'],
}))

describe('validateXToken', () => {
  it('should validate valid X token and extract user info', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: 'x-user-123',
            name: 'X User',
            username: 'xuser',
            profile_image_url: 'https://example.com/avatar.jpg',
            email: 'user@example.com',
          },
        }),
      }),
    )

    const userInfo = await validateXToken('valid-access-token')

    expect(userInfo.sub).toBe('x-user-123')
    expect(userInfo.email).toBe('user@example.com')
    expect(userInfo.name).toBe('X User')
    expect(userInfo.picture).toBe('https://example.com/avatar.jpg')
  })

  it('should use username as name fallback when name is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: 'x-user-456',
            username: 'fallbackuser',
            profile_image_url: 'https://example.com/pic.jpg',
          },
        }),
      }),
    )

    const userInfo = await validateXToken('valid-token')

    expect(userInfo.sub).toBe('x-user-456')
    expect(userInfo.name).toBe('fallbackuser')
    expect(userInfo.email).toBe('')
    expect(userInfo.picture).toBe('https://example.com/pic.jpg')
  })

  it('should reject when users/me returns errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Invalid or expired token' }],
        }),
      }),
    )

    await expect(validateXToken('invalid-token')).rejects.toThrow(
      'Invalid or expired token',
    )
  })

  it('should reject when users/me returns no data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      }),
    )

    await expect(validateXToken('token')).rejects.toThrow(
      'X user info did not return user id',
    )
  })

  it('should reject when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid token',
      }),
    )

    await expect(validateXToken('bad-token')).rejects.toThrow(
      'X token validation failed',
    )
  })
})

describe('getXAuthorizationUrl', () => {
  it('should build authorization URL with state, redirect_uri, and PKCE', () => {
    const codeChallenge = generateCodeChallenge('test-verifier', 'S256')
    const url = getXAuthorizationUrl(
      'https://example.com/auth/x/callback',
      'state-xyz',
      codeChallenge,
    )

    expect(url).toContain('twitter.com')
    expect(url).toContain('oauth2/authorize')
    expect(url).toContain('client_id=')
    expect(url).toContain(
      'redirect_uri=https%3A%2F%2Fexample.com%2Fauth%2Fx%2Fcallback',
    )
    expect(url).toContain('response_type=code')
    expect(url).toContain('code_challenge=')
    expect(url).toContain('code_challenge_method=S256')
    expect(url).toContain('state=state-xyz')
    expect(url).toContain('scope=')
  })
})
