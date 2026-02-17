import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearConfigCache, getOidcConfig } from '../config.ts'

describe('OIDC Configuration', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    clearConfigCache()
  })

  afterEach(() => {
    process.env = originalEnv
    clearConfigCache()
  })

  it('should use default values when env vars are not set', () => {
    delete process.env.OIDC_ISSUER
    delete process.env.OIDC_DEFAULT_AUDIENCE
    delete process.env.PORT

    const config = getOidcConfig()

    expect(config.issuer).toBe('http://localhost:3000')
    expect(config.defaultAudience).toBe('jlj-squared-development')
    expect(config.authorizationEndpoint).toBe('http://localhost:3000/authorize')
    expect(config.tokenEndpoint).toBe('http://localhost:3000/token')
    expect(config.userinfoEndpoint).toBe('http://localhost:3000/userinfo')
    expect(config.revocationEndpoint).toBe('http://localhost:3000/revoke')
    expect(config.jwksUri).toBe('http://localhost:3000/.well-known/jwks.json')
  })

  it('should use environment variables when set', () => {
    process.env.OIDC_ISSUER = 'https://example.com'
    process.env.OIDC_DEFAULT_AUDIENCE = 'custom-audience'
    process.env.PORT = '8080'

    const config = getOidcConfig()

    expect(config.issuer).toBe('https://example.com')
    expect(config.defaultAudience).toBe('custom-audience')
    expect(config.tokenEndpoint).toBe('https://example.com/token')
    expect(config.authorizationEndpoint).toBe('https://example.com/authorize')
  })

  it('should fall back to default audience when OIDC_DEFAULT_AUDIENCE is empty or whitespace', () => {
    process.env.OIDC_ISSUER = 'http://localhost:3000'

    process.env.OIDC_DEFAULT_AUDIENCE = ''
    clearConfigCache()
    expect(getOidcConfig().defaultAudience).toBe('jlj-squared-development')

    process.env.OIDC_DEFAULT_AUDIENCE = '   '
    clearConfigCache()
    expect(getOidcConfig().defaultAudience).toBe('jlj-squared-development')
  })

  it('should include all required configuration fields', () => {
    const config = getOidcConfig()

    expect(config).toHaveProperty('issuer')
    expect(config).toHaveProperty('authorizationEndpoint')
    expect(config).toHaveProperty('tokenEndpoint')
    expect(config).toHaveProperty('userinfoEndpoint')
    expect(config).toHaveProperty('revocationEndpoint')
    expect(config).toHaveProperty('jwksUri')
    expect(config).toHaveProperty('scopesSupported')
    expect(config).toHaveProperty('responseTypesSupported')
    expect(config).toHaveProperty('grantTypesSupported')
    expect(config).toHaveProperty('tokenEndpointAuthMethodsSupported')
    expect(config).toHaveProperty('defaultAudience')
  })

  it('should support openid scope', () => {
    const config = getOidcConfig()

    expect(config.scopesSupported).toContain('openid')
    expect(config.scopesSupported).toContain('profile')
    expect(config.scopesSupported).toContain('email')
    expect(config.scopesSupported).toContain('offline_access')
  })

  it('should validate configuration on startup', () => {
    // This should not throw with valid defaults
    expect(() => getOidcConfig()).not.toThrow()
  })

  it('should throw error for invalid issuer URL', () => {
    process.env.OIDC_ISSUER = 'not-a-valid-url'

    expect(() => getOidcConfig()).toThrow('OIDC issuer must be a valid URL')
  })

  it('should throw error for empty issuer', () => {
    process.env.OIDC_ISSUER = ''

    expect(() => getOidcConfig()).toThrow('OIDC issuer must be set')
  })
})
