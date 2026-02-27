import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDatabaseConfig } from '../config.ts'

const originalEnv = process.env

describe('Database configuration', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should use sensible defaults when env vars are not set', () => {
    delete process.env.SCYLLA_HOSTS
    delete process.env.SCYLLA_PORT
    delete process.env.SCYLLA_KEYSPACE
    delete process.env.SCYLLA_LOCAL_DATACENTER
    delete process.env.SCYLLA_USERNAME
    delete process.env.SCYLLA_PASSWORD
    delete process.env.SCYLLA_SSL
    delete process.env.SCYLLA_CONNECT_TIMEOUT_MS

    const config = getDatabaseConfig()

    expect(config.hosts).toEqual(['localhost'])
    expect(config.port).toBe(9042)
    expect(config.keyspace).toBe('jlj2_users')
    expect(config.localDataCenter).toBe('datacenter1')
    expect(config.username).toBeUndefined()
    expect(config.password).toBeUndefined()
    expect(config.isSslEnabled).toBe(false)
    expect(config.connectTimeoutMs).toBe(10_000)
  })

  it('should parse env vars and trim multiple hosts', () => {
    process.env.SCYLLA_HOSTS = 'host1, host2 ,host3 '
    process.env.SCYLLA_PORT = '19042'
    process.env.SCYLLA_KEYSPACE = 'custom_keyspace'
    process.env.SCYLLA_LOCAL_DATACENTER = 'dc-custom'
    process.env.SCYLLA_USERNAME = 'user'
    process.env.SCYLLA_PASSWORD = 'pass'
    process.env.SCYLLA_SSL = 'true'
    process.env.SCYLLA_CONNECT_TIMEOUT_MS = '5000'

    const config = getDatabaseConfig()

    expect(config.hosts).toEqual(['host1', 'host2', 'host3'])
    expect(config.port).toBe(19042)
    expect(config.keyspace).toBe('custom_keyspace')
    expect(config.localDataCenter).toBe('dc-custom')
    expect(config.username).toBe('user')
    expect(config.password).toBe('pass')
    expect(config.isSslEnabled).toBe(true)
    expect(config.connectTimeoutMs).toBe(5000)
  })

  it('should fall back to defaults on invalid numeric env vars', () => {
    process.env.SCYLLA_PORT = 'not-a-number'
    process.env.SCYLLA_CONNECT_TIMEOUT_MS = 'also-not-a-number'

    const config = getDatabaseConfig()

    expect(config.port).toBe(9042)
    expect(config.connectTimeoutMs).toBe(10_000)
  })
})
