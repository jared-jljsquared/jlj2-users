export interface DatabaseConfig {
  hosts: string[]
  port: number
  keyspace: string
  localDataCenter: string
  username?: string
  password?: string
  isSslEnabled: boolean
  connectTimeoutMs: number
  poolSize?: number
}
