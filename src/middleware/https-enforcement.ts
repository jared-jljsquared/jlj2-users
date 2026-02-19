import type { Context, Next } from 'hono'
import { isHttps } from './is-https.ts'

const isLocalhost = (c: Context): boolean => {
  try {
    const url = new URL(c.req.url)
    const host = url.hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  } catch {
    return false
  }
}

/**
 * HTTPS enforcement middleware. In production (NODE_ENV=production), rejects
 * non-HTTPS requests unless to localhost. No-op in development.
 */
export const httpsEnforcement = async (
  c: Context,
  next: Next,
): Promise<Response | undefined> => {
  const isProduction = process.env.NODE_ENV === 'production'
  if (!isProduction) {
    await next()
    return undefined
  }

  if (isHttps(c)) {
    await next()
    return undefined
  }

  if (isLocalhost(c)) {
    await next()
    return undefined
  }

  return c.json(
    {
      error: 'invalid_request',
      error_description: 'HTTPS is required',
    },
    403,
  )
}
