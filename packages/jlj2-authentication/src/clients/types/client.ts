import type { TokenEndpointAuthMethod } from '../../database/types/oauth-client.ts'

export interface Client {
  id: string
  name: string
  redirectUris: string[]
  grantTypes: string[]
  responseTypes: string[]
  scopes: string[]
  tokenEndpointAuthMethod: TokenEndpointAuthMethod
  createdAt: Date
  updatedAt: Date
}

/** Client with secret - only returned on initial registration */
export interface ClientWithSecret extends Client {
  secret: string
}

export interface ClientRegistrationInput {
  name: string
  redirectUris: string[]
  grantTypes: string[]
  responseTypes: string[]
  scopes: string[]
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod
}

export interface ClientUpdateInput {
  name?: string
  redirectUris?: string[]
  grantTypes?: string[]
  responseTypes?: string[]
  scopes?: string[]
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod
}
