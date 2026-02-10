import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '007',
  name: 'create_identity_accounts_table',
  description:
    'Create identity_accounts junction table for many-to-many relationship (identity -> accounts)',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.identity_accounts (
        identity_id UUID,
        account_id UUID,
        created_at TIMESTAMP,
        PRIMARY KEY (identity_id, account_id)
      ) WITH CLUSTERING ORDER BY (account_id ASC)
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `DROP TABLE IF EXISTS ${config.keyspace}.identity_accounts`,
    )
  },
}
