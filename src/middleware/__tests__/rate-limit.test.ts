import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { rateLimit } from '../rate-limit.ts'

describe('rateLimit', () => {
  it('should allow requests within limit', async () => {
    const app = new Hono()
    app.use('*', rateLimit({ windowMs: 60_000, maxRequests: 5 }))
    app.get('/test', (c) => c.json({ ok: true }))

    for (let i = 0; i < 5; i++) {
      const res = await app.request('/test', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      })
      expect(res.status).toBe(200)
    }
  })

  it('should return 429 when limit exceeded', async () => {
    const app = new Hono()
    app.use('*', rateLimit({ windowMs: 60_000, maxRequests: 3 }))
    app.get('/test', (c) => c.json({ ok: true }))

    for (let i = 0; i < 3; i++) {
      await app.request('/test', {
        headers: { 'x-forwarded-for': '10.0.0.1' },
      })
    }

    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    })

    expect(res.status).toBe(429)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('rate_limit_exceeded')
    expect(res.headers.get('Retry-After')).toBeDefined()
  })

  it('should track limits per IP', async () => {
    const app = new Hono()
    app.use('*', rateLimit({ windowMs: 60_000, maxRequests: 2 }))
    app.get('/test', (c) => c.json({ ok: true }))

    await app.request('/test', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    await app.request('/test', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    const blocked = await app.request('/test', {
      headers: { 'x-forwarded-for': '1.1.1.1' },
    })
    expect(blocked.status).toBe(429)

    const allowed = await app.request('/test', {
      headers: { 'x-forwarded-for': '2.2.2.2' },
    })
    expect(allowed.status).toBe(200)
  })
})
