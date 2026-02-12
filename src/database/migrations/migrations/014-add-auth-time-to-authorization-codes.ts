import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '014',
  name: 'add_auth_time_to_authorization_codes',
  description:
    'Add auth_time column to authorization_codes for OIDC auth_time claim',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `ALTER TABLE ${config.keyspace}.authorization_codes ADD auth_time TIMESTAMP`,
    )
  },
  down: async (): Promise<void> => {
    // Cassandra/ScyllaDB does not support dropping columns in older versions.
    // Leaving down as no-op; full schema revert would require table recreation.
  },
}
