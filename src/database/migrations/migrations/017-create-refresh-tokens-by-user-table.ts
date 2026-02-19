import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '017',
  name: 'create_refresh_tokens_by_user_table',
  description:
    'Create refresh_tokens_by_user table for efficient revocation by user_id and client_id',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.refresh_tokens_by_user (
        user_id TEXT,
        client_id UUID,
        token_value TEXT,
        PRIMARY KEY ((user_id, client_id), token_value)
      )
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `DROP TABLE IF EXISTS ${config.keyspace}.refresh_tokens_by_user`,
    )
  },
}
