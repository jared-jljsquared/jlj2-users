# Step 6: Database Migrations

## Overview
Implement database migration system for creating and managing database schema (keyspaces, tables, indexes). Support versioned migrations and rollback capabilities. This step ensures database schema can be versioned, tracked, and applied consistently across environments.

## Sub-steps

### 6.1 Migration System Architecture
Design migration system:
- Migration file structure and naming convention
- Migration metadata storage (migration history table)
- Migration version tracking
- Up and down migration support

### 6.2 Keyspace Creation
Implement keyspace creation:
- Create keyspace with appropriate replication strategy
- Support for SimpleStrategy (development) and NetworkTopologyStrategy (production)
- Keyspace existence checks
- Keyspace creation in migrations

### 6.3 Table Migrations
Implement table creation and modification:
- Create table migrations
- Alter table migrations (add/remove columns, modify types)
- Drop table migrations
- Index creation and management

### 6.4 Migration Runner
Implement migration execution:
- Run pending migrations
- Rollback migrations
- List migration status
- Migration validation (check for conflicts)

### 6.5 Migration Metadata
Track migration history:
- Create migration_history table
- Record migration execution timestamps
- Track migration status (applied, rolled back)
- Prevent duplicate migrations

### 6.6 CLI/Commands
Create migration commands:
- `migrate up` - Apply pending migrations
- `migrate down` - Rollback last migration
- `migrate status` - Show migration status
- `migrate create` - Generate new migration template

### 6.7 Initial Schema Migrations
Create initial schema migrations:
- Users table migration
- Clients table migration
- OAuth authorization codes table
- Tokens table (refresh tokens, access tokens)
- Migration history table

## Code Samples

### Example: Migration File Structure
```typescript
// migrations/001_create_keyspace.ts
import type { Client } from 'cassandra-driver'

export const up = async (client: Client): Promise<void> => {
  await client.execute(`
    CREATE KEYSPACE IF NOT EXISTS jlj2_users
    WITH REPLICATION = {
      'class': 'SimpleStrategy',
      'replication_factor': 1
    }
  `)
}

export const down = async (client: Client): Promise<void> => {
  await client.execute('DROP KEYSPACE IF EXISTS jlj2_users')
}

export const metadata = {
  version: '001',
  name: 'create_keyspace',
  description: 'Create jlj2_users keyspace',
}
```

### Example: Table Migration
```typescript
// migrations/002_create_users_table.ts
import type { Client } from 'cassandra-driver'

export const up = async (client: Client): Promise<void> => {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS jlj2_users.users (
      id UUID PRIMARY KEY,
      email TEXT,
      email_verified BOOLEAN,
      password_hash TEXT,
      name TEXT,
      given_name TEXT,
      family_name TEXT,
      picture TEXT,
      created_at TIMESTAMP,
      updated_at TIMESTAMP
    )
  `)
  
  // Create index for email lookups
  await client.execute(`
    CREATE INDEX IF NOT EXISTS users_email_idx
    ON jlj2_users.users (email)
  `)
}

export const down = async (client: Client): Promise<void> => {
  await client.execute('DROP INDEX IF EXISTS jlj2_users.users_email_idx')
  await client.execute('DROP TABLE IF EXISTS jlj2_users.users')
}

export const metadata = {
  version: '002',
  name: 'create_users_table',
  description: 'Create users table with email index',
}
```

### Example: Migration Runner
```typescript
// src/database/migrations/runner.ts
import type { Client } from 'cassandra-driver'
import { getDatabaseClient } from '../client.ts'
import { log } from '../../plumbing/logger.ts'

export interface Migration {
  version: string
  name: string
  description: string
  up: (client: Client) => Promise<void>
  down: (client: Client) => Promise<void>
}

export const ensureMigrationHistory = async (client: Client): Promise<void> => {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS jlj2_users.migration_history (
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
  const result = await client.execute(
    'SELECT version FROM jlj2_users.migration_history WHERE rolled_back_at IS NULL ALLOW FILTERING',
  )
  return result.rows.map((row) => row.version as string)
}

export const recordMigration = async (
  client: Client,
  migration: Migration,
  action: 'up' | 'down',
): Promise<void> => {
  const now = new Date()
  
  if (action === 'up') {
    await client.execute(
      `INSERT INTO jlj2_users.migration_history (version, name, description, applied_at)
       VALUES (?, ?, ?, ?)`,
      [migration.version, migration.name, migration.description, now],
    )
  } else {
    await client.execute(
      `UPDATE jlj2_users.migration_history
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
```

### Example: Migration Status
```typescript
// src/database/migrations/status.ts
import type { Client } from 'cassandra-driver'
import { getDatabaseClient } from '../client.ts'
import { getAppliedMigrations } from './runner.ts'
import type { Migration } from './runner.ts'

export interface MigrationStatus {
  version: string
  name: string
  applied: boolean
  appliedAt?: Date
}

export const getMigrationStatus = async (
  migrations: Migration[],
): Promise<MigrationStatus[]> => {
  const client = getDatabaseClient()
  const appliedMigrations = await getAppliedMigrations(client)
  
  const statusList: MigrationStatus[] = []
  
  for (const migration of migrations) {
    const isApplied = appliedMigrations.includes(migration.version)
    let appliedAt: Date | undefined
    
    if (isApplied) {
      const result = await client.execute(
        'SELECT applied_at FROM jlj2_users.migration_history WHERE version = ?',
        [migration.version],
      )
      if (result.rows.length > 0) {
        appliedAt = result.rows[0].applied_at as Date
      }
    }
    
    statusList.push({
      version: migration.version,
      name: migration.name,
      applied: isApplied,
      appliedAt,
    })
  }
  
  return statusList
}
```

### Example: CLI Command
```typescript
// src/database/migrations/cli.ts
import { runMigrations, getMigrationStatus } from './runner.ts'
import { loadMigrations } from './loader.ts' // Helper to load migration files

const command = process.argv[2]

const main = async () => {
  const migrations = await loadMigrations()
  
  switch (command) {
    case 'up':
      await runMigrations(migrations, 'up')
      break
    case 'down':
      await runMigrations(migrations, 'down')
      break
    case 'status':
      const status = await getMigrationStatus(migrations)
      console.table(status)
      break
    default:
      console.log('Usage: migrate [up|down|status]')
      process.exit(1)
  }
}

main().catch((error) => {
  console.error('Migration error:', error)
  process.exit(1)
})
```

## Testing

### Unit Tests (Vitest)
- **Migration Runner**: Test migration execution
  - Test applying pending migrations
  - Test rolling back migrations
  - Test migration history tracking
  - Test duplicate migration prevention
  
- **Migration Status**: Test migration status reporting
  - Test status for applied migrations
  - Test status for pending migrations
  - Test status with timestamps

### Integration Tests
- **Schema Creation**: Test actual schema creation in ScyllaDB
  - Test keyspace creation
  - Test table creation
  - Test index creation
  - Test migration rollback

### Test Examples
```typescript
// src/database/migrations/__tests__/runner.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { runMigrations, getAppliedMigrations } from '../runner.ts'
import type { Migration } from '../runner.ts'

describe('Migration Runner', () => {
  it('should apply pending migrations', async () => {
    const migrations: Migration[] = [
      {
        version: '001',
        name: 'test_migration',
        description: 'Test migration',
        up: async (client) => {
          await client.execute('CREATE TABLE IF NOT EXISTS test (id UUID PRIMARY KEY)')
        },
        down: async (client) => {
          await client.execute('DROP TABLE IF EXISTS test')
        },
      },
    ]
    
    await runMigrations(migrations, 'up')
    const applied = await getAppliedMigrations(client)
    expect(applied).toContain('001')
  })
})
```

## Success Criteria
- [ ] Migration system can create and manage keyspaces
- [ ] Migration system can create and modify tables
- [ ] Migration history is tracked in database
- [ ] Migrations can be applied (up) and rolled back (down)
- [ ] Migration status can be queried
- [ ] CLI commands work for migration operations
- [ ] Initial schema migrations are created (users, clients, tokens, etc.)
- [ ] All unit tests for migrations pass (>95% coverage)
- [ ] Integration tests verify actual schema creation

