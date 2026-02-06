import type { Client } from 'cassandra-driver'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAppliedMigrations,
  recordMigration,
  runMigrations,
} from '../runner.ts'
import type { Migration } from '../types.ts'

// Mock the database client and dependencies
vi.mock('../../client.ts', () => ({
  getDatabaseClient: vi.fn(() => mockClient),
  isDatabaseEnabledForEnv: vi.fn(() => true),
}))

vi.mock('../../config.ts', () => ({
  getDatabaseConfig: vi.fn(() => ({
    keyspace: 'jlj2_users',
    hosts: ['localhost'],
    port: 9042,
    localDataCenter: 'datacenter1',
  })),
}))

vi.mock('../../../plumbing/logger.ts', () => ({
  log: vi.fn(),
}))

const mockClient = {
  execute: vi.fn(),
} as unknown as Client

describe('Migration Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock successful execution by default
    mockClient.execute = vi.fn().mockResolvedValue({
      rows: [],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getAppliedMigrations', () => {
    it('should return empty array when no migrations are applied', async () => {
      const applied = await getAppliedMigrations(mockClient)
      expect(applied).toEqual([])
    })

    it('should return list of applied migration versions', async () => {
      mockClient.execute = vi.fn().mockResolvedValue({
        rows: [
          { version: '001', rolled_back_at: null },
          { version: '002', rolled_back_at: null },
        ],
      })

      const applied = await getAppliedMigrations(mockClient)
      expect(applied).toEqual(['001', '002'])
    })
  })

  describe('recordMigration', () => {
    it('should record migration as applied', async () => {
      const migration: Migration = {
        version: '001',
        name: 'test_migration',
        description: 'Test migration',
        up: vi.fn(),
        down: vi.fn(),
      }

      await recordMigration(mockClient, migration, 'up')

      expect(mockClient.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        ['001', 'test_migration', 'Test migration', expect.any(Date)],
      )
    })

    it('should record migration as rolled back', async () => {
      const migration: Migration = {
        version: '001',
        name: 'test_migration',
        description: 'Test migration',
        up: vi.fn(),
        down: vi.fn(),
      }

      await recordMigration(mockClient, migration, 'down')

      expect(mockClient.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        [expect.any(Date), '001'],
      )
    })
  })

  describe('runMigrations', () => {
    it('should apply pending migrations in order', async () => {
      const migrations: Migration[] = [
        {
          version: '001',
          name: 'first',
          description: 'First migration',
          up: vi.fn().mockResolvedValue(undefined),
          down: vi.fn(),
        },
        {
          version: '002',
          name: 'second',
          description: 'Second migration',
          up: vi.fn().mockResolvedValue(undefined),
          down: vi.fn(),
        },
      ]

      // Mock: ensureMigrationHistory calls (keyspace + table), then getAppliedMigrations, then recordMigration calls
      mockClient.execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // keyspace creation
        .mockResolvedValueOnce({ rows: [] }) // table creation
        .mockResolvedValueOnce({ rows: [] }) // getAppliedMigrations - no applied migrations
        .mockResolvedValueOnce({ rows: [] }) // recordMigration for 001
        .mockResolvedValueOnce({ rows: [] }) // recordMigration for 002

      await runMigrations(migrations, 'up')

      expect(migrations[0].up).toHaveBeenCalled()
      expect(migrations[1].up).toHaveBeenCalled()
    })

    it('should skip already applied migrations', async () => {
      const migrations: Migration[] = [
        {
          version: '001',
          name: 'first',
          description: 'First migration',
          up: vi.fn(),
          down: vi.fn(),
        },
        {
          version: '002',
          name: 'second',
          description: 'Second migration',
          up: vi.fn().mockResolvedValue(undefined),
          down: vi.fn(),
        },
      ]

      // Mock: ensureMigrationHistory calls (keyspace + table), then getAppliedMigrations with 001 applied, then recordMigration for 002
      mockClient.execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // keyspace creation
        .mockResolvedValueOnce({ rows: [] }) // table creation
        .mockResolvedValueOnce({
          rows: [{ version: '001', rolled_back_at: null }],
        }) // getAppliedMigrations - 001 is applied
        .mockResolvedValueOnce({ rows: [] }) // recordMigration for 002

      await runMigrations(migrations, 'up')

      expect(migrations[0].up).not.toHaveBeenCalled()
      expect(migrations[1].up).toHaveBeenCalled()
    })
  })
})
