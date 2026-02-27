import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '012',
  name: 'create_clients_table',
  description:
    'Create clients table for OAuth 2.0 client registration and credentials',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.clients (
        client_id UUID,
        client_secret_hash TEXT,
        client_name TEXT,
        redirect_uris LIST<TEXT>,
        grant_types LIST<TEXT>,
        response_types LIST<TEXT>,
        scopes LIST<TEXT>,
        token_endpoint_auth_method TEXT,
        is_active BOOLEAN,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        PRIMARY KEY (client_id)
      )
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`DROP TABLE IF EXISTS ${config.keyspace}.clients`)
  },
}
