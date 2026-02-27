import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getDatabaseClient,
  initializeDatabase,
  shutdownDatabase,
} from '../client.ts'

describe('Database Client (integration with ScyllaDB)', () => {
  const originalEnv = process.env

  beforeEach(async () => {
    process.env = { ...originalEnv }
    // Enable database explicitly for tests
    process.env.NODE_ENV = 'development'
    delete process.env.SCYLLA_DISABLED

    // Provide sensible defaults for local Scylla instance
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

    // Ensure we start from a clean client state
    await shutdownDatabase()
  })

  afterEach(async () => {
    await shutdownDatabase()
    process.env = originalEnv
  })

  it('should connect to ScyllaDB and execute a simple query', async () => {
    await initializeDatabase()
    const client = getDatabaseClient()

    const result = await client.execute('SELECT now() FROM system.local')
    expect(result).toBeDefined()
  })

  it('should reuse existing client instance across multiple initializations', async () => {
    await initializeDatabase()
    const client1 = getDatabaseClient()

    await initializeDatabase()
    const client2 = getDatabaseClient()

    expect(client1).toBe(client2)
  })

  it('should throw when getting client before initialization', () => {
    // Ensure client is not initialized
    process.env.SCYLLA_DISABLED = 'true'

    expect(() => {
      getDatabaseClient()
    }).toThrow('Database client not initialized')
  })
})
