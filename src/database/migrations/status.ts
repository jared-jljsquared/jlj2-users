import type { Client } from 'cassandra-driver'
import { getDatabaseClient } from '../client.ts'
import { getDatabaseConfig } from '../config.ts'
import { getAppliedMigrations } from './runner.ts'
import type { Migration, MigrationStatus } from './types.ts'

export const getMigrationStatus = async (
  migrations: Migration[],
): Promise<MigrationStatus[]> => {
  const client = getDatabaseClient()
  const config = getDatabaseConfig()
  const appliedMigrations = await getAppliedMigrations(client)

  const statusList: MigrationStatus[] = []

  for (const migration of migrations) {
    const isApplied = appliedMigrations.includes(migration.version)
    let appliedAt: Date | undefined
    let rolledBackAt: Date | undefined

    if (isApplied) {
      const result = await client.execute(
        `SELECT applied_at, rolled_back_at FROM ${config.keyspace}.migration_history WHERE version = ?`,
        [migration.version],
      )
      if (result.rows.length > 0) {
        appliedAt = result.rows[0].applied_at as Date
        rolledBackAt = result.rows[0].rolled_back_at as Date | undefined
      }
    }

    statusList.push({
      version: migration.version,
      name: migration.name,
      applied: isApplied && !rolledBackAt,
      appliedAt,
      rolledBackAt,
    })
  }

  return statusList
}
