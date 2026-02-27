export interface Account {
  account_id: string // UUID as string
  username?: string
  password_digest: string // Can be empty string for passwordless accounts
  password_salt: string // Can be empty string for passwordless accounts
  created_at: Date
  updated_at: Date
  is_active: boolean
  last_login_at?: Date
}

export interface AccountInput {
  username?: string
  password_digest: string
  password_salt: string
  is_active?: boolean
}
