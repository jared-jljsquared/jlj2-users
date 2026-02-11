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

const createCassandraClient = (options?: {
  skipKeyspace?: boolean
}): CassandraClient => {
  const config = getDatabaseConfig()
  const contactPoints = config.hosts.map((host) => `${host}:${config.port}`)

  const clientOptions: ClientOptions = {
    contactPoints,
    localDataCenter: config.localDataCenter,
    // Only set keyspace if not skipping (for migrations, we connect without keyspace first)
    keyspace: options?.skipKeyspace ? undefined : config.keyspace,
    credentials:
      config.username && config.password
        ? {
            username: config.username,
            password: config.password,
          }
        : undefined,
    sslOptions: config.isSslEnabled
      ? {
          // Enable SSL/TLS connection
          // rejectUnauthorized defaults to true for security
          rejectUnauthorized: true,
        }
      : undefined,
    socketOptions: {
      connectTimeout: config.connectTimeoutMs,
    },
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

export const initializeDatabase = async (options?: {
  skipKeyspace?: boolean
}): Promise<void> => {
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
      databaseClient = createCassandraClient({
        skipKeyspace: options?.skipKeyspace,
      })
      await databaseClient.connect()

      const config = getDatabaseConfig()
      const contactPoints = config.hosts.map((host) => `${host}:${config.port}`)

      log({
        message: 'Database connection established',
        hosts: contactPoints,
        keyspace: options?.skipKeyspace
          ? '(none - for migrations)'
          : config.keyspace,
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
      const failedClient = databaseClient
      databaseClient = null
      if (failedClient) {
        try {
          await failedClient.shutdown()
        } catch (shutdownError) {
          log({
            message: 'Error shutting down failed client',
            error:
              shutdownError instanceof Error
                ? shutdownError.message
                : String(shutdownError),
          })
        }
      }

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
  const client = databaseClient
  databaseClient = null

  if (!client) {
    return
  }

  try {
    await client.shutdown()
    log('Database connection closed')
  } catch (error) {
    log({
      message: 'Error while closing database connection',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
