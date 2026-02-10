import crypto, { timingSafeEqual } from 'node:crypto'
import { nanoid } from 'nanoid'

export interface PasswordHash {
  hash: string
  salt: string
}

/**
 * Hash a password using Node.js crypto scrypt with nanoid-generated salt
 * @param password - Plain text password to hash
 * @returns Promise resolving to hash and salt
 */
export const hashPassword = (password: string): Promise<PasswordHash> => {
  return new Promise((resolve, reject) => {
    // Generate salt using nanoid for URL-safe, unique identifiers
    const salt = nanoid()

    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) {
        reject(err)
        return
      }

      resolve({
        hash: derivedKey.toString('hex'),
        salt,
      })
    })
  })
}

/**
 * Verify a password against a hash and salt
 * Uses timing-safe comparison to prevent timing attacks
 * @param password - Plain text password to verify
 * @param hash - Password hash (hex string)
 * @param salt - Salt used for hashing
 * @returns Promise resolving to true if password matches, false otherwise
 */
export const verifyPassword = (
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) {
        reject(err)
        return
      }

      // Convert both hashes to Buffers for timing-safe comparison
      const hashBuffer = Buffer.from(hash, 'hex')
      const derivedKeyBuffer = Buffer.from(derivedKey)

      // timingSafeEqual requires buffers of the same length
      // Since we always use 64 bytes for the key length, they should match
      if (hashBuffer.length !== derivedKeyBuffer.length) {
        resolve(false)
        return
      }

      // Use timing-safe comparison to prevent timing attacks
      resolve(timingSafeEqual(hashBuffer, derivedKeyBuffer))
    })
  })
}
