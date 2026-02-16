import crypto from 'node:crypto'

const MICROSOFT_JWKS_URL =
  'https://login.microsoftonline.com/common/discovery/v2.0/keys'

/** Default cache TTL: 1 hour. */
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
  const response = await fetch(MICROSOFT_JWKS_URL)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Microsoft JWKS: ${response.status} ${response.statusText}`,
    )
  }
  const data = (await response.json()) as JwksResponse
  if (!data.keys || !Array.isArray(data.keys)) {
    throw new Error('Invalid Microsoft JWKS response: missing keys array')
  }
  return data
}

const jwkToKeyObject = (jwk: JwksKey): crypto.KeyObject => {
  if (jwk.kty !== 'RSA') {
    throw new Error(`Unsupported JWK key type: ${jwk.kty}`)
  }
  if (!jwk.n || !jwk.e) {
    throw new Error('RSA JWK must have n and e parameters')
  }
  return crypto.createPublicKey({
    key: {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
    },
    format: 'jwk',
  })
}

export const getMicrosoftJwks = async (): Promise<
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
        keys.set(jwk.kid, jwkToKeyObject(jwk))
      } catch {
        // Skip invalid keys
      }
    }
  }

  cachedKeys = keys
  cacheExpiresAt = now + DEFAULT_CACHE_TTL_MS
  return keys
}

export const getMicrosoftPublicKeyByKid = async (
  kid: string,
): Promise<crypto.KeyObject> => {
  const keys = await getMicrosoftJwks()
  const key = keys.get(kid)
  if (!key) {
    throw new Error(`Microsoft public key not found for kid: ${kid}`)
  }
  return key
}
