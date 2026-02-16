import { describe, expect, it, vi } from 'vitest'
import {
  getFacebookAuthorizationUrl,
  validateFacebookToken,
} from '../facebook.ts'

vi.mock('../facebook-config.ts', () => ({
  getFacebookConfig: vi.fn(() => ({
    clientId: 'test-facebook-app-id',
    clientSecret: 'test-facebook-app-secret',
    isConfigured: true,
  })),
  FACEBOOK_AUTH_URL: 'https://www.facebook.com/v21.0/dialog/oauth',
  FACEBOOK_DEBUG_TOKEN_URL: 'https://graph.facebook.com/v21.0/debug_token',
  FACEBOOK_USER_INFO_URL: 'https://graph.facebook.com/v21.0/me',
}))

describe('validateFacebookToken', () => {
  it('should validate valid Facebook token and extract user info', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { is_valid: true, user_id: 'facebook-user-123' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'facebook-user-123',
            name: 'Test User',
            email: 'user@example.com',
            picture: { data: { url: 'https://example.com/photo.jpg' } },
          }),
        }),
    )

    const userInfo = await validateFacebookToken('valid-access-token')

    expect(userInfo.sub).toBe('facebook-user-123')
    expect(userInfo.email).toBe('user@example.com')
    expect(userInfo.name).toBe('Test User')
    expect(userInfo.picture).toBe('https://example.com/photo.jpg')
  })

  it('should reject invalid Facebook token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { is_valid: false } }),
      }),
    )

    await expect(validateFacebookToken('invalid-token')).rejects.toThrow(
      'Invalid Facebook token',
    )
  })

  it('should reject when debug_token returns no user_id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { is_valid: true } }),
      }),
    )

    await expect(validateFacebookToken('token')).rejects.toThrow(
      'Facebook token validation did not return user_id',
    )
  })

  it('should reject when user ID from /me does not match debug_token', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { is_valid: true, user_id: 'user-123' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'different-user-id',
            name: 'Test',
            email: 'test@example.com',
          }),
        }),
    )

    await expect(validateFacebookToken('token')).rejects.toThrow(
      'Facebook user ID mismatch',
    )
  })
})

describe('getFacebookAuthorizationUrl', () => {
  it('should build authorization URL with state and redirect_uri', () => {
    const url = getFacebookAuthorizationUrl(
      'https://example.com/auth/facebook/callback',
      'state-789',
    )
    expect(url).toContain('facebook.com')
    expect(url).toContain('dialog/oauth')
    expect(url).toContain('client_id=')
    expect(url).toContain(
      'redirect_uri=https%3A%2F%2Fexample.com%2Fauth%2Ffacebook%2Fcallback',
    )
    expect(url).toContain('response_type=code')
    expect(url).toContain('scope=email%2Cpublic_profile')
    expect(url).toContain('state=state-789')
  })
})
