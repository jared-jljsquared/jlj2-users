import { getDatabaseClient } from '../client.ts'
import { ensureMigrationHistory, getAllMigrationHistory } from './runner.ts'
import type { Migration, MigrationStatus } from './types.ts'

export const getMigrationStatus = async (
  migrations: Migration[],
): Promise<MigrationStatus[]> => {
  const client = getDatabaseClient()
  await ensureMigrationHistory(client)
  const historyRows = await getAllMigrationHistory(client)
  const historyByVersion = new Map(
    historyRows.map((row) => [
      row.version,
      {
        applied_at: row.applied_at,
        rolled_back_at: row.rolled_back_at,
      },
    ]),
  )

  const statusList: MigrationStatus[] = []

  for (const migration of migrations) {
    const row = historyByVersion.get(migration.version)
    const appliedAt = row?.applied_at
    const rolledBackAt = row?.rolled_back_at ?? undefined
    const isApplied = row != null && row.rolled_back_at == null

    statusList.push({
      version: migration.version,
      name: migration.name,
      applied: isApplied,
      appliedAt,
      rolledBackAt,
    })
  }

  return statusList
}
