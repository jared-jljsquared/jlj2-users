import { expect, test } from '@playwright/test'

test.describe('Basic Server', () => {
  test('should respond to root endpoint', async ({ request }) => {
    const response = await request.get('http://localhost:3000/')
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body).toHaveProperty('message')
    expect(body.message).toBe('No base get function defined')
  })

  test('should return about information', async ({ request }) => {
    const response = await request.get('http://localhost:3000/about')
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body).toHaveProperty('name')
    expect(body).toHaveProperty('version')
    expect(body.name).toBe('jlj2-users')
  })
})
