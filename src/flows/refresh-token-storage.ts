import { randomBytes } from 'node:crypto'
import type { Client } from 'cassandra-driver'
import { getDatabaseClient } from '../database/client.ts'
import { getDatabaseConfig } from '../database/config.ts'
import type {
  RefreshToken,
  RefreshTokenInput,
} from '../database/types/refresh-token.ts'
import { log } from '../plumbing/logger.ts'

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
  const authTime =
    input.auth_time !== undefined ? new Date(input.auth_time * 1000) : null

  await client.execute(
    `INSERT INTO ${keyspace}.refresh_tokens
     (token_value, client_id, user_id, scopes, expires_at, created_at, auth_time)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     USING TTL ${REFRESH_TOKEN_TTL_SECONDS}`,
    [
      token,
      input.client_id,
      input.user_id,
      input.scopes,
      expiresAt,
      now,
      authTime,
    ],
  )

  await client.execute(
    `INSERT INTO ${keyspace}.refresh_tokens_by_user
     (user_id, client_id, token_value)
     VALUES (?, ?, ?)
     USING TTL ${REFRESH_TOKEN_TTL_SECONDS}`,
    [input.user_id, input.client_id, token],
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
  const authTimeRaw = row.auth_time as Date | null | undefined
  const authTime =
    authTimeRaw instanceof Date
      ? Math.floor(authTimeRaw.getTime() / 1000)
      : null

  const stored: RefreshToken = {
    token: row.token_value as string,
    client_id: String(row.client_id),
    user_id: row.user_id as string,
    scopes: (row.scopes ?? []) as string[],
    expires_at: row.expires_at as Date,
    created_at: row.created_at as Date,
    auth_time: authTime,
  }

  if (stored.client_id !== clientId) {
    log({
      message: 'Refresh token client mismatch (security event)',
      tokenClientId: stored.client_id,
      requestClientId: clientId,
      userId: stored.user_id,
    })
    return null
  }

  const now = new Date()
  if (stored.expires_at < now) {
    await client.execute(
      `DELETE FROM ${keyspace}.refresh_tokens WHERE token_value = ?`,
      [token],
    )
    await client.execute(
      `DELETE FROM ${keyspace}.refresh_tokens_by_user
       WHERE user_id = ? AND client_id = ? AND token_value = ?`,
      [stored.user_id, stored.client_id, token],
    )
    return null
  }

  const deleteResult = await client.execute(
    `DELETE FROM ${keyspace}.refresh_tokens WHERE token_value = ? IF EXISTS`,
    [token],
  )

  if (!deleteResult.wasApplied()) {
    log({
      message: 'Refresh token already used (replay attempt)',
      userId: stored.user_id,
      clientId: stored.client_id,
    })
    return null
  }

  await client.execute(
    `DELETE FROM ${keyspace}.refresh_tokens_by_user
     WHERE user_id = ? AND client_id = ? AND token_value = ?`,
    [stored.user_id, stored.client_id, token],
  )

  return stored
}

/**
 * Revoke a single refresh token by token value.
 * Verifies client_id matches before revoking.
 * Returns true if token was found and revoked, false otherwise.
 * Per RFC 7009, callers should return 200 even when token was invalid.
 */
export const revokeRefreshToken = async (
  token: string,
  clientId: string,
): Promise<boolean> => {
  const client = getDbClient()
  const keyspace = getKeyspace()

  const selectResult = await client.execute(
    `SELECT * FROM ${keyspace}.refresh_tokens WHERE token_value = ?`,
    [token],
  )

  if (selectResult.rows.length === 0) {
    return false
  }

  const row = selectResult.rows[0]
  const storedClientId = String(row.client_id)
  const userId = row.user_id as string

  if (storedClientId !== clientId) {
    return false
  }

  await client.execute(
    `DELETE FROM ${keyspace}.refresh_tokens WHERE token_value = ?`,
    [token],
  )
  await client.execute(
    `DELETE FROM ${keyspace}.refresh_tokens_by_user
     WHERE user_id = ? AND client_id = ? AND token_value = ?`,
    [userId, clientId, token],
  )

  return true
}
