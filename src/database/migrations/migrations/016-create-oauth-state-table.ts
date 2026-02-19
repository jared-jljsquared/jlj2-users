import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '016',
  name: 'create_oauth_state_table',
  description:
    'Create oauth_state table for OAuth CSRF state and PKCE code_verifier storage',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.oauth_state (
        state TEXT,
        return_to TEXT,
        code_verifier TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP,
        PRIMARY KEY (state)
      )
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`DROP TABLE IF EXISTS ${config.keyspace}.oauth_state`)
  },
}
