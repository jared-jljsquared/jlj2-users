import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { signJwt } from '../../tokens/jwt.ts'
import { getGoogleAuthorizationUrl, validateGoogleToken } from '../google.ts'
import { getGooglePublicKeyByKid } from '../google-jwks.ts'

const KID = 'test-key-id'
const CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com'

vi.mock('../google-jwks.ts')
vi.mock('../google-config.ts', () => ({
  getGoogleConfig: vi.fn(() => ({
    clientId: CLIENT_ID,
    clientSecret: 'test-secret',
    isConfigured: true,
  })),
}))

const createValidGoogleIdToken = (
  overrides: Record<string, unknown> = {},
): string => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })

  vi.mocked(getGooglePublicKeyByKid).mockResolvedValue(publicKey)

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-user-123',
    email: 'user@gmail.com',
    email_verified: true,
    name: 'Test User',
    picture: 'https://example.com/photo.jpg',
    given_name: 'Test',
    family_name: 'User',
    iat: now,
    exp: now + 3600,
    ...overrides,
  }

  return signJwt(payload, privateKey, 'RS256', KID)
}

describe('validateGoogleToken', () => {
  it('should validate valid Google ID token and extract user info', async () => {
    const idToken = await createValidGoogleIdToken()
    const userInfo = await validateGoogleToken(idToken)

    expect(userInfo.sub).toBe('google-user-123')
    expect(userInfo.email).toBe('user@gmail.com')
    expect(userInfo.name).toBe('Test User')
    expect(userInfo.picture).toBe('https://example.com/photo.jpg')
    expect(userInfo.emailVerified).toBe(true)
    expect(userInfo.givenName).toBe('Test')
    expect(userInfo.familyName).toBe('User')
  })

  it('should accept accounts.google.com as issuer', async () => {
    const idToken = await createValidGoogleIdToken({
      iss: 'accounts.google.com',
    })
    const userInfo = await validateGoogleToken(idToken)
    expect(userInfo.sub).toBe('google-user-123')
  })

  it('should reject token with wrong issuer', async () => {
    const idToken = await createValidGoogleIdToken({
      iss: 'https://evil.com',
    })
    await expect(validateGoogleToken(idToken)).rejects.toThrow(
      'Invalid token issuer',
    )
  })

  it('should reject token with wrong audience', async () => {
    const idToken = await createValidGoogleIdToken({
      aud: 'wrong-client-id',
    })
    await expect(validateGoogleToken(idToken)).rejects.toThrow(
      'Invalid token audience',
    )
  })

  it('should accept explicit clientId parameter for audience validation', async () => {
    const idToken = await createValidGoogleIdToken({
      aud: 'custom-client-id',
    })
    const userInfo = await validateGoogleToken(idToken, 'custom-client-id')
    expect(userInfo.sub).toBe('google-user-123')
  })

  it('should reject token missing kid in header', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    })
    vi.mocked(getGooglePublicKeyByKid).mockResolvedValue(publicKey)

    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'google-user-123',
      email: 'user@gmail.com',
      iat: now,
      exp: now + 3600,
    }
    const idToken = signJwt(payload, privateKey, 'RS256') // No kid
    await expect(validateGoogleToken(idToken)).rejects.toThrow(
      'Google ID token missing kid in header',
    )
  })
})

describe('getGoogleAuthorizationUrl', () => {
  it('should build authorization URL with state and redirect_uri', () => {
    const url = getGoogleAuthorizationUrl(
      'https://example.com/auth/google/callback',
      'state-123',
    )
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url).toContain('client_id=')
    expect(url).toContain(
      'redirect_uri=https%3A%2F%2Fexample.com%2Fauth%2Fgoogle%2Fcallback',
    )
    expect(url).toContain('response_type=code')
    expect(url).toContain('scope=openid+profile+email')
    expect(url).toContain('state=state-123')
  })
})
