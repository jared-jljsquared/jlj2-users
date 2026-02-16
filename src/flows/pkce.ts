import crypto from 'node:crypto'

/**
 * Generate a cryptographically random code_verifier (RFC 7636).
 * Length 43-128 characters, base64url encoded.
 */
export const generateCodeVerifier = (): string => {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * Verify PKCE code_verifier against code_challenge
 */
export const verifyCodeVerifier = (
  codeVerifier: string,
  codeChallenge: string,
  method: string,
): boolean => {
  if (method === 'plain') {
    return codeVerifier === codeChallenge
  }

  if (method === 'S256') {
    const hash = crypto
      .createHash('sha256')
      .update(codeVerifier, 'utf8')
      .digest('base64url')
    return hash === codeChallenge
  }

  return false
}

/**
 * Generate code_challenge from code_verifier (for testing)
 */
export const generateCodeChallenge = (
  codeVerifier: string,
  method: 'S256' | 'plain',
): string => {
  if (method === 'plain') {
    return codeVerifier
  }
  return crypto
    .createHash('sha256')
    .update(codeVerifier, 'utf8')
    .digest('base64url')
}
