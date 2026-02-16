import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { signJwt } from '../../tokens/jwt.ts'
import {
  getMicrosoftAuthorizationUrl,
  validateMicrosoftToken,
} from '../microsoft.ts'
import { getMicrosoftPublicKeyByKid } from '../microsoft-jwks.ts'

const KID = 'test-key-id'
const CLIENT_ID = 'test-microsoft-client-id'

vi.mock('../microsoft-jwks.ts')
vi.mock('../microsoft-config.ts', () => ({
  getMicrosoftConfig: vi.fn(() => ({
    clientId: CLIENT_ID,
    clientSecret: 'test-secret',
    tenant: 'common',
    isConfigured: true,
  })),
}))

const createValidMicrosoftIdToken = (
  overrides: Record<string, unknown> = {},
): string => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })

  vi.mocked(getMicrosoftPublicKeyByKid).mockResolvedValue(publicKey)

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: 'https://login.microsoftonline.com/tenant-id/v2.0',
    aud: CLIENT_ID,
    oid: 'microsoft-object-id-123',
    sub: 'microsoft-sub-id',
    email: 'user@outlook.com',
    preferred_username: 'user@outlook.com',
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
    iat: now,
    exp: now + 3600,
    ...overrides,
  }

  return signJwt(payload, privateKey, 'RS256', KID)
}

describe('validateMicrosoftToken', () => {
  it('should use oid as subject identifier', async () => {
    const idToken = createValidMicrosoftIdToken()
    const userInfo = await validateMicrosoftToken(idToken)

    expect(userInfo.sub).toBe('microsoft-object-id-123')
    expect(userInfo.email).toBe('user@outlook.com')
    expect(userInfo.name).toBe('Test User')
  })

  it('should fall back to sub when oid is missing', async () => {
    const idToken = createValidMicrosoftIdToken({
      oid: undefined,
      sub: 'fallback-sub-id',
    })
    const userInfo = await validateMicrosoftToken(idToken)

    expect(userInfo.sub).toBe('fallback-sub-id')
  })

  it('should use preferred_username when email is missing', async () => {
    const idToken = createValidMicrosoftIdToken({
      email: undefined,
      preferred_username: 'user@company.com',
    })
    const userInfo = await validateMicrosoftToken(idToken)

    expect(userInfo.email).toBe('user@company.com')
  })

  it('should reject token with wrong issuer', async () => {
    const idToken = createValidMicrosoftIdToken({
      iss: 'https://evil.com',
    })
    await expect(validateMicrosoftToken(idToken)).rejects.toThrow(
      'Invalid token issuer',
    )
  })

  it('should reject token with wrong audience', async () => {
    const idToken = createValidMicrosoftIdToken({
      aud: 'wrong-client-id',
    })
    await expect(validateMicrosoftToken(idToken)).rejects.toThrow(
      'Invalid token audience',
    )
  })

  it('should accept explicit clientId parameter for audience validation', async () => {
    const idToken = createValidMicrosoftIdToken({
      aud: 'custom-client-id',
    })
    const userInfo = await validateMicrosoftToken(idToken, 'custom-client-id')
    expect(userInfo.sub).toBe('microsoft-object-id-123')
  })

  it('should reject token missing kid in header', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    })
    vi.mocked(getMicrosoftPublicKeyByKid).mockResolvedValue(publicKey)

    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iss: 'https://login.microsoftonline.com/tenant/v2.0',
      aud: CLIENT_ID,
      oid: 'microsoft-oid',
      email: 'user@outlook.com',
      iat: now,
      exp: now + 3600,
    }
    const idToken = signJwt(payload, privateKey, 'RS256')
    await expect(validateMicrosoftToken(idToken)).rejects.toThrow(
      'Microsoft ID token missing kid in header',
    )
  })
})

describe('getMicrosoftAuthorizationUrl', () => {
  it('should build authorization URL with state and redirect_uri', () => {
    const url = getMicrosoftAuthorizationUrl(
      'https://example.com/auth/microsoft/callback',
      'state-456',
    )
    expect(url).toContain('login.microsoftonline.com')
    expect(url).toContain('oauth2/v2.0/authorize')
    expect(url).toContain('client_id=')
    expect(url).toContain(
      'redirect_uri=https%3A%2F%2Fexample.com%2Fauth%2Fmicrosoft%2Fcallback',
    )
    expect(url).toContain('response_type=code')
    expect(url).toContain('scope=openid+profile+email')
    expect(url).toContain('state=state-456')
  })
})
