#!/usr/bin/env node
import 'dotenv/config'
import { initializeDatabase, shutdownDatabase } from '../client.ts'
import { loadMigrations } from './loader.ts'
import { runMigrations } from './runner.ts'
import { getMigrationStatus } from './status.ts'

const command = process.argv[2]

const main = async (): Promise<void> => {
  try {
    // Connect without keyspace to allow migrations to create it
    await initializeDatabase({ skipKeyspace: true })

    const migrations = loadMigrations()

    switch (command) {
      case 'up': {
        await runMigrations(migrations, 'up')
        console.log('Migrations applied successfully')
        break
      }
      case 'down': {
        await runMigrations(migrations, 'down')
        console.log('Migration rolled back successfully')
        break
      }
      case 'status': {
        const status = await getMigrationStatus(migrations)
        console.table(
          status.map((s) => ({
            version: s.version,
            name: s.name,
            applied: s.applied ? '✓' : '✗',
            appliedAt: s.appliedAt?.toISOString() ?? '-',
            rolledBackAt: s.rolledBackAt?.toISOString() ?? '-',
          })),
        )
        break
      }
      default: {
        console.log('Usage: migrate [up|down|status]')
        console.log('  up     - Apply pending migrations')
        console.log('  down   - Rollback last migration')
        console.log('  status - Show migration status')
        process.exit(1)
      }
    }
  } catch (error) {
    console.error('Migration error:', error)
    process.exit(1)
  } finally {
    await shutdownDatabase()
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
