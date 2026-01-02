import crypto, { timingSafeEqual } from 'node:crypto'
import type { JwtHeader } from './types/jwt-header.ts'
import type { JwtPayload } from './types/jwt-payload.ts'

/**
 * Supported JWT signing algorithms
 */
export type JwtAlgorithm =
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'ES256'
  | 'ES384'
  | 'ES512'
  | 'HS256'
  | 'HS384'
  | 'HS512'

/**
 * Encodes a Buffer to Base64URL format
 * Base64URL is Base64 with URL-safe characters and no padding
 */
export const base64UrlEncode = (buffer: Buffer): string => {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Decodes a Base64URL string to a Buffer
 * Handles padding restoration for proper Base64 decoding
 */
export const base64UrlDecode = (str: string): Buffer => {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  // Add padding if needed
  while (base64.length % 4) {
    base64 += '='
  }
  return Buffer.from(base64, 'base64')
}

/**
 * Creates a JWT header with the specified algorithm
 */
export const createJwtHeader = (
  algorithm: JwtAlgorithm,
  kid?: string,
): JwtHeader => {
  const header: JwtHeader = {
    alg: algorithm,
    typ: 'JWT',
  }
  if (kid) {
    header.kid = kid
  }
  return header
}

/**
 * Creates a JWT payload with standard claims
 */
export const createJwtPayload = (
  claims: Partial<JwtPayload> & {
    sub: string
    iss: string
    aud: string | string[]
  },
): JwtPayload => {
  const now = Math.floor(Date.now() / 1000)
  return {
    iss: claims.iss,
    sub: claims.sub,
    aud: claims.aud,
    exp: claims.exp ?? now + 3600, // Default 1 hour expiration
    iat: claims.iat ?? now,
    ...(claims.nbf !== undefined && { nbf: claims.nbf }),
    ...(claims.jti !== undefined && { jti: claims.jti }),
    ...Object.fromEntries(
      Object.entries(claims).filter(
        ([key]) =>
          !['iss', 'sub', 'aud', 'exp', 'iat', 'nbf', 'jti'].includes(key),
      ),
    ),
  } as JwtPayload
}

/**
 * Signs a JWT token using RSA, ECDSA, or HMAC algorithms
 */
export const signJwt = (
  payload: Record<string, unknown>,
  keyOrSecret: string | Buffer | crypto.KeyObject,
  algorithm: JwtAlgorithm = 'RS256',
  kid?: string,
): string => {
  const header = createJwtHeader(algorithm, kid)

  const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header)))
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)))

  const signatureInput = `${encodedHeader}.${encodedPayload}`

  let signature: string

  if (algorithm.startsWith('HS')) {
    // HMAC algorithms use symmetric keys
    const hashAlgorithm =
      algorithm === 'HS256'
        ? 'SHA256'
        : algorithm === 'HS384'
          ? 'SHA384'
          : 'SHA512'
    const hmac = crypto.createHmac(hashAlgorithm, keyOrSecret)
    hmac.update(signatureInput)
    const signatureBuffer = hmac.digest()
    signature = base64UrlEncode(signatureBuffer)
  } else if (algorithm.startsWith('RS')) {
    // RSA algorithms use asymmetric keys
    const hashAlgorithm =
      algorithm === 'RS256'
        ? 'RSA-SHA256'
        : algorithm === 'RS384'
          ? 'RSA-SHA384'
          : 'RSA-SHA512'
    const sign = crypto.createSign(hashAlgorithm)
    sign.update(signatureInput)
    sign.end()

    const keyObject =
      typeof keyOrSecret === 'string' || Buffer.isBuffer(keyOrSecret)
        ? crypto.createPrivateKey(keyOrSecret)
        : keyOrSecret

    const signatureBase64 = sign.sign(keyObject, 'base64')
    signature = base64UrlEncode(Buffer.from(signatureBase64, 'base64'))
  } else {
    // ES algorithms (ECDSA) use asymmetric keys with IEEE P1363 format
    const hashAlgorithm =
      algorithm === 'ES256'
        ? 'SHA256'
        : algorithm === 'ES384'
          ? 'SHA384'
          : 'SHA512'
    const sign = crypto.createSign(hashAlgorithm)
    sign.update(signatureInput)
    sign.end()

    const keyObject =
      typeof keyOrSecret === 'string' || Buffer.isBuffer(keyOrSecret)
        ? crypto.createPrivateKey(keyOrSecret)
        : keyOrSecret

    // For ES algorithms, use IEEE P1363 format (RFC 7518 requirement) instead of default DER encoding
    const signOptions = { key: keyObject, dsaEncoding: 'ieee-p1363' as const }
    const signatureBase64 = sign.sign(signOptions, 'base64')
    signature = base64UrlEncode(Buffer.from(signatureBase64, 'base64'))
  }

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

/**
 * Parses a JWT token into its component parts
 */
export const parseJwt = (
  token: string,
): {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
} => {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format: token must have three parts')
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts

  try {
    const headerValue = JSON.parse(
      base64UrlDecode(encodedHeader).toString('utf-8'),
    )
    const payloadValue = JSON.parse(
      base64UrlDecode(encodedPayload).toString('utf-8'),
    )

    // Validate that header is a non-null object (not array, not primitive)
    if (
      headerValue === null ||
      Array.isArray(headerValue) ||
      typeof headerValue !== 'object'
    ) {
      throw new Error(
        'Invalid JWT format: header must be a JSON object, got ' +
          (headerValue === null
            ? 'null'
            : Array.isArray(headerValue)
              ? 'array'
              : typeof headerValue),
      )
    }

    // Validate that payload is a non-null object (not array, not primitive)
    if (
      payloadValue === null ||
      Array.isArray(payloadValue) ||
      typeof payloadValue !== 'object'
    ) {
      throw new Error(
        'Invalid JWT format: payload must be a JSON object, got ' +
          (payloadValue === null
            ? 'null'
            : Array.isArray(payloadValue)
              ? 'array'
              : typeof payloadValue),
      )
    }

    const header = headerValue as Record<string, unknown>
    const payload = payloadValue as Record<string, unknown>

    return {
      header,
      payload,
      signature: encodedSignature,
    }
  } catch (error) {
    // Re-throw our validation errors as-is, wrap other errors
    if (
      error instanceof Error &&
      error.message.startsWith('Invalid JWT format:')
    ) {
      throw error
    }
    throw new Error(
      `Invalid JWT format: failed to parse token parts - ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Verifies a JWT token signature and validates claims
 */
export const verifyJwt = (
  token: string,
  keyOrSecret: string | Buffer | crypto.KeyObject,
  algorithm?: JwtAlgorithm,
): {
  header: Record<string, unknown>
  payload: Record<string, unknown>
} => {
  const { header, payload, signature } = parseJwt(token)

  // Determine algorithm from header if not provided
  const tokenAlgorithm = (algorithm ?? (header.alg as string)) as JwtAlgorithm
  const supportedAlgorithms: JwtAlgorithm[] = [
    'RS256',
    'RS384',
    'RS512',
    'ES256',
    'ES384',
    'ES512',
    'HS256',
    'HS384',
    'HS512',
  ]
  if (!supportedAlgorithms.includes(tokenAlgorithm)) {
    throw new Error(
      `Unsupported JWT algorithm: ${tokenAlgorithm}. Supported algorithms: ${supportedAlgorithms.join(', ')}`,
    )
  }

  // Check if algorithm in header matches the verification algorithm
  const headerAlgorithm = header.alg as string
  if (algorithm && headerAlgorithm !== algorithm) {
    throw new Error(
      `JWT algorithm mismatch: token uses ${headerAlgorithm} but verification requested ${algorithm}`,
    )
  }

  // Verify signature - (original signature was based off of the first two parts)
  const signatureInput = token.split('.').slice(0, 2).join('.')

  if (tokenAlgorithm.startsWith('HS')) {
    // HMAC algorithms use symmetric keys
    const hashAlgorithm =
      tokenAlgorithm === 'HS256'
        ? 'SHA256'
        : tokenAlgorithm === 'HS384'
          ? 'SHA384'
          : 'SHA512'
    const hmac = crypto.createHmac(hashAlgorithm, keyOrSecret)
    hmac.update(signatureInput)
    const expectedSignatureBuffer = hmac.digest()

    // Decode the signature from base64url to a buffer
    let signatureBuffer: Buffer
    try {
      signatureBuffer = base64UrlDecode(signature)
    } catch {
      throw new Error('Invalid JWT signature')
    }

    // timingSafeEqual requires buffers of the same length
    if (signatureBuffer.length !== expectedSignatureBuffer.length) {
      throw new Error('Invalid JWT signature')
    }

    if (!timingSafeEqual(signatureBuffer, expectedSignatureBuffer)) {
      throw new Error('Invalid JWT signature')
    }
  } else if (tokenAlgorithm.startsWith('RS')) {
    // RSA algorithms use asymmetric keys
    const hashAlgorithm =
      tokenAlgorithm === 'RS256'
        ? 'RSA-SHA256'
        : tokenAlgorithm === 'RS384'
          ? 'RSA-SHA384'
          : 'RSA-SHA512'
    const verify = crypto.createVerify(hashAlgorithm)
    verify.update(signatureInput)
    verify.end()

    const keyObject =
      typeof keyOrSecret === 'string' || Buffer.isBuffer(keyOrSecret)
        ? crypto.createPublicKey(keyOrSecret)
        : keyOrSecret

    const signatureBuffer = base64UrlDecode(signature)
    try {
      const isValid = verify.verify(keyObject, signatureBuffer)
      if (!isValid) {
        throw new Error('Invalid JWT signature')
      }
    } catch (error) {
      // Handle crypto errors (e.g., wrong algorithm, invalid key format)
      if (
        error instanceof Error &&
        (error.message.includes('Invalid') ||
          error.message.includes('digest') ||
          error.message.includes('key'))
      ) {
        throw new Error('Invalid JWT signature')
      }
      throw error
    }
  } else {
    // ES algorithms (ECDSA) use asymmetric keys with IEEE P1363 format
    const hashAlgorithm =
      tokenAlgorithm === 'ES256'
        ? 'SHA256'
        : tokenAlgorithm === 'ES384'
          ? 'SHA384'
          : 'SHA512'
    const verify = crypto.createVerify(hashAlgorithm)
    verify.update(signatureInput)
    verify.end()

    const keyObject =
      typeof keyOrSecret === 'string' || Buffer.isBuffer(keyOrSecret)
        ? crypto.createPublicKey(keyOrSecret)
        : keyOrSecret

    const signatureBuffer = base64UrlDecode(signature)
    try {
      // For ES algorithms, use IEEE P1363 format (RFC 7518 requirement) instead of default DER encoding
      const verifyOptions = {
        key: keyObject,
        dsaEncoding: 'ieee-p1363' as const,
      }
      const isValid = verify.verify(verifyOptions, signatureBuffer)
      if (!isValid) {
        throw new Error('Invalid JWT signature')
      }
    } catch (error) {
      // Handle crypto errors (e.g., wrong algorithm, invalid key format)
      if (
        error instanceof Error &&
        (error.message.includes('Invalid') ||
          error.message.includes('digest') ||
          error.message.includes('key'))
      ) {
        throw new Error('Invalid JWT signature')
      }
      throw error
    }
  }

  // Verify expiration
  const exp = payload.exp as number | undefined
  if (exp !== undefined) {
    const now = Math.floor(Date.now() / 1000)
    if (now >= exp) {
      throw new Error('JWT has expired')
    }
  }

  // Verify not-before (nbf)
  const nbf = payload.nbf as number | undefined
  if (nbf !== undefined) {
    const now = Math.floor(Date.now() / 1000)
    if (now < nbf) {
      throw new Error('JWT is not yet valid (nbf claim)')
    }
  }

  return { header, payload }
}

/**
 * Assembles a complete JWT token from header, payload, and signature
 * This is primarily for testing or manual token construction
 */
export const assembleJwt = (
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  signature: string,
): string => {
  const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header)))
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)))
  return `${encodedHeader}.${encodedPayload}.${signature}`
}
