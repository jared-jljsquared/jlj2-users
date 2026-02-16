export type ProviderName = 'google' | 'microsoft' | 'facebook' | 'x'

export interface ProviderAccount {
  provider: ProviderName
  provider_sub: string // Provider's subject identifier (their unique user ID)
  contact_id: string // UUID as string - links to contact_methods.contact_id
  account_id: string // UUID as string - denormalized for query efficiency
  linked_at: Date
  created_at: Date
}

export interface ProviderAccountInput {
  provider: ProviderName
  provider_sub: string
  contact_id: string // UUID as string
  account_id: string // UUID as string
}
