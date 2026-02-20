import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { httpsEnforcement } from '../https-enforcement.ts'

describe('httpsEnforcement', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should allow requests in development', async () => {
    process.env.NODE_ENV = 'development'

    const app = new Hono()
    app.use('*', httpsEnforcement)
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('http://example.com/test')

    expect(res.status).toBe(200)
  })

  it('should allow HTTPS in production', async () => {
    process.env.NODE_ENV = 'production'

    const app = new Hono()
    app.use('*', httpsEnforcement)
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('https://example.com/test')

    expect(res.status).toBe(200)
  })

  it('should allow localhost over HTTP in production', async () => {
    process.env.NODE_ENV = 'production'

    const app = new Hono()
    app.use('*', httpsEnforcement)
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('http://localhost:3000/test')

    expect(res.status).toBe(200)
  })

  it('should allow IPv6 localhost [::1] over HTTP in production', async () => {
    process.env.NODE_ENV = 'production'

    const app = new Hono()
    app.use('*', httpsEnforcement)
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('http://[::1]:3000/test')

    expect(res.status).toBe(200)
  })

  it('should reject non-HTTPS non-localhost in production', async () => {
    process.env.NODE_ENV = 'production'

    const app = new Hono()
    app.use('*', httpsEnforcement)
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('http://example.com/test')

    expect(res.status).toBe(403)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('invalid_request')
    expect(body.error_description).toContain('HTTPS')
  })

  it('should allow x-forwarded-proto https in production', async () => {
    process.env.NODE_ENV = 'production'

    const app = new Hono()
    app.use('*', httpsEnforcement)
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('http://example.com/test', {
      headers: { 'x-forwarded-proto': 'https' },
    })

    expect(res.status).toBe(200)
  })
})
