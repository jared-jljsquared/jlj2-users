import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '002',
  name: 'create_migration_history',
  description: 'Create migration_history table to track applied migrations',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.migration_history (
        version TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        applied_at TIMESTAMP,
        rolled_back_at TIMESTAMP
      )
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `DROP TABLE IF EXISTS ${config.keyspace}.migration_history`,
    )
  },
}
