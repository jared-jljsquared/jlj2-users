import { randomUUID } from 'node:crypto'
import type { Client } from 'cassandra-driver'
import { getDatabaseClient } from '../database/client.ts'
import { getDatabaseConfig } from '../database/config.ts'
import type { Account } from '../database/types/account.ts'
import type { ContactMethod } from '../database/types/contact-method.ts'
import type {
  ProviderAccount,
  ProviderAccountInput,
} from '../database/types/provider-account.ts'
import type {
  User,
  UserRegistrationInput,
  UserUpdateInput,
  UserWithPassword,
} from './types/user.ts'

const getClient = (): Client => {
  return getDatabaseClient()
}

const getKeyspace = (): string => {
  const config = getDatabaseConfig()
  return config.keyspace
}

/**
 * Insert contact method into both contact_methods and contact_methods_by_account tables
 * This maintains consistency between the two denormalized tables
 */
export const insertContactMethod = async (
  accountId: string,
  contactId: string,
  contactType: 'email' | 'phone',
  contactValue: string,
  isPrimary: boolean,
  verifiedAt: Date | null,
  createdAt: Date,
  updatedAt: Date,
): Promise<void> => {
  const client = getClient()
  const keyspace = getKeyspace()

  // Insert into contact_methods (partitioned by contact_type)
  await client.execute(
    `INSERT INTO ${keyspace}.contact_methods 
     (account_id, contact_id, contact_type, contact_value, is_primary, verified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      accountId,
      contactId,
      contactType,
      contactValue,
      isPrimary,
      verifiedAt,
      createdAt,
      updatedAt,
    ],
  )

  // Insert into contact_methods_by_account (partitioned by account_id) for efficient lookups
  await client.execute(
    `INSERT INTO ${keyspace}.contact_methods_by_account 
     (account_id, contact_id, contact_type, contact_value, is_primary, verified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      accountId,
      contactId,
      contactType,
      contactValue,
      isPrimary,
      verifiedAt,
      createdAt,
      updatedAt,
    ],
  )
}

/**
 * Atomically claim a contact (INSERT IF NOT EXISTS) to prevent race conditions.
 * Returns true if the contact was claimed, false if it already existed.
 * When claimed, also inserts into contact_methods_by_account.
 */
export const tryInsertContactMethod = async (
  accountId: string,
  contactId: string,
  contactType: 'email' | 'phone',
  contactValue: string,
  isPrimary: boolean,
  verifiedAt: Date | null,
  createdAt: Date,
  updatedAt: Date,
): Promise<boolean> => {
  const client = getClient()
  const keyspace = getKeyspace()

  const result = await client.execute(
    `INSERT INTO ${keyspace}.contact_methods 
     (account_id, contact_id, contact_type, contact_value, is_primary, verified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     IF NOT EXISTS`,
    [
      accountId,
      contactId,
      contactType,
      contactValue,
      isPrimary,
      verifiedAt,
      createdAt,
      updatedAt,
    ],
  )

  if (!result.wasApplied()) {
    return false
  }

  // Insert into contact_methods_by_account (only when we claimed the contact)
  await client.execute(
    `INSERT INTO ${keyspace}.contact_methods_by_account 
     (account_id, contact_id, contact_type, contact_value, is_primary, verified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      accountId,
      contactId,
      contactType,
      contactValue,
      isPrimary,
      verifiedAt,
      createdAt,
      updatedAt,
    ],
  )
  return true
}

/**
 * Find user by account_id (subject identifier)
 */
export const findUserById = async (accountId: string): Promise<User | null> => {
  const client = getClient()
  const keyspace = getKeyspace()

  // Get account
  const accountResult = await client.execute(
    `SELECT * FROM ${keyspace}.accounts WHERE account_id = ?`,
    [accountId],
  )

  if (accountResult.rows.length === 0) {
    return null
  }

  const accountRow = accountResult.rows[0]
  const account: Account = {
    account_id: String(accountRow.account_id),
    username: accountRow.username as string | undefined,
    password_digest: (accountRow.password_digest as string | null) || '',
    password_salt: (accountRow.password_salt as string | null) || '',
    created_at: accountRow.created_at as Date,
    updated_at: accountRow.updated_at as Date,
    is_active: accountRow.is_active as boolean,
    last_login_at: accountRow.last_login_at as Date | undefined,
  }

  // Get contacts using the lookup table for efficient querying
  const contactMethodsResult = await client.execute(
    `SELECT * FROM ${keyspace}.contact_methods_by_account 
     WHERE account_id = ?`,
    [accountId],
  )

  let email = ''
  let emailVerified = false

  // Find the primary email contact if present (accounts may be phone-only)
  for (const row of contactMethodsResult.rows) {
    if (row.contact_type === 'email' && row.is_primary === true) {
      email = row.contact_value as string
      emailVerified = row.verified_at != null
      break
    }
  }

  // Account exists; return user even when no email (e.g. phone-only magic link accounts)
  return {
    sub: account.account_id,
    email,
    emailVerified,
    name: account.username,
    createdAt: account.created_at,
    updatedAt: account.updated_at,
    isActive: account.is_active,
    lastLoginAt: account.last_login_at,
  }
}

/**
 * Find contact method by type and value (email or phone)
 */
export const findContactMethod = async (
  contactType: 'email' | 'phone',
  contactValue: string,
): Promise<ContactMethod | null> => {
  const client = getClient()
  const keyspace = getKeyspace()

  const normalizedValue =
    contactType === 'email' ? contactValue.toLowerCase() : contactValue

  const result = await client.execute(
    `SELECT * FROM ${keyspace}.contact_methods 
     WHERE contact_type = ? AND contact_value = ? 
     LIMIT 1`,
    [contactType, normalizedValue],
  )

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    account_id: String(row.account_id),
    contact_id: String(row.contact_id),
    contact_type: row.contact_type as 'email' | 'phone',
    contact_value: row.contact_value as string,
    is_primary: row.is_primary as boolean,
    verified_at: row.verified_at as Date | undefined,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

/**
 * Find contact method by contactId
 */
export const findContactMethodById = async (
  contactId: string,
): Promise<ContactMethod | null> => {
  const client = getClient()
  const keyspace = getKeyspace()

  // contact_id is not in the primary key, so we need to use ALLOW FILTERING
  const result = await client.execute(
    `SELECT * FROM ${keyspace}.contact_methods 
     WHERE contact_id = ? ALLOW FILTERING
     LIMIT 1`,
    [contactId],
  )

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    account_id: String(row.account_id),
    contact_id: String(row.contact_id),
    contact_type: row.contact_type as 'email' | 'phone',
    contact_value: row.contact_value as string,
    is_primary: row.is_primary as boolean,
    verified_at: row.verified_at as Date | undefined,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

/**
 * Find user by email address
 */
export const findUserByEmail = async (
  email: string,
): Promise<UserWithPassword | null> => {
  const client = getClient()
  const keyspace = getKeyspace()

  // Find contact method by email
  const contactResult = await client.execute(
    `SELECT * FROM ${keyspace}.contact_methods 
     WHERE contact_type = ? AND contact_value = ? 
     LIMIT 1`,
    ['email', email.toLowerCase()],
  )

  if (contactResult.rows.length === 0) {
    return null
  }

  const contactRow = contactResult.rows[0]
  const accountId = String(contactRow.account_id)

  // Get account
  const accountResult = await client.execute(
    `SELECT * FROM ${keyspace}.accounts WHERE account_id = ?`,
    [accountId],
  )

  if (accountResult.rows.length === 0) {
    return null
  }

  const accountRow = accountResult.rows[0]
  const account: Account = {
    account_id: String(accountRow.account_id),
    username: accountRow.username as string | undefined,
    password_digest: (accountRow.password_digest as string | null) || '',
    password_salt: (accountRow.password_salt as string | null) || '',
    created_at: accountRow.created_at as Date,
    updated_at: accountRow.updated_at as Date,
    is_active: accountRow.is_active as boolean,
    last_login_at: accountRow.last_login_at as Date | undefined,
  }

  const emailVerified = contactRow.verified_at != null

  return {
    sub: account.account_id,
    email: contactRow.contact_value as string,
    emailVerified,
    name: account.username,
    createdAt: account.created_at,
    updatedAt: account.updated_at,
    isActive: account.is_active,
    lastLoginAt: account.last_login_at,
    passwordDigest: account.password_digest,
    passwordSalt: account.password_salt,
  }
}

export interface CreateAccountOptions {
  name?: string
  passwordHash?: string
  passwordSalt?: string
}

/**
 * Create an account row only (no contact methods).
 * Used when the contact has already been claimed via tryInsertContactMethod.
 */
export const createAccount = async (
  accountId: string,
  options: CreateAccountOptions = {},
): Promise<void> => {
  const client = getClient()
  const keyspace = getKeyspace()
  const now = new Date()

  await client.execute(
    `INSERT INTO ${keyspace}.accounts 
     (account_id, username, password_digest, password_salt, created_at, updated_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      accountId,
      options.name ?? null,
      options.passwordHash ?? null,
      options.passwordSalt ?? null,
      now,
      now,
      true,
    ],
  )
}

/**
 * Create a new user account.
 * For email registration, uses tryInsertContactMethod (LWT) to prevent race conditions.
 */
export const createUser = async (
  input: UserRegistrationInput,
  passwordHash?: string,
  passwordSalt?: string,
): Promise<User> => {
  const accountId = randomUUID()
  const contactId = randomUUID()
  const now = new Date()

  if (input.email) {
    // Claim contact first to prevent duplicate accounts (TOCTOU race)
    const applied = await tryInsertContactMethod(
      accountId,
      contactId,
      'email',
      input.email.toLowerCase(),
      true,
      null,
      now,
      now,
    )
    if (!applied) {
      throw new Error('User already exists with this email')
    }
    await createAccount(accountId, {
      name: input.name,
      passwordHash,
      passwordSalt,
    })
  } else {
    await createAccount(accountId, {
      name: input.name,
      passwordHash,
      passwordSalt,
    })
  }

  const email = input.email ? input.email.toLowerCase() : ''
  return {
    sub: accountId,
    email,
    emailVerified: false,
    name: input.name,
    givenName: input.givenName,
    familyName: input.familyName,
    createdAt: now,
    updatedAt: now,
    isActive: true,
  }
}

/**
 * Update user's last login timestamp
 */
export const updateLastLogin = async (accountId: string): Promise<void> => {
  const client = getClient()
  const keyspace = getKeyspace()
  const now = new Date()

  await client.execute(
    `UPDATE ${keyspace}.accounts 
     SET last_login_at = ?, updated_at = ?
     WHERE account_id = ?`,
    [now, now, accountId],
  )
}

/**
 * Update user profile information
 */
export const updateUser = async (
  accountId: string,
  input: UserUpdateInput,
): Promise<User> => {
  const client = getClient()
  const keyspace = getKeyspace()
  const now = new Date()

  // Build update query dynamically based on provided fields
  const updates: string[] = []
  const values: unknown[] = []

  if (input.name !== undefined) {
    updates.push('username = ?')
    values.push(input.name || null)
  }

  // Note: givenName, familyName, and picture are not currently stored in accounts table
  // They would need to be added to the schema or stored elsewhere
  // For now, we'll only update the username field

  if (updates.length === 0) {
    // No updates to make, just return the current user
    const user = await findUserById(accountId)
    if (!user) {
      throw new Error('User not found')
    }
    return user
  }

  // Add updated_at
  updates.push('updated_at = ?')
  values.push(now)

  // Add account_id for WHERE clause
  values.push(accountId)

  await client.execute(
    `UPDATE ${keyspace}.accounts 
     SET ${updates.join(', ')}
     WHERE account_id = ?`,
    values,
  )

  // Return updated user
  const updatedUser = await findUserById(accountId)
  if (!updatedUser) {
    throw new Error('User not found after update')
  }

  return updatedUser
}

/**
 * Link a provider account to a contact method
 */
export const linkProviderAccount = async (
  input: ProviderAccountInput,
): Promise<ProviderAccount> => {
  const client = getClient()
  const keyspace = getKeyspace()
  const now = new Date()

  await client.execute(
    `INSERT INTO ${keyspace}.provider_accounts 
     (provider, provider_sub, contact_id, account_id, linked_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.provider,
      input.provider_sub,
      input.contact_id,
      input.account_id,
      now,
      now,
    ],
  )

  return {
    provider: input.provider,
    provider_sub: input.provider_sub,
    contact_id: input.contact_id,
    account_id: input.account_id,
    linked_at: now,
    created_at: now,
  }
}

/**
 * Find provider account by provider and provider_sub
 */
export const findProviderAccount = async (
  provider: 'google' | 'microsoft' | 'facebook',
  providerSub: string,
): Promise<ProviderAccount | null> => {
  const client = getClient()
  const keyspace = getKeyspace()

  const result = await client.execute(
    `SELECT * FROM ${keyspace}.provider_accounts 
     WHERE provider = ? AND provider_sub = ?`,
    [provider, providerSub],
  )

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    provider: row.provider as 'google' | 'microsoft' | 'facebook',
    provider_sub: row.provider_sub as string,
    contact_id: String(row.contact_id),
    account_id: String(row.account_id),
    linked_at: row.linked_at as Date,
    created_at: row.created_at as Date,
  }
}

/**
 * Find all provider accounts for a contact method
 */
export const findProviderAccountsByContactId = async (
  contactId: string,
): Promise<ProviderAccount[]> => {
  const client = getClient()
  const keyspace = getKeyspace()

  // contact_id is not in the primary key, so we need to use ALLOW FILTERING
  const result = await client.execute(
    `SELECT * FROM ${keyspace}.provider_accounts 
     WHERE contact_id = ? ALLOW FILTERING`,
    [contactId],
  )

  return result.rows.map((row) => ({
    provider: row.provider as 'google' | 'microsoft' | 'facebook',
    provider_sub: row.provider_sub as string,
    contact_id: String(row.contact_id),
    account_id: String(row.account_id),
    linked_at: row.linked_at as Date,
    created_at: row.created_at as Date,
  }))
}

/**
 * Find all provider accounts for an account
 */
export const findProviderAccountsByAccountId = async (
  accountId: string,
): Promise<ProviderAccount[]> => {
  const client = getClient()
  const keyspace = getKeyspace()

  // account_id is not in the primary key, so we need to use ALLOW FILTERING
  const result = await client.execute(
    `SELECT * FROM ${keyspace}.provider_accounts 
     WHERE account_id = ? ALLOW FILTERING`,
    [accountId],
  )

  return result.rows.map((row) => ({
    provider: row.provider as 'google' | 'microsoft' | 'facebook',
    provider_sub: row.provider_sub as string,
    contact_id: String(row.contact_id),
    account_id: String(row.account_id),
    linked_at: row.linked_at as Date,
    created_at: row.created_at as Date,
  }))
}

/**
 * Unlink a provider account
 */
export const unlinkProviderAccount = async (
  provider: 'google' | 'microsoft' | 'facebook',
  providerSub: string,
): Promise<void> => {
  const client = getClient()
  const keyspace = getKeyspace()

  await client.execute(
    `DELETE FROM ${keyspace}.provider_accounts 
     WHERE provider = ? AND provider_sub = ?`,
    [provider, providerSub],
  )
}
