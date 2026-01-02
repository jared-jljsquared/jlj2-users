import type { Context } from 'hono'

interface JwksResponse {
  keys: unknown[]
}

export const handleJwks = (c: Context) => {
  // Placeholder: Keys will be added in Step 4 (Key Management)
  const jwks: JwksResponse = {
    keys: [],
  }

  return c.json(jwks)
}
