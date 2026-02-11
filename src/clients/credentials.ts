import crypto from 'node:crypto'

/**
 * Hash a client secret for storage.
 * Uses SHA-256 for deterministic hashing (allows verification).
 */
export const hashClientSecret = (secret: string): string => {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex')
}

/**
 * Verify a client secret against a stored hash.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export const verifyClientSecret = (
  secret: string,
  storedHash: string,
): boolean => {
  const computed = hashClientSecret(secret)
  if (computed.length !== storedHash.length) {
    return false
  }
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'utf8'),
      Buffer.from(storedHash, 'utf8'),
    )
  } catch {
    return false
  }
}
