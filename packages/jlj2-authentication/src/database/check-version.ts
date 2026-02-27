#!/usr/bin/env node
import 'dotenv/config'
import {
  getDatabaseClient,
  initializeDatabase,
  shutdownDatabase,
} from './client.ts'

const main = async (): Promise<void> => {
  try {
    await initializeDatabase()
    const client = getDatabaseClient()

    // Check version
    const versionResult = await client.execute(
      'SELECT release_version FROM system.local',
    )
    if (versionResult.rows.length > 0) {
      console.log('Database version:', versionResult.rows[0].release_version)
    }

    // Try to describe the keyspace
    const keyspaceResult = await client.execute(
      `SELECT keyspace_name FROM system_schema.keyspaces WHERE keyspace_name = 'jlj2_users'`,
    )
    console.log('Keyspace exists:', keyspaceResult.rows.length > 0)

    // Try a simple query to test syntax
    try {
      await client.execute(
        `CREATE TABLE IF NOT EXISTS jlj2_users.test_table (id UUID PRIMARY KEY, name TEXT)`,
      )
      console.log('Simple CREATE TABLE works')
      await client.execute(`DROP TABLE IF EXISTS jlj2_users.test_table`)
    } catch (error) {
      console.error('Simple CREATE TABLE failed:', error)
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await shutdownDatabase()
  }
}

main().catch(console.error)
