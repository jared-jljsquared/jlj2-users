import { randomBytes } from 'node:crypto'
import type { Client } from 'cassandra-driver'
import { getDatabaseClient } from '../database/client.ts'
import { getDatabaseConfig } from '../database/config.ts'
import type {
  AuthorizationCode,
  AuthorizationCodeInput,
} from '../database/types/authorization-code.ts'

const CODE_EXPIRY_MINUTES = 10

const getDbClient = (): Client => getDatabaseClient()
const getKeyspace = (): string => getDatabaseConfig().keyspace

export const generateAuthorizationCode = async (
  input: AuthorizationCodeInput,
): Promise<string> => {
  const client = getDbClient()
  const keyspace = getKeyspace()
  const code = randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + CODE_EXPIRY_MINUTES * 60 * 1000)

  await client.execute(
    `INSERT INTO ${keyspace}.authorization_codes
     (code, client_id, redirect_uri, scopes, user_id, code_challenge, code_challenge_method, nonce, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      input.client_id,
      input.redirect_uri,
      input.scopes,
      input.user_id,
      input.code_challenge ?? null,
      input.code_challenge_method ?? null,
      input.nonce ?? null,
      expiresAt,
      now,
    ],
  )

  return code
}

export const consumeAuthorizationCode = async (
  code: string,
  clientId: string,
  redirectUri: string,
): Promise<AuthorizationCode | null> => {
  const client = getDbClient()
  const keyspace = getKeyspace()

  const result = await client.execute(
    `SELECT * FROM ${keyspace}.authorization_codes WHERE code = ?`,
    [code],
  )

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  const stored: AuthorizationCode = {
    code: row.code as string,
    client_id: String(row.client_id),
    redirect_uri: row.redirect_uri as string,
    scopes: (row.scopes ?? []) as string[],
    user_id: row.user_id as string,
    code_challenge: (row.code_challenge as string | null) ?? null,
    code_challenge_method: (row.code_challenge_method as string | null) ?? null,
    nonce: (row.nonce as string | null) ?? null,
    expires_at: row.expires_at as Date,
    created_at: row.created_at as Date,
  }

  if (stored.client_id !== clientId || stored.redirect_uri !== redirectUri) {
    return null
  }

  const now = new Date()
  if (stored.expires_at < now) {
    await client.execute(
      `DELETE FROM ${keyspace}.authorization_codes WHERE code = ?`,
      [code],
    )
    return null
  }

  await client.execute(
    `DELETE FROM ${keyspace}.authorization_codes WHERE code = ?`,
    [code],
  )
  return stored
}
