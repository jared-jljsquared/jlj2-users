import { expect, test } from '@playwright/test'

test.describe('OAuth Client Registration', () => {
  test('should register new client and return client_id and secret', async ({
    request,
  }) => {
    const response = await request.post('/clients', {
      data: {
        name: 'Integration Test Client',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scopes: ['openid', 'profile', 'email'],
      },
    })

    expect(response.status()).toBe(201)
    const body = (await response.json()) as Record<string, unknown>

    expect(body).toHaveProperty('id')
    expect(body).toHaveProperty('name', 'Integration Test Client')
    expect(body).toHaveProperty('secret')
    expect(body.redirectUris).toEqual(['https://example.com/callback'])
    expect(body.grantTypes).toContain('authorization_code')
    expect(body.scopes).toContain('openid')

    const clientId = body.id as string
    expect(clientId).toBeDefined()
    expect((body.secret as string).length).toBeGreaterThan(0)
  })

  test('should get client by id without returning secret', async ({
    request,
  }) => {
    const createResponse = await request.post('/clients', {
      data: {
        name: 'Get Test Client',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scopes: ['openid'],
      },
    })

    expect(createResponse.status()).toBe(201)
    const { id } = (await createResponse.json()) as { id: string }

    const getResponse = await request.get(`/clients/${id}`)
    expect(getResponse.status()).toBe(200)

    const getBody = (await getResponse.json()) as Record<string, unknown>
    expect(getBody).toHaveProperty('id', id)
    expect(getBody).toHaveProperty('name', 'Get Test Client')
    expect(getBody).not.toHaveProperty('secret')
  })

  test('should reject registration without redirect URIs', async ({
    request,
  }) => {
    const response = await request.post('/clients', {
      data: {
        name: 'Invalid Client',
        redirectUris: [],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scopes: ['openid'],
      },
    })

    expect(response.status()).toBe(400)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toHaveProperty('error')
  })

  test('should return 404 for non-existent client', async ({ request }) => {
    const response = await request.get(
      '/clients/00000000-0000-0000-0000-000000000000',
    )
    expect(response.status()).toBe(404)
  })

  test('should reject update with empty redirectUris', async ({ request }) => {
    const createRes = await request.post('/clients', {
      data: {
        name: 'Update Test Client',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scopes: ['openid'],
      },
    })
    expect(createRes.status()).toBe(201)
    const { id } = (await createRes.json()) as { id: string }

    const updateRes = await request.put(`/clients/${id}`, {
      data: {
        redirectUris: [],
      },
    })

    expect(updateRes.status()).toBe(400)
    const body = (await updateRes.json()) as Record<string, unknown>
    expect(body.error).toContain('redirect URI')
  })

  test('should reject update with invalid grant type', async ({ request }) => {
    const createRes = await request.post('/clients', {
      data: {
        name: 'Grant Type Update Test',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scopes: ['openid'],
      },
    })
    expect(createRes.status()).toBe(201)
    const { id } = (await createRes.json()) as { id: string }

    const updateRes = await request.put(`/clients/${id}`, {
      data: {
        grantTypes: ['invalid_grant_type'],
      },
    })

    expect(updateRes.status()).toBe(400)
    const body = (await updateRes.json()) as Record<string, unknown>
    expect(body.error).toContain('grant type')
  })
})
