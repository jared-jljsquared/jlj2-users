export type ContactType = 'email' | 'phone'

export interface ContactMethod {
  account_id: string // UUID as string
  contact_id: string // UUID as string
  contact_type: ContactType
  contact_value: string
  is_primary: boolean
  verified_at?: Date // If present, contact is verified; if absent, not verified
  created_at: Date
  updated_at: Date
}

export interface ContactMethodInput {
  account_id: string // UUID as string
  contact_type: ContactType
  contact_value: string
  is_primary?: boolean
  verified_at?: Date // Optional - set when verifying the contact method
}
