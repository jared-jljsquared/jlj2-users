#!/usr/bin/env node
/**
 * Polls ScyllaDB until it accepts CQL connections.
 * Used by CI to wait for the ScyllaDB service container before running tests.
 */
import { Client } from 'cassandra-driver'

const hosts = (process.env.SCYLLA_HOSTS ?? 'localhost')
  .split(',')
  .map((h) => h.trim())
const port = Number(process.env.SCYLLA_PORT ?? 9042)
const localDataCenter = process.env.SCYLLA_LOCAL_DATACENTER ?? 'datacenter1'
const maxAttempts = 30
const intervalMs = 2000

const run = async (): Promise<void> => {
  const client = new Client({
    contactPoints: hosts.map((h) => `${h}:${port}`),
    localDataCenter,
  })

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.connect()
      await client.execute('SELECT now() FROM system.local')
      await client.shutdown()
      console.log('ScyllaDB is ready')
      process.exit(0)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`Attempt ${attempt}/${maxAttempts}: ${message}`)
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      }
    }
  }

  console.error('ScyllaDB did not become ready within timeout')
  process.exit(1)
}

run()
