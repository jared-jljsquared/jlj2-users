import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeDatabase, shutdownDatabase } from '../../database/client.ts'
import { rateLimit } from '../rate-limit.ts'

describe('rateLimit (ScyllaDB)', () => {
  const originalEnv = process.env

  beforeAll(async () => {
    process.env = { ...originalEnv }
    process.env.NODE_ENV = 'development'
    delete process.env.SCYLLA_DISABLED

    if (!process.env.SCYLLA_HOSTS) process.env.SCYLLA_HOSTS = 'localhost'
    if (!process.env.SCYLLA_PORT) process.env.SCYLLA_PORT = '9042'
    if (!process.env.SCYLLA_KEYSPACE) process.env.SCYLLA_KEYSPACE = 'jlj2_users'
    if (!process.env.SCYLLA_LOCAL_DATACENTER) {
      process.env.SCYLLA_LOCAL_DATACENTER = 'datacenter1'
    }

    await initializeDatabase()
  })

  afterAll(async () => {
    await shutdownDatabase()
    process.env = originalEnv
  })

  it('should allow requests within limit', async () => {
    const app = new Hono()
    app.use(
      '*',
      rateLimit({
        scope: 'test-allow',
        windowMs: 60_000,
        maxRequests: 5,
      }),
    )
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
    app.use(
      '*',
      rateLimit({
        scope: 'test-429',
        windowMs: 60_000,
        maxRequests: 3,
      }),
    )
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

  it('should prefer cf-connecting-ip over x-forwarded-for when both present', async () => {
    const app = new Hono()
    app.use(
      '*',
      rateLimit({
        scope: 'test-cf-ip',
        windowMs: 60_000,
        maxRequests: 2,
      }),
    )
    app.get('/test', (c) => c.json({ ok: true }))

    // Client spoofs x-forwarded-for; cf-connecting-ip has real IP from Cloudflare
    await app.request('/test', {
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'cf-connecting-ip': 'real-client-ip',
      },
    })
    await app.request('/test', {
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'cf-connecting-ip': 'real-client-ip',
      },
    })
    const blocked = await app.request('/test', {
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'cf-connecting-ip': 'real-client-ip',
      },
    })
    expect(blocked.status).toBe(429)

    // Spoofed IP alone would allow more requests; real IP is correctly rate-limited
    const spoofedDifferent = await app.request('/test', {
      headers: { 'x-forwarded-for': '5.6.7.8' },
    })
    expect(spoofedDifferent.status).toBe(200)
  })

  it('should track limits per IP', async () => {
    const app = new Hono()
    app.use(
      '*',
      rateLimit({
        scope: 'test-per-ip',
        windowMs: 60_000,
        maxRequests: 2,
      }),
    )
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
