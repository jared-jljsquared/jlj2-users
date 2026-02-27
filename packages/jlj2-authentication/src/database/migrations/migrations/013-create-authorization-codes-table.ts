import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '013',
  name: 'create_authorization_codes_table',
  description:
    'Create authorization_codes table for OAuth 2.0 authorization code flow',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.authorization_codes (
        code TEXT,
        client_id UUID,
        redirect_uri TEXT,
        scopes LIST<TEXT>,
        user_id TEXT,
        code_challenge TEXT,
        code_challenge_method TEXT,
        nonce TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP,
        PRIMARY KEY (code)
      )
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `DROP TABLE IF EXISTS ${config.keyspace}.authorization_codes`,
    )
  },
}
