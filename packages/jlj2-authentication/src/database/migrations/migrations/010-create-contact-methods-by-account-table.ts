import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '010',
  name: 'create_contact_methods_by_account_table',
  description:
    'Create contact_methods_by_account lookup table for efficient account-based contact method queries',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.contact_methods_by_account (
        account_id UUID,
        contact_id UUID,
        contact_type TEXT,
        contact_value TEXT,
        is_primary BOOLEAN,
        verified_at TIMESTAMP,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        PRIMARY KEY (account_id, contact_id)
      ) WITH CLUSTERING ORDER BY (contact_id ASC)
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `DROP TABLE IF EXISTS ${config.keyspace}.contact_methods_by_account`,
    )
  },
}
