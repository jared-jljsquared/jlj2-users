import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '019',
  name: 'create_rate_limit_counters_table',
  description:
    'Create rate_limit_counters table for distributed rate limiting across instances',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.rate_limit_counters (
        key TEXT,
        window_bucket BIGINT,
        count COUNTER,
        PRIMARY KEY (key, window_bucket)
      )
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `DROP TABLE IF EXISTS ${config.keyspace}.rate_limit_counters`,
    )
  },
}
