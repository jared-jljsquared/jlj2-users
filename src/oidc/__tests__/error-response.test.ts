import { describe, expect, it } from 'vitest'
import { buildOidcRedirectUrl, oidcJsonError } from '../error-response.ts'

describe('oidcJsonError', () => {
  it('returns JSON with error and optional error_description', async () => {
    const res = oidcJsonError('invalid_request', 'client_id is required')
    expect(res.status).toBe(400)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Pragma')).toBe('no-cache')
    const body = await res.json()
    expect(body).toEqual({
      error: 'invalid_request',
      error_description: 'client_id is required',
    })
  })

  it('omits error_description when not provided', async () => {
    const res = oidcJsonError('invalid_client')
    const body = await res.json()
    expect(body).toEqual({ error: 'invalid_client' })
    expect(body).not.toHaveProperty('error_description')
  })

  it('uses custom status code', async () => {
    const res = oidcJsonError('invalid_client', 'Bad credentials', 401)
    expect(res.status).toBe(401)
  })
})

describe('buildOidcRedirectUrl', () => {
  it('builds URL with error parameters', () => {
    const url = buildOidcRedirectUrl('https://client.example.com/callback', {
      error: 'access_denied',
      error_description: 'User denied the request',
      state: 'abc123',
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('error')).toBe('access_denied')
    expect(parsed.searchParams.get('error_description')).toBe(
      'User denied the request',
    )
    expect(parsed.searchParams.get('state')).toBe('abc123')
  })

  it('omits optional parameters when null', () => {
    const url = buildOidcRedirectUrl('https://client.example.com/cb', {
      error: 'invalid_request',
      state: null,
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('error')).toBe('invalid_request')
    expect(parsed.searchParams.has('state')).toBe(false)
  })
})
