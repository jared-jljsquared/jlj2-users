import { randomBytes } from 'node:crypto'
import type { Client } from 'cassandra-driver'
import { getDatabaseClient } from '../database/client.ts'
import { getDatabaseConfig } from '../database/config.ts'
import type {
  RefreshToken,
  RefreshTokenInput,
} from '../database/types/refresh-token.ts'

const REFRESH_TOKEN_EXPIRY_DAYS = 30
const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60

const getDbClient = (): Client => getDatabaseClient()
const getKeyspace = (): string => getDatabaseConfig().keyspace

export const generateRefreshToken = async (
  input: RefreshTokenInput,
): Promise<string> => {
  const client = getDbClient()
  const keyspace = getKeyspace()
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(
    now.getTime() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  )

  await client.execute(
    `INSERT INTO ${keyspace}.refresh_tokens
     (token_value, client_id, user_id, scopes, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     USING TTL ${REFRESH_TOKEN_TTL_SECONDS}`,
    [token, input.client_id, input.user_id, input.scopes, expiresAt, now],
  )

  return token
}

export const consumeRefreshToken = async (
  token: string,
  clientId: string,
): Promise<RefreshToken | null> => {
  const client = getDbClient()
  const keyspace = getKeyspace()

  const selectResult = await client.execute(
    `SELECT * FROM ${keyspace}.refresh_tokens WHERE token_value = ?`,
    [token],
  )

  if (selectResult.rows.length === 0) {
    return null
  }

  const row = selectResult.rows[0]
  const stored: RefreshToken = {
    token: row.token_value as string,
    client_id: String(row.client_id),
    user_id: row.user_id as string,
    scopes: (row.scopes ?? []) as string[],
    expires_at: row.expires_at as Date,
    created_at: row.created_at as Date,
  }

  if (stored.client_id !== clientId) {
    return null
  }

  const now = new Date()
  if (stored.expires_at < now) {
    await client.execute(
      `DELETE FROM ${keyspace}.refresh_tokens WHERE token_value = ?`,
      [token],
    )
    return null
  }

  const deleteResult = await client.execute(
    `DELETE FROM ${keyspace}.refresh_tokens WHERE token_value = ? IF EXISTS`,
    [token],
  )

  if (!deleteResult.wasApplied()) {
    return null
  }

  return stored
}
