// User types aligned with database schema (accounts + contact_methods)

export interface User {
  sub: string // Subject identifier (account_id as UUID string)
  email: string
  emailVerified: boolean
  name?: string
  givenName?: string
  familyName?: string
  picture?: string
  createdAt: Date
  updatedAt: Date
  isActive: boolean
  lastLoginAt?: Date
}

export interface UserWithPassword extends User {
  passwordDigest: string
  passwordSalt: string
}

export interface UserRegistrationInput {
  email?: string // Optional - for phone-only accounts
  password?: string // Optional - for OIDC/external provider accounts
  name?: string
  givenName?: string
  familyName?: string
}

export interface MagicLinkRequestInput {
  email?: string
  phone?: string
}

export interface MagicLinkVerifyInput {
  contactId: string
  token: string
}

export interface UserAuthenticationInput {
  email: string
  password?: string // Optional - for magic link authentication
}

export interface UserUpdateInput {
  name?: string
  givenName?: string
  familyName?: string
  picture?: string
}
