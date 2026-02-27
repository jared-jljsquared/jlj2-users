import crypto from 'node:crypto'

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'

/** Default cache TTL: 1 hour. Google rotates keys; Cache-Control may override. */
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000

interface JwksKey {
  kid?: string
  kty: string
  use?: string
  alg?: string
  n?: string
  e?: string
}

interface JwksResponse {
  keys: JwksKey[]
}

let cachedKeys: Map<string, crypto.KeyObject> = new Map()
let cacheExpiresAt = 0

const fetchJwks = async (): Promise<JwksResponse> => {
  const response = await fetch(GOOGLE_JWKS_URL)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Google JWKS: ${response.status} ${response.statusText}`,
    )
  }
  const data = (await response.json()) as JwksResponse
  if (!data.keys || !Array.isArray(data.keys)) {
    throw new Error('Invalid Google JWKS response: missing keys array')
  }
  return data
}

/**
 * Convert a JWK to a Node.js KeyObject for signature verification.
 * Supports RSA keys (kty: RSA) used by Google.
 */
const jwkToKeyObject = (jwk: JwksKey): crypto.KeyObject => {
  if (jwk.kty !== 'RSA') {
    throw new Error(`Unsupported JWK key type: ${jwk.kty}`)
  }
  if (!jwk.n || !jwk.e) {
    throw new Error('RSA JWK must have n and e parameters')
  }
  const key = crypto.createPublicKey({
    key: {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
    },
    format: 'jwk',
  })
  return key
}

/**
 * Fetch and cache Google's public keys. Returns a map of kid -> KeyObject.
 */
export const getGoogleJwks = async (): Promise<
  Map<string, crypto.KeyObject>
> => {
  const now = Date.now()
  if (cachedKeys.size > 0 && now < cacheExpiresAt) {
    return cachedKeys
  }

  const jwks = await fetchJwks()
  const keys = new Map<string, crypto.KeyObject>()

  for (const jwk of jwks.keys) {
    if (jwk.kty === 'RSA' && jwk.kid) {
      try {
        const keyObject = jwkToKeyObject(jwk)
        keys.set(jwk.kid, keyObject)
      } catch {
        // Skip invalid keys
      }
    }
  }

  cachedKeys = keys
  cacheExpiresAt = now + DEFAULT_CACHE_TTL_MS
  return keys
}

/**
 * Get a public key by key ID. Fetches JWKS if not cached.
 */
export const getGooglePublicKeyByKid = async (
  kid: string,
): Promise<crypto.KeyObject> => {
  const keys = await getGoogleJwks()
  const key = keys.get(kid)
  if (!key) {
    throw new Error(`Google public key not found for kid: ${kid}`)
  }
  return key
}
