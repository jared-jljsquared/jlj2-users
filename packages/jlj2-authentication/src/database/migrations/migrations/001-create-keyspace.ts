import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '001',
  name: 'create_keyspace',
  description: 'Create jlj2_users keyspace with SimpleStrategy replication',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`
      CREATE KEYSPACE IF NOT EXISTS ${config.keyspace}
      WITH REPLICATION = {
        'class': 'SimpleStrategy',
        'replication_factor': 1
      }
    `)
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(`DROP KEYSPACE IF EXISTS ${config.keyspace}`)
  },
}
