import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '004',
  name: 'create_contact_methods_table',
  description:
    'Create contact_methods table for email and phone contact information',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.contact_methods (
        account_id UUID,
        contact_id UUID,
        contact_type TEXT,
        contact_value TEXT,
        is_primary BOOLEAN,
        verified_at TIMESTAMP,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        PRIMARY KEY (contact_type, contact_value)
      ) WITH CLUSTERING ORDER BY (contact_value ASC)
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `DROP TABLE IF EXISTS ${config.keyspace}.contact_methods`,
    )
  },
}
