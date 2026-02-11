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

  test('should redirect with error for invalid client', async ({ request }) => {
    const redirectUri = 'https://example.com/callback'

    const res = await request.get(
      `/authorize?client_id=00000000-0000-0000-0000-000000000000&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid`,
      { maxRedirects: 1 },
    )

    const url = res.url()
    expect(url).toContain(redirectUri)
    expect(url).toContain('error=')
  })

  test('should redirect with error for missing openid scope', async ({
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
    expect(location).toContain(redirectUri)
    expect(location).toContain('error=invalid_scope')
  })

  test('login page should return HTML form', async ({ request }) => {
    const res = await request.get('/login?return_to=/authorize')
    expect(res.ok()).toBeTruthy()
    const body = await res.text()
    expect(body).toContain('Sign in')
    expect(body).toContain('input type="email"')
    expect(body).toContain('input type="password"')
  })
})
