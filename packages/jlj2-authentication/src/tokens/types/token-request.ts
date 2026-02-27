export interface TokenRequest {
  grant_type: string
  code?: string
  redirect_uri?: string
  client_id?: string
  client_secret?: string
  refresh_token?: string
  scope?: string
}
