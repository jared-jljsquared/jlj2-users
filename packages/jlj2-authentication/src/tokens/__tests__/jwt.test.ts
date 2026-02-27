import crypto, { generateKeyPair, generateKeyPairSync } from 'node:crypto'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  assembleJwt,
  base64UrlDecode,
  base64UrlEncode,
  createJwtHeader,
  createJwtPayload,
  parseJwt,
  signJwt,
  verifyJwt,
} from '../jwt.ts'
import type { JwtPayload } from '../types/jwt-payload.ts'

const generateKeyPairAsync = promisify(generateKeyPair)

describe('Base64URL Encoding', () => {
  it('should encode without padding', () => {
    const input = Buffer.from('test')
    const encoded = base64UrlEncode(input)
    expect(encoded).not.toContain('=')
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
  })

  it('should round-trip encode and decode', () => {
    const original = Buffer.from('Hello, World!')
    const encoded = base64UrlEncode(original)
    const decoded = base64UrlDecode(encoded)
    expect(decoded.toString()).toBe(original.toString())
  })

  it('should handle empty buffer', () => {
    const input = Buffer.from('')
    const encoded = base64UrlEncode(input)
    const decoded = base64UrlDecode(encoded)
    expect(decoded.toString()).toBe('')
  })
})

describe('JWT Header Creation', () => {
  it('should create header with algorithm and optional kid', () => {
    const headerRs = createJwtHeader('RS256')
    expect(headerRs.alg).toBe('RS256')
    expect(headerRs.typ).toBe('JWT')
    expect(headerRs.kid).toBeUndefined()

    const headerWithKid = createJwtHeader('RS256', 'key-123')
    expect(headerWithKid.kid).toBe('key-123')
  })
})

describe('JWT Payload Creation', () => {
  it('should create payload with required claims', () => {
    const payload = createJwtPayload({
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
    })

    expect(payload.sub).toBe('user123')
    expect(payload.iss).toBe('https://example.com')
    expect(payload.aud).toBe('client-id')
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect(payload.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))
  })

  it('should use provided exp and iat values', () => {
    const now = Math.floor(Date.now() / 1000)
    const payload = createJwtPayload({
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
      exp: now + 7200,
      iat: now - 100,
    })

    expect(payload.exp).toBe(now + 7200)
    expect(payload.iat).toBe(now - 100)
  })

  it('should include optional claims', () => {
    const payload = createJwtPayload({
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
      nbf: 1000,
      jti: 'token-id-123',
    })

    expect(payload.nbf).toBe(1000)
    expect(payload.jti).toBe('token-id-123')
  })

  it('should include custom claims', () => {
    const payload = createJwtPayload({
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
      email: 'user@example.com',
      name: 'Test User',
    } as Parameters<typeof createJwtPayload>[0])

    const payloadWithCustom = payload as JwtPayload & {
      email: string
      name: string
    }
    expect(payloadWithCustom.email).toBe('user@example.com')
    expect(payloadWithCustom.name).toBe('Test User')
  })
})

describe('JWT Signing and Verification', () => {
  it('should sign and verify JWT with RS256', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const payload = {
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }

    const token = signJwt(payload, privateKey, 'RS256')
    const parts = token.split('.')
    expect(parts.length).toBe(3)

    const { payload: verifiedPayload } = verifyJwt(token, publicKey, 'RS256')
    expect(verifiedPayload.sub).toBe('user123')
    expect(verifiedPayload.iss).toBe('https://example.com')
  })

  it('should sign and verify JWT with ES256', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })

    const payload = {
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }

    const token = signJwt(payload, privateKey, 'ES256')
    const { payload: verifiedPayload } = verifyJwt(token, publicKey, 'ES256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should sign and verify JWT with RS384', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const payload = {
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }

    const token = signJwt(payload, privateKey, 'RS384')
    const { payload: verifiedPayload } = verifyJwt(token, publicKey, 'RS384')
    expect(verifiedPayload.sub).toBe('user123')
    expect(verifiedPayload.iss).toBe('https://example.com')
  })

  it('should sign and verify JWT with RS512', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const payload = {
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }

    const token = signJwt(payload, privateKey, 'RS512')
    const { payload: verifiedPayload } = verifyJwt(token, publicKey, 'RS512')
    expect(verifiedPayload.sub).toBe('user123')
    expect(verifiedPayload.iss).toBe('https://example.com')
  })

  it('should sign and verify JWT with ES384', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'secp384r1',
    })

    const payload = {
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }

    const token = signJwt(payload, privateKey, 'ES384')
    const { payload: verifiedPayload } = verifyJwt(token, publicKey, 'ES384')
    expect(verifiedPayload.sub).toBe('user123')
    expect(verifiedPayload.iss).toBe('https://example.com')
  })

  it('should sign and verify JWT with ES512', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'secp521r1',
    })

    const payload = {
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }

    const token = signJwt(payload, privateKey, 'ES512')
    const { payload: verifiedPayload } = verifyJwt(token, publicKey, 'ES512')
    expect(verifiedPayload.sub).toBe('user123')
    expect(verifiedPayload.iss).toBe('https://example.com')
  })

  it('should include kid in header when provided for ES256', async () => {
    const { privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'ES256', 'key-123')

    const { header } = parseJwt(token)
    expect(header.kid).toBe('key-123')
  })

  it('should reject expired ES256 tokens', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })

    const payload = {
      sub: 'user123',
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired
    }

    const token = signJwt(payload, privateKey, 'ES256')

    expect(() => {
      verifyJwt(token, publicKey, 'ES256')
    }).toThrow('JWT has expired')
  })

  it('should reject ES256 tokens with invalid signature', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'ES256')

    // Tamper with signature - create a valid-length but wrong signature
    // ES256 signatures are 64 bytes (IEEE P1363 format), so we need a 64-byte invalid signature
    const parts = token.split('.')
    const invalidSignatureBuffer = Buffer.alloc(64, 0xff)
    const invalidSignature = base64UrlEncode(invalidSignatureBuffer)
    parts[2] = invalidSignature
    const tamperedToken = parts.join('.')

    expect(() => {
      verifyJwt(tamperedToken, publicKey, 'ES256')
    }).toThrow('Invalid JWT signature')
  })

  it('should reject ES256 tokens with wrong public key', async () => {
    const { privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })
    const { publicKey: wrongPublicKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'ES256')

    expect(() => {
      verifyJwt(token, wrongPublicKey, 'ES256')
    }).toThrow('Invalid JWT signature')
  })

  it('should reject ES256 tokens with wrong algorithm', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'ES256')

    expect(() => {
      verifyJwt(token, publicKey, 'RS256')
    }).toThrow('JWT algorithm mismatch')
  })

  it('should validate nbf (not before) claim for ES256', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })

    const futureTime = Math.floor(Date.now() / 1000) + 3600
    const payload = {
      sub: 'user123',
      nbf: futureTime,
    }

    const token = signJwt(payload, privateKey, 'ES256')

    expect(() => {
      verifyJwt(token, publicKey, 'ES256')
    }).toThrow('JWT is not yet valid (nbf claim)')
  })

  it('should accept ES256 tokens with valid nbf claim', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })

    const pastTime = Math.floor(Date.now() / 1000) - 3600
    const payload = {
      sub: 'user123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      nbf: pastTime,
    }

    const token = signJwt(payload, privateKey, 'ES256')
    const { payload: verifiedPayload } = verifyJwt(token, publicKey, 'ES256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should work with string keys for ES256', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })

    const publicKeyPem = publicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string
    const privateKeyPem = privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }) as string

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKeyPem, 'ES256')
    const { payload: verifiedPayload } = verifyJwt(token, publicKeyPem, 'ES256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should work with Buffer keys for ES256', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })

    const publicKeyPem = Buffer.from(
      publicKey.export({ type: 'spki', format: 'pem' }) as string,
    )
    const privateKeyPem = Buffer.from(
      privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    )

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKeyPem, 'ES256')
    const { payload: verifiedPayload } = verifyJwt(token, publicKeyPem, 'ES256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should verify JWT with ES256 when algorithm is explicitly provided', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'ES256')

    // SECURITY: Algorithm must be explicitly provided to prevent algorithm confusion attacks
    const { payload: verifiedPayload } = verifyJwt(token, publicKey, 'ES256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should sign and verify JWT with HS256', () => {
    const secret = 'my-secret-key'

    const payload = {
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }

    const token = signJwt(payload, secret, 'HS256')
    const parts = token.split('.')
    expect(parts.length).toBe(3)

    const { payload: verifiedPayload } = verifyJwt(token, secret, 'HS256')
    expect(verifiedPayload.sub).toBe('user123')
    expect(verifiedPayload.iss).toBe('https://example.com')
  })

  it('should sign and verify JWT with HS384', () => {
    const secret = 'my-secret-key'

    const payload = {
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }

    const token = signJwt(payload, secret, 'HS384')
    const parts = token.split('.')
    expect(parts.length).toBe(3)

    const { payload: verifiedPayload } = verifyJwt(token, secret, 'HS384')
    expect(verifiedPayload.sub).toBe('user123')
    expect(verifiedPayload.iss).toBe('https://example.com')
  })

  it('should sign and verify JWT with HS512', () => {
    const secret = 'my-secret-key'

    const payload = {
      sub: 'user123',
      iss: 'https://example.com',
      aud: 'client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }

    const token = signJwt(payload, secret, 'HS512')
    const parts = token.split('.')
    expect(parts.length).toBe(3)

    const { payload: verifiedPayload } = verifyJwt(token, secret, 'HS512')
    expect(verifiedPayload.sub).toBe('user123')
    expect(verifiedPayload.iss).toBe('https://example.com')
  })

  it('should include kid in header when provided for HS256', () => {
    const secret = 'my-secret-key'

    const payload = { sub: 'user123' }
    const token = signJwt(payload, secret, 'HS256', 'key-123')

    const { header } = parseJwt(token)
    expect(header.kid).toBe('key-123')
  })

  it('should reject expired HS256 tokens', () => {
    const secret = 'my-secret-key'

    const payload = {
      sub: 'user123',
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired
    }

    const token = signJwt(payload, secret, 'HS256')

    expect(() => {
      verifyJwt(token, secret, 'HS256')
    }).toThrow('JWT has expired')
  })

  it('should reject HS256 tokens with invalid signature', () => {
    const secret = 'my-secret-key'

    const payload = { sub: 'user123' }
    const token = signJwt(payload, secret, 'HS256')

    // Tamper with signature
    const parts = token.split('.')
    parts[2] = 'invalid-signature'
    const tamperedToken = parts.join('.')

    expect(() => {
      verifyJwt(tamperedToken, secret, 'HS256')
    }).toThrow('Invalid JWT signature')
  })

  it('should reject HS256 tokens with wrong secret', () => {
    const secret = 'my-secret-key'
    const wrongSecret = 'wrong-secret-key'

    const payload = { sub: 'user123' }
    const token = signJwt(payload, secret, 'HS256')

    expect(() => {
      verifyJwt(token, wrongSecret, 'HS256')
    }).toThrow('Invalid JWT signature')
  })

  it('should reject HS256 tokens with wrong algorithm', () => {
    const secret = 'my-secret-key'
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, secret, 'HS256')

    expect(() => {
      verifyJwt(token, publicKey, 'RS256')
    }).toThrow('JWT algorithm mismatch')
  })

  it('should validate nbf (not before) claim for HS256', () => {
    const secret = 'my-secret-key'

    const futureTime = Math.floor(Date.now() / 1000) + 3600
    const payload = {
      sub: 'user123',
      nbf: futureTime,
    }

    const token = signJwt(payload, secret, 'HS256')

    expect(() => {
      verifyJwt(token, secret, 'HS256')
    }).toThrow('JWT is not yet valid (nbf claim)')
  })

  it('should accept HS256 tokens with valid nbf claim', () => {
    const secret = 'my-secret-key'

    const pastTime = Math.floor(Date.now() / 1000) - 3600
    const payload = {
      sub: 'user123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      nbf: pastTime,
    }

    const token = signJwt(payload, secret, 'HS256')
    const { payload: verifiedPayload } = verifyJwt(token, secret, 'HS256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should work with string secrets for HS256', () => {
    const secret = 'my-secret-key'

    const payload = { sub: 'user123' }
    const token = signJwt(payload, secret, 'HS256')
    const { payload: verifiedPayload } = verifyJwt(token, secret, 'HS256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should work with Buffer secrets for HS256', () => {
    const secret = Buffer.from('my-secret-key')

    const payload = { sub: 'user123' }
    const token = signJwt(payload, secret, 'HS256')
    const { payload: verifiedPayload } = verifyJwt(token, secret, 'HS256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should verify JWT with HS256 when algorithm is explicitly provided', () => {
    const secret = 'my-secret-key'

    const payload = { sub: 'user123' }
    const token = signJwt(payload, secret, 'HS256')

    // SECURITY: Algorithm must be explicitly provided to prevent algorithm confusion attacks
    const { payload: verifiedPayload } = verifyJwt(token, secret, 'HS256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should include kid in header when provided', async () => {
    const { privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'RS256', 'key-123')

    const { header } = parseJwt(token)
    expect(header.kid).toBe('key-123')
  })

  it('should reject expired tokens', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const payload = {
      sub: 'user123',
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired
    }

    const token = signJwt(payload, privateKey, 'RS256')

    expect(() => {
      verifyJwt(token, publicKey, 'RS256')
    }).toThrow('JWT has expired')
  })

  it('should reject tokens with invalid signature', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'RS256')

    // Tamper with signature
    const parts = token.split('.')
    parts[2] = 'invalid-signature'
    const tamperedToken = parts.join('.')

    expect(() => {
      verifyJwt(tamperedToken, publicKey, 'RS256')
    }).toThrow('Invalid JWT signature')
  })

  it('should reject tokens with wrong public key', async () => {
    const { privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })
    const { publicKey: wrongPublicKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'RS256')

    expect(() => {
      verifyJwt(token, wrongPublicKey, 'RS256')
    }).toThrow('Invalid JWT signature')
  })

  it('should reject tokens with wrong algorithm', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'RS256')

    expect(() => {
      verifyJwt(token, publicKey, 'ES256')
    }).toThrow('JWT algorithm mismatch')
  })

  it('should reject malformed tokens', () => {
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    })

    expect(() => {
      verifyJwt('not-a-valid-token', publicKey, 'RS256')
    }).toThrow('Invalid JWT format')
  })

  it('should reject tokens with invalid JSON in header', () => {
    // Create a token with invalid header JSON
    const invalidHeader = base64UrlEncode(Buffer.from('invalid-json'))
    const validPayload = base64UrlEncode(
      Buffer.from(JSON.stringify({ sub: 'user123' })),
    )
    const invalidToken = `${invalidHeader}.${validPayload}.signature`

    expect(() => {
      parseJwt(invalidToken)
    }).toThrow('Invalid JWT format')
  })

  it('should reject tokens with invalid JSON in payload', () => {
    // Create a token with invalid payload JSON
    const validHeader = base64UrlEncode(
      Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    )
    const invalidPayload = base64UrlEncode(Buffer.from('invalid-json'))
    const invalidToken = `${validHeader}.${invalidPayload}.signature`

    expect(() => {
      parseJwt(invalidToken)
    }).toThrow('Invalid JWT format')
  })

  it('should validate nbf (not before) claim', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const futureTime = Math.floor(Date.now() / 1000) + 3600
    const payload = {
      sub: 'user123',
      nbf: futureTime,
    }

    const token = signJwt(payload, privateKey, 'RS256')

    expect(() => {
      verifyJwt(token, publicKey, 'RS256')
    }).toThrow('JWT is not yet valid (nbf claim)')
  })

  it('should accept tokens with valid nbf claim', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const pastTime = Math.floor(Date.now() / 1000) - 3600
    const payload = {
      sub: 'user123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      nbf: pastTime,
    }

    const token = signJwt(payload, privateKey, 'RS256')
    const { payload: verifiedPayload } = verifyJwt(token, publicKey, 'RS256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should work with string keys', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const publicKeyPem = publicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string
    const privateKeyPem = privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }) as string

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKeyPem, 'RS256')
    const { payload: verifiedPayload } = verifyJwt(token, publicKeyPem, 'RS256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should work with Buffer keys', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const publicKeyPem = Buffer.from(
      publicKey.export({ type: 'spki', format: 'pem' }) as string,
    )
    const privateKeyPem = Buffer.from(
      privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    )

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKeyPem, 'RS256')
    const { payload: verifiedPayload } = verifyJwt(token, publicKeyPem, 'RS256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should verify JWT with RS256 when algorithm is explicitly provided', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'RS256')

    // SECURITY: Algorithm must be explicitly provided to prevent algorithm confusion attacks
    const { payload: verifiedPayload } = verifyJwt(token, publicKey, 'RS256')
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should reject tokens when header algorithm does not match provided algorithm', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    // Create a token with RS256 in header
    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'RS256')

    // SECURITY: Algorithm mismatch should be rejected
    // Attempting to verify with a different algorithm should fail
    expect(() => {
      verifyJwt(token, publicKey, 'ES256')
    }).toThrow('JWT algorithm mismatch')
  })
})

describe('JWT Parsing', () => {
  it('should parse token into header, payload, and signature', () => {
    const header = { alg: 'RS256', typ: 'JWT' }
    const payload = { sub: 'user123' }
    const signature = 'test-signature'
    const token = assembleJwt(header, payload, signature)

    const parsed = parseJwt(token)
    expect(parsed.header).toEqual(header)
    expect(parsed.payload).toEqual(payload)
    expect(parsed.signature).toBe(signature)
  })

  it('should handle various claim types in payload', () => {
    const header = { alg: 'RS256', typ: 'JWT' }
    const payload = {
      sub: 'user123',
      iss: 'https://example.com',
      aud: ['client1', 'client2'],
      exp: 1234567890,
      iat: 1234567890,
      nbf: 1234567890,
      jti: 'token-id',
      customString: 'value',
      customNumber: 42,
      customBoolean: true,
      customArray: [1, 2, 3],
      customObject: { nested: 'value' },
    }
    const signature = 'test-signature'
    const token = assembleJwt(header, payload, signature)

    const parsed = parseJwt(token)
    expect(parsed.payload).toEqual(payload)
  })

  it('should reject tokens with wrong number of parts', () => {
    expect(() => {
      parseJwt('not-enough-parts')
    }).toThrow('Invalid JWT format')

    expect(() => {
      parseJwt('too.many.parts.here')
    }).toThrow('Invalid JWT format')
  })

  it('should reject tokens with null header', () => {
    const nullHeader = base64UrlEncode(Buffer.from('null'))
    const validPayload = base64UrlEncode(
      Buffer.from(JSON.stringify({ sub: 'user123' })),
    )
    const invalidToken = `${nullHeader}.${validPayload}.signature`

    expect(() => {
      parseJwt(invalidToken)
    }).toThrow('Invalid JWT format: header must be a JSON object, got null')
  })

  it('should reject tokens with null payload', () => {
    const validHeader = base64UrlEncode(
      Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    )
    const nullPayload = base64UrlEncode(Buffer.from('null'))
    const invalidToken = `${validHeader}.${nullPayload}.signature`

    expect(() => {
      parseJwt(invalidToken)
    }).toThrow('Invalid JWT format: payload must be a JSON object, got null')
  })

  it('should reject tokens with array header', () => {
    const arrayHeader = base64UrlEncode(Buffer.from('[1, 2, 3]'))
    const validPayload = base64UrlEncode(
      Buffer.from(JSON.stringify({ sub: 'user123' })),
    )
    const invalidToken = `${arrayHeader}.${validPayload}.signature`

    expect(() => {
      parseJwt(invalidToken)
    }).toThrow('Invalid JWT format: header must be a JSON object, got array')
  })

  it('should reject tokens with array payload', () => {
    const validHeader = base64UrlEncode(
      Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    )
    const arrayPayload = base64UrlEncode(Buffer.from('[1, 2, 3]'))
    const invalidToken = `${validHeader}.${arrayPayload}.signature`

    expect(() => {
      parseJwt(invalidToken)
    }).toThrow('Invalid JWT format: payload must be a JSON object, got array')
  })

  it('should reject tokens with primitive header', () => {
    const stringHeader = base64UrlEncode(Buffer.from('"string"'))
    const validPayload = base64UrlEncode(
      Buffer.from(JSON.stringify({ sub: 'user123' })),
    )
    const invalidToken = `${stringHeader}.${validPayload}.signature`

    expect(() => {
      parseJwt(invalidToken)
    }).toThrow('Invalid JWT format: header must be a JSON object, got string')
  })

  it('should reject tokens with primitive payload', () => {
    const validHeader = base64UrlEncode(
      Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    )
    const numberPayload = base64UrlEncode(Buffer.from('123'))
    const invalidToken = `${validHeader}.${numberPayload}.signature`

    expect(() => {
      parseJwt(invalidToken)
    }).toThrow('Invalid JWT format: payload must be a JSON object, got number')
  })
})

describe('JWT Assembly', () => {
  it('should assemble token from components', () => {
    const header = { alg: 'RS256', typ: 'JWT', kid: 'key-123' }
    const payload = { sub: 'user123', iss: 'https://example.com' }
    const signature = 'encoded-signature'

    const token = assembleJwt(header, payload, signature)
    const parts = token.split('.')

    expect(parts.length).toBe(3)
    expect(parts[2]).toBe(signature)
  })
})

describe('JWT Time Claim Validation', () => {
  it('should reject tokens with non-numeric exp claim', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    // Create a payload with a non-numeric exp claim
    const payload = {
      sub: 'user123',
      exp: 'never', // Non-numeric string
    }

    const token = signJwt(payload, privateKey, 'RS256')

    // Should reject because exp must be a number (NumericDate per RFC 7519)
    expect(() => {
      verifyJwt(token, publicKey, 'RS256')
    }).toThrow(/exp claim must be a number/i)
  })

  it('should reject tokens with non-numeric nbf claim', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    // Create a payload with a non-numeric nbf claim
    const payload = {
      sub: 'user123',
      nbf: 'always', // Non-numeric string
    }

    const token = signJwt(payload, privateKey, 'RS256')

    // Should reject because nbf must be a number (NumericDate per RFC 7519)
    expect(() => {
      verifyJwt(token, publicKey, 'RS256')
    }).toThrow(/nbf claim must be a number/i)
  })

  it('should reject tokens with exp claim as string number', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    // Create a payload with exp as a string that looks like a number
    // Use a future date so it wouldn't be expired if treated as a number
    const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 // 24 hours from now
    const payload = {
      sub: 'user123',
      exp: String(futureTimestamp), // String, not number
    }

    const token = signJwt(payload, privateKey, 'RS256')

    // Should reject because exp must be an actual number, not a string
    expect(() => {
      verifyJwt(token, publicKey, 'RS256')
    }).toThrow(/exp claim must be a number/i)
  })

  it('should reject tokens with exp as boolean', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    // Create a payload with exp as boolean
    const header = { alg: 'RS256', typ: 'JWT' }
    const payloadWithBoolean = {
      sub: 'user123',
      exp: true, // Boolean instead of number
    }

    // Manually create token since signJwt would type-check
    const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header)))
    const encodedPayload = base64UrlEncode(
      Buffer.from(JSON.stringify(payloadWithBoolean)),
    )
    const signatureInput = `${encodedHeader}.${encodedPayload}`
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(signatureInput)
    sign.end()
    const signature = base64UrlEncode(
      Buffer.from(sign.sign(privateKey, 'base64'), 'base64'),
    )
    const token = `${encodedHeader}.${encodedPayload}.${signature}`

    // Should reject because exp must be a number (NumericDate per RFC 7519)
    expect(() => {
      verifyJwt(token, publicKey, 'RS256')
    }).toThrow(/exp claim must be a number/i)
  })
})
