import type { Context } from 'hono'

/**
 * Returns true if the request is over HTTPS (direct or via x-forwarded-proto).
 */
export const isHttps = (c: Context): boolean => {
  try {
    const url = new URL(c.req.url)
    if (url.protocol === 'https:') return true
  } catch {
    // ignore
  }
  return c.req.header('x-forwarded-proto') === 'https'
}
