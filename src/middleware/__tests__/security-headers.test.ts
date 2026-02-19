import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { securityHeaders } from '../security-headers.ts'

describe('securityHeaders', () => {
  it('should set X-Content-Type-Options, X-Frame-Options, Referrer-Policy', async () => {
    const app = new Hono()
    app.use('*', securityHeaders)
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('/test')

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin',
    )
  })

  it('should set HSTS when request is over HTTPS', async () => {
    const app = new Hono()
    app.use('*', securityHeaders)
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('https://example.com/test')

    expect(res.headers.get('Strict-Transport-Security')).toContain(
      'max-age=31536000',
    )
  })

  it('should set HSTS when x-forwarded-proto is https', async () => {
    const app = new Hono()
    app.use('*', securityHeaders)
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('/test', {
      headers: { 'x-forwarded-proto': 'https' },
    })

    expect(res.headers.get('Strict-Transport-Security')).toContain(
      'max-age=31536000',
    )
  })
})
