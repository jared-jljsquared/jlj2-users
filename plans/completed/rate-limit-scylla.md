# Rate Limiting with ScyllaDB

## Status: Implemented

## Previous Limitation

The in-memory rate limiter **would not survive** multi-tenant or multi-instance deployment:

1. **Multi-instance**: Each app instance had its own Map. An attacker could bypass limits by spreading requests across instances.
2. **Multi-tenant**: The key was IP-only. No tenant isolation.
3. **Restarts**: In-memory state was lost on deploy/restart.

## Implemented ScyllaDB Approach

- **Table**: `rate_limit_counters` (migration 019) with `(key, window_bucket)` as primary key
- **Key**: `{scope}:{tenant_id}:{identifier}` — e.g. `flows::192.168.1.1` (single-tenant) or `flows:tenant_abc:192.168.1.1` (multi-tenant)
- **Window bucket**: `floor(now / windowMs)` — fixed windows
- **Counter**: Cassandra COUNTER type for atomic increment
- **TTL**: Not supported on counter columns; old rows accumulate. Optional cleanup job can delete rows where `window_bucket < (now - 2*window)`.

Flow: 1) Read count for (key, window_bucket). 2) If count >= limit, return 429. 3) Increment counter. 4) Allow request.

Minor race: two concurrent requests could both read 99 and both pass before increment. Acceptable for rate limiting.

## Usage

- Always uses ScyllaDB `checkAndIncrement`; in-memory fallback removed
- App requires ScyllaDB at startup (`initializeDatabase({ required: true })`); exits with error if unavailable
- On DB failure at runtime: returns 503 Service Unavailable
- Multi-tenant: pass `tenantId` in `rateLimit({ tenantId: '...' })` when available
