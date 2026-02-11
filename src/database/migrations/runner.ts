import type { Client } from 'cassandra-driver'
import { log } from '../../plumbing/logger.ts'
import { getDatabaseClient } from '../client.ts'
import { getDatabaseConfig } from '../config.ts'
import type { Migration } from './types.ts'

export const ensureMigrationHistory = async (client: Client): Promise<void> => {
  const config = getDatabaseConfig()

  // First ensure keyspace exists
  await client.execute(`
    CREATE KEYSPACE IF NOT EXISTS ${config.keyspace}
    WITH REPLICATION = {
      'class': 'SimpleStrategy',
      'replication_factor': 1
    }
  `)

  // Then create migration history table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${config.keyspace}.migration_history (
      version TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      applied_at TIMESTAMP,
      rolled_back_at TIMESTAMP
    )
  `)
}

export const getAppliedMigrations = async (
  client: Client,
): Promise<string[]> => {
  const config = getDatabaseConfig()
  // CQL doesn't support IS NULL in WHERE clauses, so we fetch all and filter in code
  const result = await client.execute(
    `SELECT version, rolled_back_at FROM ${config.keyspace}.migration_history`,
  )
  return result.rows
    .filter((row) => row.rolled_back_at == null)
    .map((row) => row.version as string)
}

export interface MigrationHistoryRow {
  version: string
  applied_at: Date
  rolled_back_at: Date | null
}

/**
 * Fetch all migration history rows (including rolled-back) for status display.
 */
export const getAllMigrationHistory = async (
  client: Client,
): Promise<MigrationHistoryRow[]> => {
  const config = getDatabaseConfig()
  const result = await client.execute(
    `SELECT version, applied_at, rolled_back_at FROM ${config.keyspace}.migration_history`,
  )
  return result.rows.map((row) => ({
    version: row.version as string,
    applied_at: row.applied_at as Date,
    rolled_back_at: row.rolled_back_at as Date | null,
  }))
}

export const recordMigration = async (
  client: Client,
  migration: Migration,
  action: 'up' | 'down',
): Promise<void> => {
  const config = getDatabaseConfig()
  const now = new Date()

  if (action === 'up') {
    await client.execute(
      `INSERT INTO ${config.keyspace}.migration_history (version, name, description, applied_at, rolled_back_at)
       VALUES (?, ?, ?, ?, ?)`,
      [migration.version, migration.name, migration.description, now, null],
    )
  } else {
    await client.execute(
      `UPDATE ${config.keyspace}.migration_history
       SET rolled_back_at = ?
       WHERE version = ?`,
      [now, migration.version],
    )
  }
}

export const runMigrations = async (
  migrations: Migration[],
  direction: 'up' | 'down' = 'up',
): Promise<void> => {
  const client = getDatabaseClient()

  await ensureMigrationHistory(client)
  const appliedMigrations = await getAppliedMigrations(client)

  if (direction === 'up') {
    const pendingMigrations = migrations.filter(
      (m) => !appliedMigrations.includes(m.version),
    )

    // Sort by version to ensure correct order
    pendingMigrations.sort((a, b) => a.version.localeCompare(b.version))

    for (const migration of pendingMigrations) {
      log({
        message: 'Running migration',
        version: migration.version,
        name: migration.name,
      })

      try {
        await migration.up(client)
        await recordMigration(client, migration, 'up')
        log({
          message: 'Migration completed',
          version: migration.version,
        })
      } catch (error) {
        log({
          message: 'Migration failed',
          version: migration.version,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    }
  } else {
    // Rollback last migration
    const appliedMigrationsList = migrations
      .filter((m) => appliedMigrations.includes(m.version))
      .sort((a, b) => b.version.localeCompare(a.version))

    if (appliedMigrationsList.length === 0) {
      log('No migrations to rollback')
      return
    }

    const lastMigration = appliedMigrationsList[0]
    log({
      message: 'Rolling back migration',
      version: lastMigration.version,
      name: lastMigration.name,
    })

    try {
      await lastMigration.down(client)
      await recordMigration(client, lastMigration, 'down')
      log({
        message: 'Migration rolled back',
        version: lastMigration.version,
      })
    } catch (error) {
      log({
        message: 'Migration rollback failed',
        version: lastMigration.version,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}
