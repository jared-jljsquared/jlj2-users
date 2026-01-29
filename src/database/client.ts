import { Client, type ClientOptions } from 'cassandra-driver'
import { log } from '../plumbing/logger.ts'
import { getDatabaseConfig } from './config.ts'

type CassandraClient = Client

let databaseClient: CassandraClient | null = null

export const isDatabaseEnabledForEnv = (): boolean => {
  const isExplicitlyDisabled = process.env.SCYLLA_DISABLED === 'true'
  if (isExplicitlyDisabled) {
    return false
  }

  const nodeEnv = process.env.NODE_ENV

  // By default, avoid opening real DB connections during tests
  // unless explicitly enabled via SCYLLA_ENABLE_IN_TESTS.
  if (nodeEnv === 'test' && process.env.SCYLLA_ENABLE_IN_TESTS !== 'true') {
    return false
  }

  return true
}

const createCassandraClient = (): CassandraClient => {
  const config = getDatabaseConfig()
  const contactPoints = config.hosts.map((host) => `${host}:${config.port}`)

  const clientOptions: ClientOptions = {
    contactPoints,
    localDataCenter: config.localDataCenter,
    keyspace: config.keyspace,
    credentials:
      config.username && config.password
        ? {
            username: config.username,
            password: config.password,
          }
        : undefined,
  }

  const client = new Client(clientOptions)

  return client
}

export const getDatabaseClient = (): CassandraClient => {
  if (!databaseClient) {
    throw new Error(
      'Database client not initialized. Call initializeDatabase() first.',
    )
  }

  return databaseClient
}

export const initializeDatabase = async (): Promise<void> => {
  if (!isDatabaseEnabledForEnv()) {
    log('Database initialization skipped for current environment')
    return
  }

  if (databaseClient) {
    log('Database client already initialized')
    return
  }

  const maxRetriesRaw = process.env.SCYLLA_CONNECT_RETRIES
  const retryDelayRaw = process.env.SCYLLA_CONNECT_RETRY_DELAY_MS

  const maxRetries =
    maxRetriesRaw && Number.isFinite(Number(maxRetriesRaw))
      ? Number(maxRetriesRaw)
      : 3
  const retryDelayMs =
    retryDelayRaw && Number.isFinite(Number(retryDelayRaw))
      ? Number(retryDelayRaw)
      : 1_000

  let attempt = 0

  while (true) {
    attempt += 1

    try {
      databaseClient = createCassandraClient()
      await databaseClient.connect()

      const config = getDatabaseConfig()
      const contactPoints = config.hosts.map((host) => `${host}:${config.port}`)

      log({
        message: 'Database connection established',
        hosts: contactPoints,
        keyspace: config.keyspace,
        localDataCenter: config.localDataCenter,
        attempt,
      })

      break
    } catch (error) {
      log({
        message: 'Failed to connect to database',
        error: error instanceof Error ? error.message : String(error),
        attempt,
      })
      databaseClient = null

      if (attempt >= maxRetries) {
        throw error instanceof Error
          ? error
          : new Error(String(error ?? 'Unknown database connection error'))
      }

      await new Promise((resolve) => {
        setTimeout(resolve, retryDelayMs)
      })
    }
  }
}

export const shutdownDatabase = async (): Promise<void> => {
  if (!databaseClient) {
    return
  }

  if (!isDatabaseEnabledForEnv()) {
    databaseClient = null
    return
  }

  try {
    await databaseClient.shutdown()
    log('Database connection closed')
  } catch (error) {
    log({
      message: 'Error while closing database connection',
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    databaseClient = null
  }
}
