import type { Context } from 'hono'
import { getJwks } from '../tokens/key-management.ts'

export const handleJwks = (c: Context) => {
  const jwks = getJwks()
  return c.json(jwks)
}
