import { generateKeyPair, generateKeyPairSync } from 'node:crypto'
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

  it('should encode with correct character substitution', () => {
    // Use input that produces Base64 characters that need substitution
    // Base64 of "test" is "dGVzdA==" which contains '=' padding
    // Base64 of bytes that produce '+' and '/' characters
    const input1 = Buffer.from([0xfb, 0xef]) // Produces '+' in Base64
    const input2 = Buffer.from([0xff, 0xef]) // Produces '/' in Base64
    const encoded1 = base64UrlEncode(input1)
    const encoded2 = base64UrlEncode(input2)

    // Check that padding is removed
    const inputWithPadding = Buffer.from('test')
    const encodedWithPadding = base64UrlEncode(inputWithPadding)
    expect(encodedWithPadding).not.toContain('=')

    // Verify no standard Base64 characters that need substitution
    expect(encoded1).not.toContain('+')
    expect(encoded2).not.toContain('/')
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

  it('should handle various input sizes', () => {
    const sizes = [1, 10, 100, 1000]
    for (const size of sizes) {
      const input = Buffer.alloc(size, 'a')
      const encoded = base64UrlEncode(input)
      const decoded = base64UrlDecode(encoded)
      expect(decoded.toString()).toBe(input.toString())
    }
  })

  it('should correctly restore padding when decoding', () => {
    // Test with strings that need padding
    const testCases = [
      'test', // 4 bytes -> no padding needed
      'te', // 2 bytes -> needs 2 padding
      't', // 1 byte -> needs 3 padding
    ]

    for (const testCase of testCases) {
      const input = Buffer.from(testCase)
      const encoded = base64UrlEncode(input)
      const decoded = base64UrlDecode(encoded)
      expect(decoded.toString()).toBe(testCase)
    }
  })
})

describe('JWT Header Creation', () => {
  it('should create header with RS256 algorithm', () => {
    const header = createJwtHeader('RS256')
    expect(header.alg).toBe('RS256')
    expect(header.typ).toBe('JWT')
    expect(header.kid).toBeUndefined()
  })

  it('should create header with ES256 algorithm', () => {
    const header = createJwtHeader('ES256')
    expect(header.alg).toBe('ES256')
    expect(header.typ).toBe('JWT')
  })

  it('should create header with HS256 algorithm', () => {
    const header = createJwtHeader('HS256')
    expect(header.alg).toBe('HS256')
    expect(header.typ).toBe('JWT')
  })

  it('should create header with RS384 algorithm', () => {
    const header = createJwtHeader('RS384')
    expect(header.alg).toBe('RS384')
    expect(header.typ).toBe('JWT')
  })

  it('should create header with RS512 algorithm', () => {
    const header = createJwtHeader('RS512')
    expect(header.alg).toBe('RS512')
    expect(header.typ).toBe('JWT')
  })

  it('should create header with ES384 algorithm', () => {
    const header = createJwtHeader('ES384')
    expect(header.alg).toBe('ES384')
    expect(header.typ).toBe('JWT')
  })

  it('should create header with ES512 algorithm', () => {
    const header = createJwtHeader('ES512')
    expect(header.alg).toBe('ES512')
    expect(header.typ).toBe('JWT')
  })

  it('should create header with HS384 algorithm', () => {
    const header = createJwtHeader('HS384')
    expect(header.alg).toBe('HS384')
    expect(header.typ).toBe('JWT')
  })

  it('should create header with HS512 algorithm', () => {
    const header = createJwtHeader('HS512')
    expect(header.alg).toBe('HS512')
    expect(header.typ).toBe('JWT')
  })

  it('should include kid when provided', () => {
    const header = createJwtHeader('RS256', 'key-123')
    expect(header.kid).toBe('key-123')
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

  it('should detect ES256 algorithm from token header when not provided', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'ES256')

    // Verify without specifying algorithm - should detect from header
    const { payload: verifiedPayload } = verifyJwt(token, publicKey)
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

  it('should detect HS256 algorithm from token header when not provided', () => {
    const secret = 'my-secret-key'

    const payload = { sub: 'user123' }
    const token = signJwt(payload, secret, 'HS256')

    // Verify without specifying algorithm - should detect from header
    const { payload: verifiedPayload } = verifyJwt(token, secret)
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

  it('should detect algorithm from token header when not provided', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    const payload = { sub: 'user123' }
    const token = signJwt(payload, privateKey, 'RS256')

    // Verify without specifying algorithm - should detect from header
    const { payload: verifiedPayload } = verifyJwt(token, publicKey)
    expect(verifiedPayload.sub).toBe('user123')
  })

  it('should reject tokens with unsupported algorithm', async () => {
    const { publicKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    })

    // Create a token with unsupported algorithm in header
    const header = { alg: 'PS256', typ: 'JWT' }
    const payload = { sub: 'user123' }
    const invalidToken = assembleJwt(header, payload, 'signature')

    expect(() => {
      verifyJwt(invalidToken, publicKey)
    }).toThrow('Unsupported JWT algorithm')
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
