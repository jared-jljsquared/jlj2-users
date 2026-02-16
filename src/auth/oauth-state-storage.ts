import type { Client } from 'cassandra-driver'
import { getDatabaseClient } from '../database/client.ts'
import { getDatabaseConfig } from '../database/config.ts'

const OAUTH_STATE_TTL_SECONDS = 10 * 60 // 10 minutes

export interface OAuthStateInput {
  state: string
  returnTo: string
  codeVerifier?: string
}

export interface OAuthState {
  returnTo: string
  codeVerifier?: string
}

const getDbClient = (): Client => getDatabaseClient()
const getKeyspace = (): string => getDatabaseConfig().keyspace

export const storeOAuthState = async (
  input: OAuthStateInput,
): Promise<void> => {
  const client = getDbClient()
  const keyspace = getKeyspace()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + OAUTH_STATE_TTL_SECONDS * 1000)

  await client.execute(
    `INSERT INTO ${keyspace}.oauth_state
     (state, return_to, code_verifier, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)
     USING TTL ${OAUTH_STATE_TTL_SECONDS}`,
    [input.state, input.returnTo, input.codeVerifier ?? null, expiresAt, now],
  )
}

export const consumeOAuthState = async (
  state: string,
): Promise<OAuthState | null> => {
  const client = getDbClient()
  const keyspace = getKeyspace()

  const selectResult = await client.execute(
    `SELECT return_to, code_verifier, expires_at FROM ${keyspace}.oauth_state WHERE state = ?`,
    [state],
  )

  if (selectResult.rows.length === 0) {
    return null
  }

  const row = selectResult.rows[0]
  const expiresAt = row.expires_at as Date
  const now = new Date()
  if (expiresAt < now) {
    await client.execute(
      `DELETE FROM ${keyspace}.oauth_state WHERE state = ?`,
      [state],
    )
    return null
  }

  const deleteResult = await client.execute(
    `DELETE FROM ${keyspace}.oauth_state WHERE state = ? IF EXISTS`,
    [state],
  )

  if (!deleteResult.wasApplied()) {
    return null
  }

  return {
    returnTo: row.return_to as string,
    codeVerifier: (row.code_verifier as string) || undefined,
  }
}
