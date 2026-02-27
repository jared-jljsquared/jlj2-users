import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '015',
  name: 'create_refresh_tokens_table',
  description: 'Create refresh_tokens table for OAuth 2.0 refresh token flow',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.refresh_tokens (
        token_value TEXT,
        client_id UUID,
        user_id TEXT,
        scopes LIST<TEXT>,
        expires_at TIMESTAMP,
        created_at TIMESTAMP,
        PRIMARY KEY (token_value)
      )
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `DROP TABLE IF EXISTS ${config.keyspace}.refresh_tokens`,
    )
  },
}
