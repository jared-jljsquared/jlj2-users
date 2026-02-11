import { getDatabaseClient, isDatabaseEnabledForEnv } from './client.ts'
import { getDatabaseConfig } from './config.ts'

export interface DatabaseHealthStatus {
  isHealthy: boolean
  message: string
  details?: {
    keyspaceExists?: boolean
    hostCount?: number
  }
}

export const checkDatabaseHealth = async (): Promise<DatabaseHealthStatus> => {
  // If database is disabled for this environment, treat as healthy from the app's perspective
  if (!isDatabaseEnabledForEnv()) {
    return {
      isHealthy: true,
      message: 'Database disabled for this environment',
    }
  }

  try {
    const client = getDatabaseClient()
    // Simple query against system.local to verify connectivity
    await client.execute('SELECT now() FROM system.local')

    // Verify that the configured keyspace exists
    const config = getDatabaseConfig()
    const keyspaceQuery =
      'SELECT keyspace_name FROM system_schema.keyspaces WHERE keyspace_name = ?'
    const result = await client.execute(keyspaceQuery, [config.keyspace])
    const keyspaceExists = result.rows.length > 0

    const hostCount = client.hosts.length

    return {
      isHealthy: true,
      message: 'Database connection is healthy',
      details: {
        keyspaceExists,
        hostCount,
      },
    }
  } catch (error) {
    return {
      isHealthy: false,
      message:
        error instanceof Error ? error.message : 'Database health check failed',
    }
  }
}
