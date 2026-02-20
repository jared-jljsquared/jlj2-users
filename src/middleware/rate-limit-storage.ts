import type { Client } from 'cassandra-driver'
import { getDatabaseClient } from '../database/client.ts'
import { getDatabaseConfig } from '../database/config.ts'

const getDbClient = (): Client => getDatabaseClient()
const getKeyspace = (): string => getDatabaseConfig().keyspace

/**
 * Safely parse Scylla COUNTER value to number. The driver returns Long-like objects;
 * Number(long) can yield NaN. Use toNumber() when available, guard against NaN.
 */
const parseCounterValue = (value: unknown): number => {
  if (value == null) return 0
  const n =
    typeof value === 'number'
      ? value
      : ((value as { toNumber?: () => number }).toNumber?.() ?? Number(value))
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

export interface RateLimitCheckParams {
  scope: string
  tenantId?: string
  identifier: string
  windowMs: number
  maxRequests: number
}

/**
 * Builds a rate limit key for multi-tenant support.
 * Format: {scope}:{tenantId}:{identifier}
 * For single-tenant, tenantId is empty: flows::192.168.1.1
 */
export const buildRateLimitKey = (params: {
  scope: string
  tenantId?: string
  identifier: string
}): string => {
  const tenant = params.tenantId ?? ''
  return `${params.scope}:${tenant}:${params.identifier}`
}

/**
 * Checks if the request is within the rate limit, and if so, increments the counter.
 * Returns true if the request should be allowed, false if rate limit exceeded.
 *
 * Uses a read-then-increment flow. A small race allows 1-2 extra requests per window;
 * this is acceptable for rate limiting.
 */
export const checkAndIncrement = async (
  params: RateLimitCheckParams,
): Promise<boolean> => {
  const client = getDbClient()
  const keyspace = getKeyspace()
  const key = buildRateLimitKey({
    scope: params.scope,
    tenantId: params.tenantId,
    identifier: params.identifier,
  })
  const windowBucket = Math.floor(Date.now() / params.windowMs)

  const selectResult = await client.execute(
    `SELECT count FROM ${keyspace}.rate_limit_counters WHERE key = ? AND window_bucket = ?`,
    [key, windowBucket],
    { prepare: true },
  )

  const rawCount = selectResult.rows[0]?.count
  const currentCount = parseCounterValue(rawCount)

  if (currentCount >= params.maxRequests) {
    return false
  }

  await client.execute(
    `UPDATE ${keyspace}.rate_limit_counters SET count = count + 1 WHERE key = ? AND window_bucket = ?`,
    [key, windowBucket],
    { prepare: true },
  )

  return true
}
