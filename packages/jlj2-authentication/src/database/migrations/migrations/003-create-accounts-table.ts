import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '003',
  name: 'create_accounts_table',
  description: 'Create accounts table for user account information',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.accounts (
        account_id UUID,
        username TEXT,
        password_digest TEXT,
        password_salt TEXT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        is_active BOOLEAN,
        last_login_at TIMESTAMP,
        PRIMARY KEY (account_id)
      )
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`DROP TABLE IF EXISTS ${config.keyspace}.accounts`)
  },
}
