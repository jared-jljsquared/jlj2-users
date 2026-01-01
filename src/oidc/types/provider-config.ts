export interface ProviderConfig {
  client_id: string
  client_secret: string
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  jwks_uri: string
}
