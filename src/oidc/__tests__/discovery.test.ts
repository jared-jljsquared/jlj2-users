import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearConfigCache, getOidcConfig } from '../config.ts'
import { handleDiscovery } from '../discovery.ts'

describe('Discovery Endpoint', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    clearConfigCache()
  })

  afterEach(() => {
    process.env = originalEnv
    clearConfigCache()
  })

  it('should return all required OIDC metadata fields', async () => {
    delete process.env.OIDC_ISSUER
    delete process.env.PORT

    const app = new Hono()
    app.get('/.well-known/openid-configuration', handleDiscovery)

    const res = await app.request('/.well-known/openid-configuration')
    expect(res.status).toBe(200)

    const document = (await res.json()) as Record<string, unknown>

    expect(document).toHaveProperty('issuer')
    expect(document).toHaveProperty('authorization_endpoint')
    expect(document).toHaveProperty('token_endpoint')
    expect(document).toHaveProperty('jwks_uri')
    expect(document).toHaveProperty('response_types_supported')
    expect(document).toHaveProperty('scopes_supported')
    expect(document).toHaveProperty('subject_types_supported')
    expect(document).toHaveProperty('id_token_signing_alg_values_supported')
    expect(document).toHaveProperty('grant_types_supported')
    expect(document).toHaveProperty('token_endpoint_auth_methods_supported')
  })

  it('should include correct signing algorithms', async () => {
    delete process.env.OIDC_ISSUER
    delete process.env.PORT

    const app = new Hono()
    app.get('/.well-known/openid-configuration', handleDiscovery)

    const res = await app.request('/.well-known/openid-configuration')
    const document = (await res.json()) as Record<string, unknown>
    const algorithms =
      document.id_token_signing_alg_values_supported as string[]

    expect(algorithms).toContain('RS256')
    expect(algorithms).toContain('ES256')
  })

  it('should match configuration values', async () => {
    process.env.OIDC_ISSUER = 'https://example.com'
    process.env.PORT = '8080'

    const config = getOidcConfig()
    const app = new Hono()
    app.get('/.well-known/openid-configuration', handleDiscovery)

    const res = await app.request('/.well-known/openid-configuration')
    const document = (await res.json()) as Record<string, unknown>

    expect(document.issuer).toBe(config.issuer)
    expect(document.authorization_endpoint).toBe(config.authorizationEndpoint)
    expect(document.token_endpoint).toBe(config.tokenEndpoint)
    expect(document.jwks_uri).toBe(config.jwksUri)
    expect(document.scopes_supported).toEqual(config.scopesSupported)
    expect(document.response_types_supported).toEqual(
      config.responseTypesSupported,
    )
    expect(document.grant_types_supported).toEqual(config.grantTypesSupported)
  })

  it('should include required claims', async () => {
    delete process.env.OIDC_ISSUER
    delete process.env.PORT

    const app = new Hono()
    app.get('/.well-known/openid-configuration', handleDiscovery)

    const res = await app.request('/.well-known/openid-configuration')
    const document = (await res.json()) as Record<string, unknown>
    const claims = document.claims_supported as string[]

    expect(claims).toContain('sub')
    expect(claims).toContain('iss')
    expect(claims).toContain('aud')
    expect(claims).toContain('exp')
    expect(claims).toContain('iat')
    expect(claims).toContain('email')
    expect(claims).toContain('name')
  })

  it('should support PKCE code challenge methods', async () => {
    delete process.env.OIDC_ISSUER
    delete process.env.PORT

    const app = new Hono()
    app.get('/.well-known/openid-configuration', handleDiscovery)

    const res = await app.request('/.well-known/openid-configuration')
    const document = (await res.json()) as Record<string, unknown>
    const methods = document.code_challenge_methods_supported as string[]

    expect(methods).toContain('S256')
    expect(methods).toContain('plain')
  })

  it('should return correct Content-Type header', async () => {
    delete process.env.OIDC_ISSUER
    delete process.env.PORT

    const app = new Hono()
    app.get('/.well-known/openid-configuration', handleDiscovery)

    const res = await app.request('/.well-known/openid-configuration')
    const contentType = res.headers.get('content-type')

    expect(contentType).toContain('application/json')
  })
})
