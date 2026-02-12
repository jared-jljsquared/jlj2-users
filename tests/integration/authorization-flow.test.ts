import crypto from 'node:crypto'
import { expect, test } from '@playwright/test'

const generateCodeChallenge = (codeVerifier: string): string =>
  crypto.createHash('sha256').update(codeVerifier, 'utf8').digest('base64url')

test.describe('Authorization Code Flow', () => {
  test('should redirect to login when unauthenticated', async ({ request }) => {
    const createClientRes = await request.post('/clients', {
      data: {
        name: 'Auth Flow Test Client',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scopes: ['openid'],
      },
    })
    expect(createClientRes.ok()).toBeTruthy()
    const { id: clientId } = (await createClientRes.json()) as { id: string }

    const redirectUri = 'https://example.com/callback'
    const res = await request.get(
      `/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid&state=test-state`,
      { maxRedirects: 1 },
    )

    const url = res.url()
    expect(url).toContain('/login')
    expect(url).toContain('return_to=')
  })

  test('should return error page for invalid client (no redirect to unvalidated URI)', async ({
    request,
  }) => {
    const redirectUri = 'https://example.com/callback'

    const res = await request.get(
      `/authorize?client_id=00000000-0000-0000-0000-000000000000&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid`,
    )

    expect(res.status()).toBe(400)
    const body = await res.text()
    expect(body).toContain('Authorization Error')
    expect(body).toContain('invalid_client')
    expect(body).not.toContain(redirectUri)
  })

  test('should redirect to redirect_uri with error for missing openid scope', async ({
    request,
  }) => {
    const createClientRes = await request.post('/clients', {
      data: {
        name: 'Scope Test Client',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scopes: ['openid', 'profile'],
      },
    })
    expect(createClientRes.ok()).toBeTruthy()
    const { id: clientId } = (await createClientRes.json()) as { id: string }

    const redirectUri = 'https://example.com/callback'
    const res = await request.get(
      `/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=profile`,
      { maxRedirects: 0 },
    )

    expect(res.status()).toBe(302)
    const location = res.headers().location
    expect(location).toContain('https://example.com/callback')
    expect(location).toContain('error=invalid_scope')
  })

  test('should redirect to redirect_uri with error for invalid scope (post-validation)', async ({
    request,
  }) => {
    const createClientRes = await request.post('/clients', {
      data: {
        name: 'Post-Validation Scope Client',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scopes: ['openid', 'profile'],
      },
    })
    expect(createClientRes.ok()).toBeTruthy()
    const { id: clientId } = (await createClientRes.json()) as { id: string }

    const redirectUri = 'https://example.com/callback'
    const res = await request.get(
      `/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email&state=test-state`,
      { maxRedirects: 0 },
    )

    expect(res.status()).toBe(302)
    const location = res.headers().location
    expect(location).toContain('https://example.com/callback')
    expect(location).toContain('error=invalid_scope')
    expect(location).toContain('state=test-state')
  })

  test('should return error page for missing redirect_uri (no 500)', async ({
    request,
  }) => {
    const createClientRes = await request.post('/clients', {
      data: {
        name: 'Missing Redirect Test Client',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scopes: ['openid'],
      },
    })
    expect(createClientRes.ok()).toBeTruthy()
    const { id: clientId } = (await createClientRes.json()) as { id: string }

    const res = await request.get(
      `/authorize?client_id=${clientId}&response_type=code&scope=openid`,
    )

    expect(res.status()).toBe(400)
    const body = await res.text()
    expect(body).toContain('Authorization Error')
    expect(body).toContain('invalid_request')
  })

  test('should redirect to redirect_uri with error when client does not support code response type', async ({
    request,
  }) => {
    const createClientRes = await request.post('/clients', {
      data: {
        name: 'Client Credentials Only',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['client_credentials'],
        responseTypes: ['token'],
        scopes: ['openid'],
      },
    })
    expect(createClientRes.ok()).toBeTruthy()
    const { id: clientId } = (await createClientRes.json()) as { id: string }

    const redirectUri = 'https://example.com/callback'
    const res = await request.get(
      `/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid`,
      { maxRedirects: 0 },
    )

    expect(res.status()).toBe(302)
    const location = res.headers().location
    expect(location).toContain('https://example.com/callback')
    expect(location).toContain('error=unsupported_response_type')
  })

  test('login page should return HTML form', async ({ request }) => {
    const res = await request.get('/login?return_to=/authorize')
    expect(res.ok()).toBeTruthy()
    const body = await res.text()
    expect(body).toContain('Sign in')
    expect(body).toContain('input type="email"')
    expect(body).toContain('input type="password"')
  })

  test('POST /login should not redirect to external URL (open redirect prevention)', async ({
    request,
  }) => {
    await request.post('/users/register', {
      data: {
        email: 'redirect-test@example.com',
        password: 'test-password-123',
        name: 'Redirect Test',
      },
    })

    const res = await request.post('/login', {
      form: {
        email: 'redirect-test@example.com',
        password: 'test-password-123',
        return_to: 'https://evil.com/phishing',
      },
      maxRedirects: 1,
    })

    const url = res.url()
    expect(url).not.toContain('evil.com')
    expect(url).toMatch(/^https?:\/\/localhost(:\d+)?\/?/)
  })

  test('POST /token should reject client not registered for authorization_code grant', async ({
    request,
  }) => {
    const createClientRes = await request.post('/clients', {
      data: {
        name: 'Client Credentials Only Token Test',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['client_credentials'],
        responseTypes: ['token'],
        scopes: ['openid'],
      },
    })
    expect(createClientRes.ok()).toBeTruthy()
    const { id: clientId, secret } = (await createClientRes.json()) as {
      id: string
      secret: string
    }

    const res = await request.post('/token', {
      form: {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: secret,
        code: 'fake-code',
        redirect_uri: 'https://example.com/callback',
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('unauthorized_client')
  })

  test('public client can exchange code for tokens with PKCE (no client_secret)', async ({
    request,
  }) => {
    const createClientRes = await request.post('/clients', {
      data: {
        name: 'Public Client',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scopes: ['openid'],
        tokenEndpointAuthMethod: 'none',
      },
    })
    expect(createClientRes.ok()).toBeTruthy()
    const { id: clientId } = (await createClientRes.json()) as { id: string }

    await request.post('/users/register', {
      data: {
        email: 'public-client@example.com',
        password: 'test-password-123',
        name: 'Public Client User',
      },
    })

    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = generateCodeChallenge(codeVerifier)
    const redirectUri = 'https://example.com/callback'
    const state = 'pkce-state'

    await request.post('/login', {
      form: {
        email: 'public-client@example.com',
        password: 'test-password-123',
        return_to: '/',
      },
      maxRedirects: 1,
    })

    const authRes = await request.get(
      `/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}`,
      { maxRedirects: 0 },
    )

    expect(authRes.status()).toBe(302)
    const location = authRes.headers().location ?? ''
    expect(location).toContain('https://example.com/callback')
    const codeMatch = location.match(/[?&]code=([^&]+)/)
    expect(codeMatch).toBeTruthy()
    const code = codeMatch?.[1]
    if (!code) throw new Error('Expected code in redirect')

    const tokenRes = await request.post('/token', {
      form: {
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    expect(tokenRes.status()).toBe(200)
    const tokenBody = (await tokenRes.json()) as Record<string, unknown>
    expect(tokenBody).toHaveProperty('access_token')
    expect(tokenBody).toHaveProperty('id_token')
  })

  test('POST /login should accept valid relative return_to', async ({
    request,
  }) => {
    await request.post('/users/register', {
      data: {
        email: 'valid-return@example.com',
        password: 'test-password-123',
        name: 'Valid Return Test',
      },
    })

    const res = await request.post('/login', {
      form: {
        email: 'valid-return@example.com',
        password: 'test-password-123',
        return_to: '/authorize?client_id=test&response_type=code&scope=openid',
      },
      maxRedirects: 1,
    })

    const url = res.url()
    expect(url).toContain('/authorize')
    expect(url).toContain('client_id=test')
  })

  test('POST /login should accept return_to with redirect_uri in query (contains //)', async ({
    request,
  }) => {
    await request.post('/users/register', {
      data: {
        email: 'return-uri-test@example.com',
        password: 'test-password-123',
        name: 'Return URI Test',
      },
    })

    const returnTo =
      '/authorize?client_id=test&redirect_uri=https://example.com/callback&response_type=code&scope=openid'
    const res = await request.post('/login', {
      form: {
        email: 'return-uri-test@example.com',
        password: 'test-password-123',
        return_to: returnTo,
      },
      maxRedirects: 1,
    })

    const url = res.url()
    expect(url).toContain('/authorize')
    expect(url).toContain('redirect_uri=')
    expect(url).toContain('example.com')
  })

  test('POST /login should not redirect to protocol-relative URL (//evil.com)', async ({
    request,
  }) => {
    await request.post('/users/register', {
      data: {
        email: 'protocol-relative@example.com',
        password: 'test-password-123',
        name: 'Protocol Relative Test',
      },
    })

    const res = await request.post('/login', {
      form: {
        email: 'protocol-relative@example.com',
        password: 'test-password-123',
        return_to: '//evil.com/phishing',
      },
      maxRedirects: 1,
    })

    const url = res.url()
    expect(url).not.toContain('evil.com')
  })
})
