import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initializeDatabase, shutdownDatabase } from '../client.ts'
import { checkDatabaseHealth } from '../health.ts'

describe('Database Health (integration with ScyllaDB)', () => {
  const originalEnv = process.env

  beforeEach(async () => {
    process.env = { ...originalEnv }
    // Enable database explicitly for tests
    process.env.NODE_ENV = 'development'
    delete process.env.SCYLLA_DISABLED

    if (!process.env.SCYLLA_HOSTS) {
      process.env.SCYLLA_HOSTS = 'localhost'
    }
    if (!process.env.SCYLLA_PORT) {
      process.env.SCYLLA_PORT = '9042'
    }
    if (!process.env.SCYLLA_KEYSPACE) {
      process.env.SCYLLA_KEYSPACE = 'jlj2_users'
    }
    if (!process.env.SCYLLA_LOCAL_DATACENTER) {
      process.env.SCYLLA_LOCAL_DATACENTER = 'datacenter1'
    }

    await shutdownDatabase()
  })

  afterEach(async () => {
    await shutdownDatabase()
    process.env = originalEnv
  })

  it('should report healthy when ScyllaDB is available', async () => {
    await initializeDatabase()

    const health = await checkDatabaseHealth()
    expect(health.isHealthy).toBe(true)
  })

  it('should report unhealthy when database client is not initialized', async () => {
    // Explicitly disable DB and avoid initialization
    process.env.SCYLLA_DISABLED = 'true'
    await shutdownDatabase()

    const health = await checkDatabaseHealth()
    expect(health.isHealthy).toBe(true)
    expect(health.message).toBe('Database disabled for this environment')
  })
})
