import type { Client } from 'cassandra-driver'

export interface Migration {
  version: string
  name: string
  description: string
  up: (client: Client) => Promise<void>
  down: (client: Client) => Promise<void>
}

export interface MigrationHistory {
  version: string
  name: string
  description: string
  applied_at: Date
  rolled_back_at?: Date
}

export interface MigrationStatus {
  version: string
  name: string
  applied: boolean
  appliedAt?: Date
  rolledBackAt?: Date
}
