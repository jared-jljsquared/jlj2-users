import { randomBytes } from 'node:crypto'
import type { TokenEndpointAuthMethod } from '../database/types/oauth-client.ts'
import { hashClientSecret, verifyClientSecret } from './credentials.ts'
import {
  deactivateClient,
  findClientById,
  insertClient,
  updateClient,
} from './storage.ts'
import type {
  Client,
  ClientRegistrationInput,
  ClientUpdateInput,
  ClientWithSecret,
} from './types/client.ts'

const ALLOWED_GRANT_TYPES = [
  'authorization_code',
  'refresh_token',
  'client_credentials',
  'password',
  'implicit',
] as const

const ALLOWED_RESPONSE_TYPES = ['code', 'token', 'id_token'] as const

const ALLOWED_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const

const AUTH_METHODS: TokenEndpointAuthMethod[] = [
  'client_secret_basic',
  'client_secret_post',
  'none',
]

const DEFAULT_GRANT_TYPES = ['authorization_code']
const DEFAULT_RESPONSE_TYPES = ['code']
const DEFAULT_SCOPES = ['openid', 'profile', 'email']

/**
 * Validate redirect URI format - must be absolute URI
 */
const isValidRedirectUri = (uri: string): boolean => {
  try {
    const parsed = new URL(uri)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const toApiClient = (row: {
  client_id: string
  client_name: string
  redirect_uris: string[]
  grant_types: string[]
  response_types: string[]
  scopes: string[]
  token_endpoint_auth_method: TokenEndpointAuthMethod
  created_at: Date
  updated_at: Date
}): Client => ({
  id: row.client_id,
  name: row.client_name,
  redirectUris: row.redirect_uris ?? [],
  grantTypes: row.grant_types ?? [],
  responseTypes: row.response_types ?? [],
  scopes: row.scopes ?? [],
  tokenEndpointAuthMethod: row.token_endpoint_auth_method,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/**
 * Generate a random client secret (32 bytes, base64url encoded)
 */
const generateClientSecret = (): string => {
  return randomBytes(32).toString('base64url')
}

/**
 * Register a new OAuth client
 */
export const registerClient = async (
  input: ClientRegistrationInput,
): Promise<ClientWithSecret> => {
  if (!input.name?.trim()) {
    throw new Error('Client name is required')
  }

  if (!input.redirectUris?.length) {
    throw new Error('At least one redirect URI is required')
  }

  for (const uri of input.redirectUris) {
    if (!isValidRedirectUri(uri)) {
      throw new Error(`Invalid redirect URI: ${uri}`)
    }
  }

  const grantTypes = input.grantTypes?.length
    ? input.grantTypes
    : DEFAULT_GRANT_TYPES
  for (const gt of grantTypes) {
    if (
      !ALLOWED_GRANT_TYPES.includes(gt as (typeof ALLOWED_GRANT_TYPES)[number])
    ) {
      throw new Error(`Invalid grant type: ${gt}`)
    }
  }

  const responseTypes = input.responseTypes?.length
    ? input.responseTypes
    : DEFAULT_RESPONSE_TYPES
  for (const rt of responseTypes) {
    if (
      !ALLOWED_RESPONSE_TYPES.includes(
        rt as (typeof ALLOWED_RESPONSE_TYPES)[number],
      )
    ) {
      throw new Error(`Invalid response type: ${rt}`)
    }
  }

  const scopes = input.scopes?.length ? input.scopes : DEFAULT_SCOPES
  for (const s of scopes) {
    if (!ALLOWED_SCOPES.includes(s as (typeof ALLOWED_SCOPES)[number])) {
      throw new Error(`Invalid scope: ${s}`)
    }
  }

  const authMethod = input.tokenEndpointAuthMethod ?? 'client_secret_post'
  if (!AUTH_METHODS.includes(authMethod)) {
    throw new Error(`Invalid token_endpoint_auth_method: ${authMethod}`)
  }

  const needsSecret = authMethod !== 'none'
  const clientSecret = needsSecret ? generateClientSecret() : ''
  const clientSecretHash = needsSecret ? hashClientSecret(clientSecret) : null

  const oauthClient = await insertClient(
    {
      client_name: input.name.trim(),
      redirect_uris: input.redirectUris,
      grant_types: grantTypes,
      response_types: responseTypes,
      scopes,
      token_endpoint_auth_method: authMethod,
    },
    clientSecretHash,
  )

  return {
    ...toApiClient(oauthClient),
    secret: clientSecret,
  }
}

/**
 * Get client by ID (never returns secret)
 */
export const getClientById = async (
  clientId: string,
): Promise<Client | null> => {
  const oauthClient = await findClientById(clientId)
  if (!oauthClient || !oauthClient.is_active) {
    return null
  }
  return toApiClient(oauthClient)
}

/**
 * Update client
 */
export const updateClientById = async (
  clientId: string,
  input: ClientUpdateInput,
): Promise<Client | null> => {
  const existing = await findClientById(clientId)
  if (!existing) {
    return null
  }

  if (input.redirectUris !== undefined) {
    if (!input.redirectUris.length) {
      throw new Error('At least one redirect URI is required')
    }
    for (const uri of input.redirectUris) {
      if (!isValidRedirectUri(uri)) {
        throw new Error(`Invalid redirect URI: ${uri}`)
      }
    }
  }

  if (input.grantTypes !== undefined) {
    for (const gt of input.grantTypes) {
      if (
        !ALLOWED_GRANT_TYPES.includes(
          gt as (typeof ALLOWED_GRANT_TYPES)[number],
        )
      ) {
        throw new Error(`Invalid grant type: ${gt}`)
      }
    }
  }

  if (input.responseTypes !== undefined) {
    for (const rt of input.responseTypes) {
      if (
        !ALLOWED_RESPONSE_TYPES.includes(
          rt as (typeof ALLOWED_RESPONSE_TYPES)[number],
        )
      ) {
        throw new Error(`Invalid response type: ${rt}`)
      }
    }
  }

  if (input.scopes !== undefined) {
    for (const s of input.scopes) {
      if (!ALLOWED_SCOPES.includes(s as (typeof ALLOWED_SCOPES)[number])) {
        throw new Error(`Invalid scope: ${s}`)
      }
    }
  }

  if (input.tokenEndpointAuthMethod !== undefined) {
    if (!AUTH_METHODS.includes(input.tokenEndpointAuthMethod)) {
      throw new Error(
        `Invalid token_endpoint_auth_method: ${input.tokenEndpointAuthMethod}`,
      )
    }
  }

  const updated = await updateClient(clientId, input)
  if (!updated || !updated.is_active) {
    return null
  }
  return toApiClient(updated)
}

/**
 * Deactivate a client
 */
export const deactivateClientById = async (
  clientId: string,
): Promise<boolean> => {
  return deactivateClient(clientId)
}

/**
 * Authenticate client by client_id and client_secret
 */
export const authenticateClient = async (
  clientId: string,
  clientSecret: string,
): Promise<Client | null> => {
  const oauthClient = await findClientById(clientId)
  if (!oauthClient || !oauthClient.is_active) {
    return null
  }

  if (oauthClient.token_endpoint_auth_method === 'none') {
    return null
  }

  if (!oauthClient.client_secret_hash) {
    return null
  }

  const isValid = verifyClientSecret(
    clientSecret,
    oauthClient.client_secret_hash,
  )
  if (!isValid) {
    return null
  }

  return toApiClient(oauthClient)
}

/**
 * Validate redirect URI against client's allowed URIs
 */
export const isRedirectUriAllowed = async (
  clientId: string,
  redirectUri: string,
): Promise<boolean> => {
  const client = await getClientById(clientId)
  if (!client) {
    return false
  }
  return client.redirectUris.includes(redirectUri)
}

/**
 * Validate scopes against client's allowed scopes
 */
export const validateScopes = async (
  clientId: string,
  requestedScopes: string[],
): Promise<{ valid: boolean; invalidScopes: string[] }> => {
  const client = await getClientById(clientId)
  if (!client) {
    return { valid: false, invalidScopes: requestedScopes }
  }

  const invalidScopes = requestedScopes.filter(
    (s) => !client.scopes.includes(s),
  )
  return {
    valid: invalidScopes.length === 0,
    invalidScopes,
  }
}
