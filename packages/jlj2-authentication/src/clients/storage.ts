import { randomUUID } from 'node:crypto'
import type { Client } from 'cassandra-driver'
import { getDatabaseClient } from '../database/client.ts'
import { getDatabaseConfig } from '../database/config.ts'
import type {
  OAuthClient,
  OAuthClientInput,
  TokenEndpointAuthMethod,
} from '../database/types/oauth-client.ts'
import type { ClientUpdateInput } from './types/client.ts'

const getDbClient = (): Client => {
  return getDatabaseClient()
}

const getKeyspace = (): string => {
  return getDatabaseConfig().keyspace
}

const mapRowToClient = (row: {
  client_id: string
  client_secret_hash: string | null
  client_name: string
  redirect_uris: string[]
  grant_types: string[]
  response_types: string[]
  scopes: string[]
  token_endpoint_auth_method: string
  is_active: boolean
  created_at: Date
  updated_at: Date
}): OAuthClient => ({
  client_id: String(row.client_id),
  client_secret_hash: row.client_secret_hash,
  client_name: row.client_name as string,
  redirect_uris: (row.redirect_uris ?? []) as string[],
  grant_types: (row.grant_types ?? []) as string[],
  response_types: (row.response_types ?? []) as string[],
  scopes: (row.scopes ?? []) as string[],
  token_endpoint_auth_method:
    row.token_endpoint_auth_method as TokenEndpointAuthMethod,
  is_active: row.is_active as boolean,
  created_at: row.created_at as Date,
  updated_at: row.updated_at as Date,
})

/**
 * Insert a new OAuth client
 */
export const insertClient = async (
  input: OAuthClientInput,
  clientSecretHash: string | null,
): Promise<OAuthClient> => {
  const client = getDbClient()
  const keyspace = getKeyspace()
  const clientId = randomUUID()
  const now = new Date()

  await client.execute(
    `INSERT INTO ${keyspace}.clients 
     (client_id, client_secret_hash, client_name, redirect_uris, grant_types, response_types, scopes, token_endpoint_auth_method, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clientId,
      clientSecretHash,
      input.client_name,
      input.redirect_uris,
      input.grant_types,
      input.response_types,
      input.scopes,
      input.token_endpoint_auth_method ?? 'client_secret_post',
      true,
      now,
      now,
    ],
  )

  return {
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    client_name: input.client_name,
    redirect_uris: input.redirect_uris,
    grant_types: input.grant_types,
    response_types: input.response_types,
    scopes: input.scopes,
    token_endpoint_auth_method:
      (input.token_endpoint_auth_method as TokenEndpointAuthMethod) ??
      'client_secret_post',
    is_active: true,
    created_at: now,
    updated_at: now,
  }
}

/**
 * Find client by client_id
 */
export const findClientById = async (
  clientId: string,
): Promise<OAuthClient | null> => {
  const client = getDbClient()
  const keyspace = getKeyspace()

  const result = await client.execute(
    `SELECT * FROM ${keyspace}.clients WHERE client_id = ?`,
    [clientId],
  )

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return mapRowToClient({
    client_id: row.client_id,
    client_secret_hash: row.client_secret_hash,
    client_name: row.client_name,
    redirect_uris: row.redirect_uris ?? [],
    grant_types: row.grant_types ?? [],
    response_types: row.response_types ?? [],
    scopes: row.scopes ?? [],
    token_endpoint_auth_method: row.token_endpoint_auth_method,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })
}

/**
 * Update client
 */
export const updateClient = async (
  clientId: string,
  input: ClientUpdateInput,
): Promise<OAuthClient | null> => {
  const existing = await findClientById(clientId)
  if (!existing) {
    return null
  }

  const client = getDbClient()
  const keyspace = getKeyspace()
  const now = new Date()

  const clientName = input.name ?? existing.client_name
  const redirectUris = input.redirectUris ?? existing.redirect_uris
  const grantTypes = input.grantTypes ?? existing.grant_types
  const responseTypes = input.responseTypes ?? existing.response_types
  const scopes = input.scopes ?? existing.scopes
  const tokenEndpointAuthMethod =
    input.tokenEndpointAuthMethod ?? existing.token_endpoint_auth_method

  await client.execute(
    `UPDATE ${keyspace}.clients SET
     client_name = ?,
     redirect_uris = ?,
     grant_types = ?,
     response_types = ?,
     scopes = ?,
     token_endpoint_auth_method = ?,
     updated_at = ?
     WHERE client_id = ?`,
    [
      clientName,
      redirectUris,
      grantTypes,
      responseTypes,
      scopes,
      tokenEndpointAuthMethod,
      now,
      clientId,
    ],
  )

  return findClientById(clientId)
}

/**
 * Soft-disable a client (set is_active = false)
 */
export const deactivateClient = async (clientId: string): Promise<boolean> => {
  const existing = await findClientById(clientId)
  if (!existing) {
    return false
  }

  const client = getDbClient()
  const keyspace = getKeyspace()
  const now = new Date()

  await client.execute(
    `UPDATE ${keyspace}.clients SET is_active = ?, updated_at = ? WHERE client_id = ?`,
    [false, now, clientId],
  )

  return true
}
