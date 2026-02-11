import type { Client } from 'cassandra-driver'
import { getDatabaseConfig } from '../../config.ts'
import type { Migration } from '../types.ts'

export const migration: Migration = {
  version: '011',
  name: 'create_contact_methods_by_id_table',
  description:
    'Create contact_methods_by_id lookup table for efficient contact_id lookups (magic link auth)',
  up: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    const keyspace = config.keyspace

    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${keyspace}.contact_methods_by_id (
        contact_id UUID,
        account_id UUID,
        contact_type TEXT,
        contact_value TEXT,
        is_primary BOOLEAN,
        verified_at TIMESTAMP,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        PRIMARY KEY (contact_id)
      )
    `)

    // Backfill from contact_methods (partitioned by contact_type)
    for (const contactType of ['email', 'phone']) {
      const rows = await client.execute(
        `SELECT account_id, contact_id, contact_type, contact_value, is_primary, verified_at, created_at, updated_at
         FROM ${keyspace}.contact_methods
         WHERE contact_type = ?`,
        [contactType],
      )
      for (const row of rows.rows) {
        await client.execute(
          `INSERT INTO ${keyspace}.contact_methods_by_id
           (contact_id, account_id, contact_type, contact_value, is_primary, verified_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.contact_id,
            row.account_id,
            row.contact_type,
            row.contact_value,
            row.is_primary,
            row.verified_at,
            row.created_at,
            row.updated_at,
          ],
        )
      }
    }
  },
  down: async (client: Client): Promise<void> => {
    const config = getDatabaseConfig()
    await client.execute(
      `DROP TABLE IF EXISTS ${config.keyspace}.contact_methods_by_id`,
    )
  },
}
