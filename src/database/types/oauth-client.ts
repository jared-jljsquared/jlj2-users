export type TokenEndpointAuthMethod =
  | 'client_secret_basic'
  | 'client_secret_post'
  | 'none'

export interface OAuthClient {
  client_id: string
  client_secret_hash: string | null
  client_name: string
  redirect_uris: string[]
  grant_types: string[]
  response_types: string[]
  scopes: string[]
  token_endpoint_auth_method: TokenEndpointAuthMethod
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface OAuthClientInput {
  client_name: string
  redirect_uris: string[]
  grant_types: string[]
  response_types: string[]
  scopes: string[]
  token_endpoint_auth_method?: TokenEndpointAuthMethod
}
