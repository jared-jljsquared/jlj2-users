import crypto from 'node:crypto'
import type { JwtAlgorithm } from './jwt.ts'
import type { ECJWK, RSAJWK } from './types/jwk.ts'

/**
 * Represents a key pair with metadata
 */
export interface KeyPair {
  /** Key ID - unique identifier for this key */
  kid: string
  /** Private key for signing */
  privateKey: crypto.KeyObject
  /** Public key for verification */
  publicKey: crypto.KeyObject
  /** Algorithm this key is used for */
  algorithm: JwtAlgorithm
  /** Timestamp when key was created (milliseconds since epoch) */
  createdAt: number
  /** Timestamp when key expires (milliseconds since epoch, optional) */
  expiresAt?: number
  /** Whether this key is active (false means retired) */
  isActive: boolean
}

/**
 * In-memory key storage
 * In a production system, this could be replaced with persistent storage
 */
const keyStore = new Map<string, KeyPair>()

/**
 * Default key algorithm
 */
const DEFAULT_ALGORITHM: JwtAlgorithm = 'RS256'

/**
 * Default key expiration (90 days in milliseconds)
 */
const DEFAULT_KEY_EXPIRATION = 90 * 24 * 60 * 60 * 1000

/**
 * Generates a unique key ID
 */
const generateKeyId = (): string => {
  return `kid-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
}

/**
 * Maps algorithm to curve name for ECDSA keys
 */
const getCurveName = (
  algorithm: JwtAlgorithm,
): 'prime256v1' | 'secp384r1' | 'secp521r1' => {
  switch (algorithm) {
    case 'ES256':
      return 'prime256v1'
    case 'ES384':
      return 'secp384r1'
    case 'ES512':
      return 'secp521r1'
    default:
      throw new Error(`Unsupported ECDSA algorithm: ${algorithm}`)
  }
}

/**
 * Generates a new key pair for the specified algorithm
 */
export const generateKeyPair = (
  algorithm: JwtAlgorithm = DEFAULT_ALGORITHM,
  expirationMs: number = DEFAULT_KEY_EXPIRATION,
): KeyPair => {
  const kid = generateKeyId()
  const createdAt = Date.now()
  const expiresAt = createdAt + expirationMs

  let privateKey: crypto.KeyObject
  let publicKey: crypto.KeyObject

  if (algorithm.startsWith('RS')) {
    // RSA key pair
    const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync(
      'rsa',
      {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      },
    )
    privateKey = crypto.createPrivateKey(priv)
    publicKey = crypto.createPublicKey(pub)
  } else if (algorithm.startsWith('ES')) {
    // ECDSA key pair
    const curve = getCurveName(algorithm)
    const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync(
      'ec',
      {
        namedCurve: curve,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      },
    )
    privateKey = crypto.createPrivateKey(priv)
    publicKey = crypto.createPublicKey(pub)
  } else {
    throw new Error(
      `Key pair generation not supported for algorithm: ${algorithm}. Only RSA and ECDSA algorithms are supported.`,
    )
  }

  const keyPair: KeyPair = {
    kid,
    privateKey,
    publicKey,
    algorithm,
    createdAt,
    expiresAt,
    isActive: true,
  }

  // Store the key pair
  keyStore.set(kid, keyPair)

  return keyPair
}

/**
 * Retrieves a key pair by key ID
 */
export const getKeyPair = (kid: string): KeyPair | undefined => {
  return keyStore.get(kid)
}

/**
 * Retrieves all key pairs
 */
export const getAllKeyPairs = (): KeyPair[] => {
  return Array.from(keyStore.values())
}

/**
 * Retrieves all active (non-expired, non-retired) key pairs
 */
export const getActiveKeys = (): KeyPair[] => {
  const now = Date.now()
  return Array.from(keyStore.values()).filter(
    (key) => key.isActive && (!key.expiresAt || key.expiresAt > now),
  )
}

/**
 * Retrieves an active key pair by key ID
 */
export const getActiveKeyPair = (kid: string): KeyPair | undefined => {
  const keyPair = keyStore.get(kid)
  if (!keyPair) {
    return undefined
  }
  if (!keyPair.isActive) {
    return undefined
  }
  if (keyPair.expiresAt && keyPair.expiresAt <= Date.now()) {
    return undefined
  }
  return keyPair
}

/**
 * Retrieves the most recent active key pair for an algorithm
 */
export const getLatestActiveKey = (
  algorithm: JwtAlgorithm = DEFAULT_ALGORITHM,
): KeyPair | undefined => {
  const activeKeys = getActiveKeys().filter(
    (key) => key.algorithm === algorithm,
  )
  if (activeKeys.length === 0) {
    return undefined
  }
  // Sort by creation date (most recent first)
  activeKeys.sort((a, b) => b.createdAt - a.createdAt)
  return activeKeys[0]
}

/**
 * Retires a key pair (marks it as inactive)
 */
export const retireKey = (kid: string): boolean => {
  const keyPair = keyStore.get(kid)
  if (!keyPair) {
    return false
  }
  keyPair.isActive = false
  keyStore.set(kid, keyPair)
  return true
}

/**
 * Removes expired keys from the key store
 */
export const cleanupExpiredKeys = (): number => {
  const now = Date.now()
  let removedCount = 0
  for (const [kid, keyPair] of keyStore.entries()) {
    if (keyPair.expiresAt && keyPair.expiresAt <= now) {
      keyStore.delete(kid)
      removedCount++
    }
  }
  return removedCount
}

/**
 * Initializes the key store with at least one active key
 * If no active keys exist, generates a new default key pair
 */
export const initializeKeys = (): KeyPair => {
  cleanupExpiredKeys()
  const activeKeys = getActiveKeys()
  if (activeKeys.length > 0) {
    // Return the most recent active key
    activeKeys.sort((a, b) => b.createdAt - a.createdAt)
    return activeKeys[0]
  }
  // No active keys, generate a new one
  return generateKeyPair(DEFAULT_ALGORITHM)
}

/**
 * Rotates keys by generating a new key pair while keeping old ones active
 * Optionally retires old keys after generating new ones
 */
export const rotateKeys = (
  algorithm: JwtAlgorithm = DEFAULT_ALGORITHM,
  retireOldKeys: boolean = false,
): KeyPair => {
  const newKeyPair = generateKeyPair(algorithm)
  if (retireOldKeys) {
    // Retire all old keys for this algorithm
    const oldKeys = getActiveKeys().filter(
      (key) => key.algorithm === algorithm && key.kid !== newKeyPair.kid,
    )
    for (const oldKey of oldKeys) {
      retireKey(oldKey.kid)
    }
  }
  return newKeyPair
}

/**
 * Converts a public key to JWK format (RFC 7517)
 */
export const keyToJwk = (
  publicKey: crypto.KeyObject,
  kid: string,
  alg: string,
): RSAJWK | ECJWK => {
  // Export key as JWK format (Node.js crypto supports this natively)
  const jwk = publicKey.export({ format: 'jwk' }) as
    | RSAJWK
    | ECJWK
    | { kty: string; [key: string]: unknown }

  // Ensure required fields are set
  if (jwk.kty === 'RSA') {
    const rsaJwk = jwk as RSAJWK
    const result: RSAJWK = {
      kty: 'RSA',
      kid,
      use: 'sig',
      alg,
      n: rsaJwk.n,
      e: rsaJwk.e,
    }
    return result
  } else if (jwk.kty === 'EC') {
    const ecJwk = jwk as ECJWK
    const result: ECJWK = {
      kty: 'EC',
      kid,
      use: 'sig',
      alg,
      crv: ecJwk.crv as 'P-256' | 'P-384' | 'P-521',
      x: ecJwk.x,
      y: ecJwk.y,
    }
    return result
  } else {
    throw new Error(`Unsupported key type: ${jwk.kty}`)
  }
}

/**
 * Converts all active keys to JWKS format
 */
export const getJwks = (): { keys: (RSAJWK | ECJWK)[] } => {
  const activeKeys = getActiveKeys()
  const jwks = activeKeys.map((keyPair) =>
    keyToJwk(keyPair.publicKey, keyPair.kid, keyPair.algorithm),
  )
  return { keys: jwks }
}

/**
 * Clears all keys from the key store (primarily for testing)
 */
export const clearKeyStore = (): void => {
  keyStore.clear()
}
