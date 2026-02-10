// Import all migrations
import { migration as migration001 } from './migrations/001-create-keyspace.ts'
import { migration as migration002 } from './migrations/002-create-migration-history.ts'
import { migration as migration003 } from './migrations/003-create-accounts-table.ts'
import { migration as migration004 } from './migrations/004-create-contact-methods-table.ts'
import { migration as migration005 } from './migrations/005-create-magic-link-tokens-table.ts'
import { migration as migration006 } from './migrations/006-create-identities-table.ts'
import { migration as migration007 } from './migrations/007-create-identity-accounts-table.ts'
import { migration as migration008 } from './migrations/008-create-account-identities-table.ts'
import { migration as migration009 } from './migrations/009-create-provider-accounts-table.ts'
import type { Migration } from './types.ts'

export const loadMigrations = (): Migration[] => {
  return [
    migration001,
    migration002,
    migration003,
    migration004,
    migration005,
    migration006,
    migration007,
    migration008,
    migration009,
  ].sort((a, b) => a.version.localeCompare(b.version))
}
