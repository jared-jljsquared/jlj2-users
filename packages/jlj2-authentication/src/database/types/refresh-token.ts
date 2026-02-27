export interface RefreshToken {
  token: string
  client_id: string
  user_id: string
  scopes: string[]
  expires_at: Date
  created_at: Date
  /** Unix timestamp of when user originally authenticated. Null for tokens created before this field existed. */
  auth_time: number | null
}

export interface RefreshTokenInput {
  client_id: string
  user_id: string
  scopes: string[]
  /** Unix timestamp of when user originally authenticated. Required when creating from authorization code grant. */
  auth_time?: number
}
