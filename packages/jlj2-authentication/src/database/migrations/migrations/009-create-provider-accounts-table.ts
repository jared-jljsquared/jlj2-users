import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '009',
  name: 'create_provider_accounts_table',
  description:
    'Create provider_accounts table for linking external provider accounts (Google, Microsoft, Facebook) to contact methods',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.provider_accounts (
        provider TEXT,
        provider_sub TEXT,
        contact_id UUID,
        account_id UUID,
        linked_at TIMESTAMP,
        created_at TIMESTAMP,
        PRIMARY KEY (provider, provider_sub)
      ) WITH CLUSTERING ORDER BY (provider_sub ASC)
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `DROP TABLE IF EXISTS ${config.keyspace}.provider_accounts`,
    )
  },
}
