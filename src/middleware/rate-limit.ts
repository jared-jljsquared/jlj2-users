import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context, Next } from 'hono'
import { parseNumber } from '../plumbing/parse-number.ts'
import { checkAndIncrement } from './rate-limit-storage.ts'

const getClientIp = (c: Context): string => {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const cfIp = c.req.header('cf-connecting-ip')
  if (cfIp) return cfIp
  try {
    const info = getConnInfo(c)
    const address = info?.remote?.address
    if (address) return address
  } catch {
    // getConnInfo requires Node server bindings; unavailable in tests or non-Node runtimes
  }
  return 'unknown'
}

export interface RateLimitOptions {
  windowMs: number
  maxRequests: number
  scope?: string
  tenantId?: string
}

const DEFAULT_WINDOW_MS = 60_000
const DEFAULT_MAX_REQUESTS = 100
const DEFAULT_SCOPE = 'flows'

const createRateLimitResponse = (windowMs: number) => ({
  body: {
    error: 'rate_limit_exceeded',
    error_description: 'Too many requests. Please try again later.',
  },
  status: 429 as const,
  headers: { 'Retry-After': String(Math.ceil(windowMs / 1000)) },
})

/**
 * Rate limit middleware. Uses ScyllaDB for distributed counters across instances
 * and multi-tenant support. Requires database to be initialized at startup.
 * Configurable via RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX_REQUESTS env vars.
 */
export const rateLimit = (
  options?: Partial<RateLimitOptions>,
): ((c: Context, next: Next) => Promise<Response | undefined>) => {
  const envWindowMs = parseNumber(process.env.RATE_LIMIT_WINDOW_MS, -1)
  const windowMs =
    envWindowMs > 0 ? envWindowMs : (options?.windowMs ?? DEFAULT_WINDOW_MS)

  const envMaxRequests = parseNumber(process.env.RATE_LIMIT_MAX_REQUESTS, -1)
  const maxRequests =
    envMaxRequests > 0
      ? envMaxRequests
      : (options?.maxRequests ?? DEFAULT_MAX_REQUESTS)
  const scope = options?.scope ?? DEFAULT_SCOPE
  const tenantId = options?.tenantId

  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const identifier = getClientIp(c)

    try {
      const allowed = await checkAndIncrement({
        scope,
        tenantId,
        identifier,
        windowMs,
        maxRequests,
      })
      if (!allowed) {
        const { body, status, headers } = createRateLimitResponse(windowMs)
        return c.json(body, status, headers)
      }
      await next()
      return undefined
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Rate limit database check failed:', error)
      return c.json(
        {
          error: 'service_unavailable',
          error_description:
            'Rate limiting is temporarily unavailable. Please try again later.',
        },
        503,
        { 'Retry-After': '60' },
      )
    }
  }
}
