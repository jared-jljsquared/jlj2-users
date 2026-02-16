export interface RefreshToken {
  token: string
  client_id: string
  user_id: string
  scopes: string[]
  expires_at: Date
  created_at: Date
}

export interface RefreshTokenInput {
  client_id: string
  user_id: string
  scopes: string[]
}
