import { expect, test } from '@playwright/test'

test.describe('OIDC Discovery', () => {
  test('should return valid discovery document', async ({ request }) => {
    const response = await request.get('/.well-known/openid-configuration')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/json')

    const document = (await response.json()) as Record<string, unknown>

    expect(document).toHaveProperty('issuer')
    expect(document).toHaveProperty('authorization_endpoint')
    expect(document).toHaveProperty('token_endpoint')
    expect(document).toHaveProperty('jwks_uri')
    expect(Array.isArray(document.scopes_supported)).toBe(true)
    expect(document.scopes_supported).toContain('openid')
  })

  test('should have valid endpoint URLs', async ({ request }) => {
    const response = await request.get('/.well-known/openid-configuration')
    const document = (await response.json()) as Record<string, unknown>

    expect(document.authorization_endpoint).toMatch(/^https?:\/\//)
    expect(document.token_endpoint).toMatch(/^https?:\/\//)
    expect(document.jwks_uri).toMatch(/^https?:\/\//)
  })

  test('should include all required OIDC metadata fields', async ({
    request,
  }) => {
    const response = await request.get('/.well-known/openid-configuration')
    const document = (await response.json()) as Record<string, unknown>

    // Required fields per OIDC Discovery spec
    expect(document).toHaveProperty('issuer')
    expect(document).toHaveProperty('authorization_endpoint')
    expect(document).toHaveProperty('token_endpoint')
    expect(document).toHaveProperty('jwks_uri')
    expect(document).toHaveProperty('response_types_supported')
    expect(document).toHaveProperty('subject_types_supported')
    expect(document).toHaveProperty('id_token_signing_alg_values_supported')
    expect(document).toHaveProperty('scopes_supported')
    expect(document).toHaveProperty('token_endpoint_auth_methods_supported')
  })

  test('should support required response types', async ({ request }) => {
    const response = await request.get('/.well-known/openid-configuration')
    const document = (await response.json()) as Record<string, unknown>
    const responseTypes = document.response_types_supported as string[]

    expect(responseTypes).toContain('code')
  })

  test('should support required grant types', async ({ request }) => {
    const response = await request.get('/.well-known/openid-configuration')
    const document = (await response.json()) as Record<string, unknown>
    const grantTypes = document.grant_types_supported as string[]

    expect(grantTypes).toContain('authorization_code')
  })

  test('should include signing algorithms', async ({ request }) => {
    const response = await request.get('/.well-known/openid-configuration')
    const document = (await response.json()) as Record<string, unknown>
    const algorithms =
      document.id_token_signing_alg_values_supported as string[]

    expect(algorithms).toContain('RS256')
    expect(algorithms).toContain('ES256')
  })

  test('should return JWKS endpoint', async ({ request }) => {
    const response = await request.get('/.well-known/jwks.json')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/json')

    const jwks = (await response.json()) as { keys: unknown[] }

    expect(jwks).toHaveProperty('keys')
    expect(Array.isArray(jwks.keys)).toBe(true)
  })
})
