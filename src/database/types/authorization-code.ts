export interface AuthorizationCode {
  code: string
  client_id: string
  redirect_uri: string
  scopes: string[]
  user_id: string
  code_challenge: string | null
  code_challenge_method: string | null
  nonce: string | null
  expires_at: Date
  created_at: Date
}

export interface AuthorizationCodeInput {
  client_id: string
  redirect_uri: string
  scopes: string[]
  user_id: string
  code_challenge?: string | null
  code_challenge_method?: string | null
  nonce?: string | null
}
