import { parseNumber } from '../plumbing/parse-number.ts'
import type { DatabaseConfig } from './types/database-config.ts'

export const getDatabaseConfig = (): DatabaseConfig => {
  const rawHosts = process.env.SCYLLA_HOSTS || 'localhost'
  const hosts = rawHosts
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0)

  const port = parseNumber(process.env.SCYLLA_PORT, 9042)
  const keyspace = process.env.SCYLLA_KEYSPACE || 'jlj2_users'
  const localDataCenter = process.env.SCYLLA_LOCAL_DATACENTER || 'datacenter1'
  const username = process.env.SCYLLA_USERNAME
  const password = process.env.SCYLLA_PASSWORD
  const isSslEnabled = process.env.SCYLLA_SSL === 'true'
  const connectTimeoutMs = parseNumber(
    process.env.SCYLLA_CONNECT_TIMEOUT_MS,
    10_000,
  )

  return {
    hosts,
    port,
    keyspace,
    localDataCenter,
    username,
    password,
    isSslEnabled,
    connectTimeoutMs,
  }
}
