import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '018',
  name: 'add_auth_time_to_refresh_tokens',
  description:
    'Add auth_time column to refresh_tokens for OIDC auth_time claim propagation',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `ALTER TABLE ${config.keyspace}.refresh_tokens ADD auth_time TIMESTAMP`,
    )
  },
  down: async (): Promise<void> => {
    // Cassandra/ScyllaDB does not support dropping columns in older versions.
    // Leaving down as no-op; full schema revert would require table recreation.
  },
}
