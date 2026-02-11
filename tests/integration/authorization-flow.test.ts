import { expect, test } from '@playwright/test'

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

  test('should return error page for missing openid scope (no redirect to unvalidated URI)', async ({
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
    )

    expect(res.status()).toBe(400)
    const body = await res.text()
    expect(body).toContain('Authorization Error')
    expect(body).toContain('invalid_scope')
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
})
