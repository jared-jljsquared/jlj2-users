import { randomUUID } from 'node:crypto'
import type { Client } from 'cassandra-driver'
import { getDatabaseClient } from '../database/client.ts'
import { getDatabaseConfig } from '../database/config.ts'
import type { Account } from '../database/types/account.ts'
import type { ContactMethod } from '../database/types/contact-method.ts'
import type {
  User,
  UserRegistrationInput,
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
    account_id: accountRow.account_id as string,
    username: accountRow.username as string | undefined,
    password_digest: (accountRow.password_digest as string | null) || '',
    password_salt: (accountRow.password_salt as string | null) || '',
    created_at: accountRow.created_at as Date,
    updated_at: accountRow.updated_at as Date,
    is_active: accountRow.is_active as boolean,
    last_login_at: accountRow.last_login_at as Date | undefined,
  }

  // Get primary email contact
  // Note: Since account_id and is_primary are not in the primary key of contact_methods,
  // we need to query all emails and filter in code.
  // TODO: Consider creating a lookup table (contact_methods_by_account) for efficient lookups
  const allEmailsResult = await client.execute(
    `SELECT * FROM ${keyspace}.contact_methods WHERE contact_type = ?`,
    ['email'],
  )

  let email = ''
  let emailVerified = false
  let primaryContact: ContactMethod | null = null

  for (const row of allEmailsResult.rows) {
    if (row.account_id === accountId && row.is_primary === true) {
      primaryContact = {
        account_id: row.account_id as string,
        contact_id: row.contact_id as string,
        contact_type: row.contact_type as 'email',
        contact_value: row.contact_value as string,
        is_primary: row.is_primary as boolean,
        verified_at: row.verified_at as Date | undefined,
        created_at: row.created_at as Date,
        updated_at: row.updated_at as Date,
      }
      email = primaryContact.contact_value
      emailVerified = primaryContact.verified_at != null
      break
    }
  }

  if (!primaryContact) {
    // No email found, return null
    return null
  }

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
    account_id: row.account_id as string,
    contact_id: row.contact_id as string,
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
    account_id: row.account_id as string,
    contact_id: row.contact_id as string,
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
  const accountId = contactRow.account_id as string

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
    account_id: accountRow.account_id as string,
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

/**
 * Create a new user account
 */
export const createUser = async (
  input: UserRegistrationInput,
  passwordHash?: string,
  passwordSalt?: string,
): Promise<User> => {
  const client = getClient()
  const keyspace = getKeyspace()

  const accountId = randomUUID()
  const contactId = randomUUID()
  const now = new Date()

  // Create account (password fields can be NULL for OIDC/passwordless accounts)
  await client.execute(
    `INSERT INTO ${keyspace}.accounts 
     (account_id, username, password_digest, password_salt, created_at, updated_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      accountId,
      input.name || null,
      passwordHash || null,
      passwordSalt || null,
      now,
      now,
      true,
    ],
  )

  // Create primary email contact (if email provided)
  if (input.email) {
    await client.execute(
      `INSERT INTO ${keyspace}.contact_methods 
       (account_id, contact_id, contact_type, contact_value, is_primary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        accountId,
        contactId,
        'email',
        input.email.toLowerCase(),
        true,
        now,
        now,
      ],
    )
  }

  // Return user - email will be empty string if not provided
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
