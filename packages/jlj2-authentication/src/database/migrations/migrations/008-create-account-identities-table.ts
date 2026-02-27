import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '008',
  name: 'create_account_identities_table',
  description:
    'Create account_identities junction table for many-to-many relationship (account -> identities)',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.account_identities (
        account_id UUID,
        identity_id UUID,
        created_at TIMESTAMP,
        PRIMARY KEY (account_id, identity_id)
      ) WITH CLUSTERING ORDER BY (identity_id ASC)
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `DROP TABLE IF EXISTS ${config.keyspace}.account_identities`,
    )
  },
}
