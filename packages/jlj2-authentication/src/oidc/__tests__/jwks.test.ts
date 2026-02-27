import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearKeyStore,
  generateKeyPair,
  retireKey,
} from '../../tokens/key-management.ts'
import { handleJwks } from '../jwks.ts'

describe('JWKS Endpoint', () => {
  beforeEach(() => {
    clearKeyStore()
  })

  afterEach(() => {
    clearKeyStore()
  })

  it('should return all active keys', async () => {
    const keyPair1 = generateKeyPair('RS256')
    const keyPair2 = generateKeyPair('ES256')
    const app = new Hono()
    app.get('/.well-known/jwks.json', handleJwks)

    const res = await app.request('/.well-known/jwks.json')
    expect(res.status).toBe(200)
    const jwks = (await res.json()) as { keys: Array<{ kid: string }> }
    expect(jwks).toHaveProperty('keys')
    expect(Array.isArray(jwks.keys)).toBe(true)
    expect(jwks.keys.length).toBe(2)
    expect(jwks.keys.map((k) => k.kid)).toContain(keyPair1.kid)
    expect(jwks.keys.map((k) => k.kid)).toContain(keyPair2.kid)
  })

  it('should exclude retired keys', async () => {
    const keyPair1 = generateKeyPair('RS256')
    const keyPair2 = generateKeyPair('ES256')
    retireKey(keyPair1.kid)
    const app = new Hono()
    app.get('/.well-known/jwks.json', handleJwks)

    const res = await app.request('/.well-known/jwks.json')
    const jwks = (await res.json()) as { keys: Array<{ kid: string }> }

    expect(jwks.keys.length).toBe(1)
    expect(jwks.keys[0].kid).toBe(keyPair2.kid)
  })

  it('should return empty keys array when no active keys', async () => {
    const app = new Hono()
    app.get('/.well-known/jwks.json', handleJwks)

    const res = await app.request('/.well-known/jwks.json')
    const jwks = (await res.json()) as { keys: unknown[] }

    expect(jwks.keys).toEqual([])
  })

  it('should include required JWK fields for RSA keys', async () => {
    generateKeyPair('RS256')
    const app = new Hono()
    app.get('/.well-known/jwks.json', handleJwks)

    const res = await app.request('/.well-known/jwks.json')
    const jwks = (await res.json()) as {
      keys: Array<{
        kty: string
        kid: string
        use: string
        alg: string
        n: string
        e: string
      }>
    }

    const rsaKey = jwks.keys.find((k) => k.kty === 'RSA')
    expect(rsaKey).toBeDefined()
    if (rsaKey) {
      expect(rsaKey.kty).toBe('RSA')
      expect(rsaKey.kid).toBeTruthy()
      expect(rsaKey.use).toBe('sig')
      expect(rsaKey.alg).toBe('RS256')
      expect(rsaKey.n).toBeTruthy()
      expect(rsaKey.e).toBeTruthy()
    }
  })

  it('should include required JWK fields for ECDSA keys', async () => {
    generateKeyPair('ES256')
    const app = new Hono()
    app.get('/.well-known/jwks.json', handleJwks)

    const res = await app.request('/.well-known/jwks.json')
    const jwks = (await res.json()) as {
      keys: Array<{
        kty: string
        kid: string
        use: string
        alg: string
        crv: string
        x: string
        y: string
      }>
    }

    const ecKey = jwks.keys.find((k) => k.kty === 'EC')
    expect(ecKey).toBeDefined()
    if (ecKey) {
      expect(ecKey.kty).toBe('EC')
      expect(ecKey.kid).toBeTruthy()
      expect(ecKey.use).toBe('sig')
      expect(ecKey.alg).toBe('ES256')
      expect(ecKey.crv).toBe('P-256')
      expect(ecKey.x).toBeTruthy()
      expect(ecKey.y).toBeTruthy()
    }
  })
})
