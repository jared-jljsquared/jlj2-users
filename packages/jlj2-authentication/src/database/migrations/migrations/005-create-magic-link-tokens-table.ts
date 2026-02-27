import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '005',
  name: 'create_magic_link_tokens_table',
  description:
    'Create magic_link_tokens table for passwordless authentication (email and SMS)',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.magic_link_tokens (
        contact_id UUID,
        magic_token TEXT,
        expires_at TIMESTAMP,
        used BOOLEAN,
        created_at TIMESTAMP,
        PRIMARY KEY (contact_id, magic_token)
      ) WITH CLUSTERING ORDER BY (magic_token ASC)
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `DROP TABLE IF EXISTS ${config.keyspace}.magic_link_tokens`,
    )
  },
}
