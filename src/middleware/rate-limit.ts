import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context, Next } from 'hono'
import { isDatabaseEnabledForEnv } from '../database/client.ts'
import { buildRateLimitKey, checkAndIncrement } from './rate-limit-storage.ts'

interface RateLimitRecord {
  count: number
  windowStart: number
}

const store = new Map<string, RateLimitRecord>()

const PRUNE_INTERVAL_MS = 60_000
let lastPrune = Date.now()

const pruneExpired = (windowMs: number): void => {
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL_MS) return
  lastPrune = now
  const cutoff = now - windowMs
  for (const [key, record] of store.entries()) {
    if (record.windowStart < cutoff) {
      store.delete(key)
    }
  }
}

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
 * Rate limit middleware. When ScyllaDB is enabled, uses distributed counters
 * for multi-instance and multi-tenant support. Falls back to in-memory store
 * when DB is disabled (e.g. tests, SCYLLA_DISABLED=true).
 * Configurable via RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX_REQUESTS env vars.
 */
export const rateLimit = (
  options?: Partial<RateLimitOptions>,
): ((c: Context, next: Next) => Promise<Response | undefined>) => {
  const windowMs =
    Number(process.env.RATE_LIMIT_WINDOW_MS) ||
    options?.windowMs ||
    DEFAULT_WINDOW_MS
  const maxRequests =
    Number(process.env.RATE_LIMIT_MAX_REQUESTS) ||
    options?.maxRequests ||
    DEFAULT_MAX_REQUESTS
  const scope = options?.scope ?? DEFAULT_SCOPE
  const tenantId = options?.tenantId

  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const identifier = getClientIp(c)

    if (isDatabaseEnabledForEnv()) {
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
        // On DB failure, fall through to in-memory to avoid blocking all traffic
        // eslint-disable-next-line no-console
        console.error(
          'Rate limit ScyllaDB check failed, falling back to in-memory:',
          error,
        )
      }
    }

    pruneExpired(windowMs)

    const key = buildRateLimitKey({
      scope,
      tenantId,
      identifier,
    })
    const now = Date.now()

    let record = store.get(key)
    if (!record || now - record.windowStart >= windowMs) {
      record = { count: 1, windowStart: now }
      store.set(key, record)
      await next()
      return undefined
    }

    record.count++
    if (record.count > maxRequests) {
      const { body, status, headers } = createRateLimitResponse(windowMs)
      return c.json(body, status, headers)
    }

    await next()
    return undefined
  }
}
