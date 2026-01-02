import crypto from 'node:crypto'
import type { JwtHeader } from './types/jwt-header.ts'
import type { JwtPayload } from './types/jwt-payload.ts'

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
  algorithm: 'RS256' | 'ES256',
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
 * Signs a JWT token using RS256 (RSA with SHA-256) or ES256 (ECDSA with SHA-256)
 */
export const signJwt = (
  payload: Record<string, unknown>,
  privateKey: string | Buffer | crypto.KeyObject,
  algorithm: 'RS256' | 'ES256' = 'RS256',
  kid?: string,
): string => {
  const header = createJwtHeader(algorithm, kid)

  const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header)))
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)))

  const signatureInput = `${encodedHeader}.${encodedPayload}`

  // Node.js crypto uses 'RSA-SHA256' for RS256 and 'SHA256' for ES256 (ECDSA)
  const signAlgorithm = algorithm === 'RS256' ? 'RSA-SHA256' : 'SHA256'
  const sign = crypto.createSign(signAlgorithm)
  sign.update(signatureInput)
  sign.end()

  const keyObject =
    typeof privateKey === 'string' || Buffer.isBuffer(privateKey)
      ? crypto.createPrivateKey(privateKey)
      : privateKey

  // For ES256, use IEEE P1363 format (RFC 7518 requirement) instead of default DER encoding
  const signOptions =
    algorithm === 'ES256'
      ? { key: keyObject, dsaEncoding: 'ieee-p1363' as const }
      : keyObject
  const signature = sign.sign(signOptions, 'base64')
  const encodedSignature = base64UrlEncode(Buffer.from(signature, 'base64'))

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`
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
    const header = JSON.parse(
      base64UrlDecode(encodedHeader).toString('utf-8'),
    ) as Record<string, unknown>
    const payload = JSON.parse(
      base64UrlDecode(encodedPayload).toString('utf-8'),
    ) as Record<string, unknown>

    return {
      header,
      payload,
      signature: encodedSignature,
    }
  } catch (error) {
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
  publicKey: string | Buffer | crypto.KeyObject,
  algorithm?: 'RS256' | 'ES256',
): {
  header: Record<string, unknown>
  payload: Record<string, unknown>
} => {
  const { header, payload, signature } = parseJwt(token)

  // Determine algorithm from header if not provided
  const tokenAlgorithm = (algorithm ?? (header.alg as string)) as
    | 'RS256'
    | 'ES256'
  if (tokenAlgorithm !== 'RS256' && tokenAlgorithm !== 'ES256') {
    throw new Error(
      `Unsupported JWT algorithm: ${tokenAlgorithm}. Only RS256 and ES256 are supported.`,
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
  const signatureBuffer = base64UrlDecode(signature)

  // Node.js crypto uses 'RSA-SHA256' for RS256 and 'SHA256' for ES256 (ECDSA)
  const verifyAlgorithm = tokenAlgorithm === 'RS256' ? 'RSA-SHA256' : 'SHA256'
  const verify = crypto.createVerify(verifyAlgorithm)
  verify.update(signatureInput)
  verify.end()

  const keyObject =
    typeof publicKey === 'string' || Buffer.isBuffer(publicKey)
      ? crypto.createPublicKey(publicKey)
      : publicKey

  try {
    // For ES256, use IEEE P1363 format (RFC 7518 requirement) instead of default DER encoding
    const verifyOptions =
      tokenAlgorithm === 'ES256'
        ? { key: keyObject, dsaEncoding: 'ieee-p1363' as const }
        : keyObject
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
