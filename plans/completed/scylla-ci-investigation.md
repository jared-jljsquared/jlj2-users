# Investigation: Running ScyllaDB in CI for Unit Tests

## Goal

Enable the disabled test job in CI by running a Dockerized ScyllaDB instance so unit tests that require a real database can pass.

## Current State

- **Test job**: Disabled (`if: false`) in `.github/workflows/ci.yml`
- **Tests requiring ScyllaDB**:
  - `src/database/__tests__/health.test.ts` – connects via `initializeDatabase()`, checks health
  - `src/database/__tests__/client.test.ts` – connects via `initializeDatabase()`, runs CQL queries
- **Other tests**: Use mocks (storage, client, etc.) and do not need ScyllaDB
- **Database enablement**: `isDatabaseEnabledForEnv()` in `client.ts` returns `false` when `NODE_ENV=test` unless `SCYLLA_ENABLE_IN_TESTS=true`
- **Local dev**: `docker-compose.yml` runs `scylladb/scylla:latest` with developer mode flags

## Approach: GitHub Actions Service Containers

GitHub Actions supports **service containers** that run alongside job steps. When the job runs on the runner (not in a container), services are reachable at `localhost:<mapped_port>`.

### 1. Service Container Configuration

```yaml
services:
  scylla:
    image: scylladb/scylla:latest
    ports:
      - 9042:9042
    options: >-
      --health-cmd "cqlsh localhost 9042 -e 'DESCRIBE KEYSPACES' || exit 1"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 15
      --health-start-period 30s
```

**Note**: The `options` syntax for custom healthchecks may vary. GitHub Actions uses `docker run` under the hood; Docker's `--health-*` flags can be passed via `options`.

### 2. Alternative: No Built-in Healthcheck

GitHub Actions does not wait for service containers to be healthy before running steps. You must add an explicit wait step, e.g.:

```yaml
- name: Wait for ScyllaDB
  run: |
    for i in $(seq 1 60); do
      if cqlsh localhost 9042 -e "DESCRIBE KEYSPACES" 2>/dev/null; then
        echo "ScyllaDB ready"
        exit 0
      fi
      sleep 2
    done
    exit 1
```

**Problem**: `cqlsh` is not installed on `ubuntu-latest`. Options:

- Use a TCP port check: `nc -z localhost 9042` or `timeout 1 bash -c 'cat < /dev/null > /dev/tcp/localhost/9042'`
- Install `cqlsh` (Cassandra/ScyllaDB client package)
- Use a small Node/script that uses `cassandra-driver` to poll (you already have it)
- Use a marketplace action such as [wait-for-it](https://github.com/marketplace/actions/wait-for-it) or similar

### 3. Recommended: Retry Loop with Node

Reuse your existing stack—no extra tools:

```yaml
- name: Wait for ScyllaDB
  run: node -e "
    const { Client } = require('cassandra-driver');
    const client = new Client({ contactPoints: ['localhost'], localDataCenter: 'datacenter1' });
    async function wait() {
      for (let i = 0; i < 30; i++) {
        try {
          await client.connect();
          await client.execute('SELECT now() FROM system.local');
          await client.shutdown();
          process.exit(0);
        } catch (e) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      process.exit(1);
    }
    wait();
  "
```

Or add a small script: `scripts/wait-for-scylla.js` that does the same.

### 4. Environment Variables

The test job must set:

```yaml
env:
  SCYLLA_HOSTS: localhost
  SCYLLA_PORT: "9042"
  SCYLLA_KEYSPACE: jlj2_users
  SCYLLA_LOCAL_DATACENTER: datacenter1
  SCYLLA_ENABLE_IN_TESTS: "true"
```

### 5. Migrations

- **Health/client tests**: Use `system.local` and keyspace checks; they do not require your keyspace or migrations.
- **Integration tests (Playwright)**: The full app needs migrations. Run `pnpm migrate up` (or equivalent) before starting the app if you run integration tests in CI.

### 6. ScyllaDB Startup Time

- Cold start: ~17–24 seconds in typical setups
- Recommended: allow 30–60 seconds before considering ScyllaDB ready
- Your `docker-compose` uses `start_period: 40s`; CI should use a similar window

## Proposed Workflow Structure

```yaml
test:
  name: Tests
  runs-on: ubuntu-latest
  needs: build

  services:
    scylla:
      image: scylladb/scylla:latest
      ports:
        - 9042:9042
      env:
        SCYLLA_DEVELOPER_MODE: "1"
      options: --smp 1 --memory 1G --overprovisioned 1 --api-address 0.0.0.0

  env:
    SCYLLA_HOSTS: localhost
    SCYLLA_PORT: "9042"
    SCYLLA_KEYSPACE: jlj2_users
    SCYLLA_LOCAL_DATACENTER: datacenter1
    SCYLLA_ENABLE_IN_TESTS: "true"

  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with:
        version: 9
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: pnpm build

    - name: Wait for ScyllaDB
      run: pnpm exec tsx scripts/wait-for-scylla.ts
      # Or inline node script if you prefer

    - name: Run migrations (if integration tests run)
      run: pnpm migrate up
      # Only needed if you run Playwright / full app tests

    - name: Run unit tests
      run: pnpm test
```

## Considerations

| Topic | Notes |
|-------|--------|
| **Runner resources** | ScyllaDB docs suggest ≥1.5 GB RAM. GitHub-hosted runners have 7 GB; allocate with `--memory 1G` or similar. |
| **Cache** | Consider caching `~/.pnpm-store` and `node_modules` so install is faster. |
| **Integration tests** | Playwright needs the app running and DB migrated. That adds complexity; start with unit tests only. |
| **Test isolation** | DB tests share one ScyllaDB instance. Use a fresh keyspace per run or accept shared state if acceptable. |
| **Failures** | If ScyllaDB does not become ready, the wait step should fail the job clearly. |

## Alternative: Cassandra Image

ScyllaDB is API-compatible with Cassandra. You could use `cassandra:latest` as a lighter/faster option for CI. Your `cassandra-driver` works with both. Validate that behavior matches your production ScyllaDB.

## Implementation (Completed)

1. ✅ Added `scripts/wait-for-scylla.ts` – polls until ScyllaDB accepts CQL connections using `cassandra-driver`.
2. ✅ Re-enabled the test job in `.github/workflows/ci.yml` with:
   - ScyllaDB service container (`scylladb/scylla:latest`) with `SCYLLA_DEVELOPER_MODE=1`. Note: GitHub Actions service container `options` only accept Docker flags, not container args (e.g. `--smp`, `--memory`), so the image runs with its defaults.
   - Env vars: `SCYLLA_HOSTS`, `SCYLLA_PORT`, `SCYLLA_KEYSPACE`, `SCYLLA_LOCAL_DATACENTER`, `SCYLLA_ENABLE_IN_TESTS`
   - Wait step before `pnpm test`
3. Run CI and adjust the wait timeout if needed.
4. Optionally add migrations + integration tests in a later phase.
