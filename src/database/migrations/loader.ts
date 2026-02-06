// Import all migrations
import { migration as migration001 } from './migrations/001-create-keyspace.ts'
import { migration as migration002 } from './migrations/002-create-migration-history.ts'
import { migration as migration003 } from './migrations/003-create-accounts-table.ts'
import { migration as migration004 } from './migrations/004-create-contact-methods-table.ts'
import type { Migration } from './types.ts'

export const loadMigrations = (): Migration[] => {
  return [migration001, migration002, migration003, migration004].sort((a, b) =>
    a.version.localeCompare(b.version),
  )
}
