export interface Identity {
  identity_id: string // UUID as string
  name?: string
  country_of_origin?: string
  date_of_birth?: Date // DATE type in CQL, stored as Date in TypeScript
  date_of_birth_verified: boolean // Defaults to false if not verified
  created_at: Date
  updated_at: Date
}

export interface IdentityInput {
  name?: string
  country_of_origin?: string
  date_of_birth?: Date
  date_of_birth_verified?: boolean
}

export interface IdentityAccount {
  identity_id: string // UUID as string
  account_id: string // UUID as string
  created_at: Date
}

export interface AccountIdentity {
  account_id: string // UUID as string
  identity_id: string // UUID as string
  created_at: Date
}
