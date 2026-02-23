import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleEndSession } from '../end-session.ts'

vi.mock('../../clients/service.ts', () => ({
  getClientById: vi.fn(),
}))

describe('End Session (Logout)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OIDC_ISSUER = 'http://localhost:3000'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should clear session and redirect to login when no post_logout_redirect_uri', async () => {
    const app = new Hono()
    app.get('/logout', handleEndSession)

    const res = await app.request('/logout', {
      headers: {
        Cookie: 'oidc_session=valid-session-token',
      },
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login')
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('should redirect to login when post_logout_redirect_uri without id_token_hint', async () => {
    const app = new Hono()
    app.get('/logout', handleEndSession)

    const res = await app.request(
      '/logout?post_logout_redirect_uri=https://client.example.com/post-logout',
    )

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login')
  })

  it('should redirect to login when id_token_hint is invalid', async () => {
    const app = new Hono()
    app.get('/logout', handleEndSession)

    const res = await app.request(
      '/logout?post_logout_redirect_uri=https://client.example.com/post-logout&id_token_hint=invalid.jwt.token',
    )

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login')
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})
