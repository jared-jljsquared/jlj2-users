import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '006',
  name: 'create_identities_table',
  description:
    'Create identities table for storing identity information (name, country, date of birth)',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${config.keyspace}.identities (
        identity_id UUID PRIMARY KEY,
        name TEXT,
        country_of_origin TEXT,
        date_of_birth DATE,
        date_of_birth_verified BOOLEAN,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
      )
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`DROP TABLE IF EXISTS ${config.keyspace}.identities`)
  },
}
