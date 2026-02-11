import { randomUUID } from 'node:crypto'
import type { ContactMethod } from '../database/types/contact-method.ts'
import { log } from '../plumbing/logger.ts'
import {
  generateMagicLinkToken,
  storeMagicLinkToken,
  verifyMagicLinkToken,
} from './magic-link.ts'
import { hashPassword, verifyPassword } from './password.ts'
import {
  createUser,
  findContactMethod,
  findContactMethodById,
  findProviderAccount,
  findProviderAccountsByAccountId,
  findUserByEmail,
  findUserById,
  insertContactMethod,
  linkProviderAccount,
  unlinkProviderAccount,
  updateLastLogin,
  updateUser,
} from './storage.ts'
import type {
  MagicLinkRequestInput,
  MagicLinkVerifyInput,
  User,
  UserAuthenticationInput,
  UserRegistrationInput,
  UserUpdateInput,
} from './types/user.ts'

/**
 * Validate email format
 */
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Register a new user
 * Password is optional - allows OIDC/external provider accounts
 */
export const registerUser = async (
  input: UserRegistrationInput,
): Promise<User> => {
  // Validate email format if provided
  if (input.email) {
    if (!isValidEmail(input.email)) {
      throw new Error('Invalid email address')
    }

    // Check for existing user
    const existing = await findUserByEmail(input.email)
    if (existing) {
      throw new Error('User already exists with this email')
    }
  }

  // Hash password if provided (for local auth accounts)
  let passwordHash: string | undefined
  let passwordSalt: string | undefined

  if (input.password) {
    const hashed = await hashPassword(input.password)
    passwordHash = hashed.hash
    passwordSalt = hashed.salt
  }

  // Create user (passwordless if no password provided)
  const user = await createUser(input, passwordHash, passwordSalt)

  return user
}

/**
 * Authenticate a user with email and password
 * Password is optional - supports magic link authentication
 */
export const authenticateUser = async (
  input: UserAuthenticationInput,
): Promise<User> => {
  // Validate email format
  if (!isValidEmail(input.email)) {
    throw new Error('Invalid email address')
  }

  // Find user by email
  const userWithPassword = await findUserByEmail(input.email)
  if (!userWithPassword) {
    throw new Error('Invalid email or password')
  }

  // Verify password before revealing account status (prevents enumerating inactive accounts)
  if (input.password) {
    // Check if account has a password
    if (!userWithPassword.passwordDigest || !userWithPassword.passwordSalt) {
      throw new Error('Invalid email or password')
    }

    const isValid = await verifyPassword(
      input.password,
      userWithPassword.passwordDigest,
      userWithPassword.passwordSalt,
    )

    if (!isValid) {
      throw new Error('Invalid email or password')
    }
  } else {
    // No password provided - this should be handled by magic link verification
    throw new Error('Password or magic link token required')
  }

  // Check account status only after successful authentication
  if (!userWithPassword.isActive) {
    throw new Error('Account is not active')
  }

  // Update last login
  await updateLastLogin(userWithPassword.sub)

  // Return user without password fields
  const { passwordDigest, passwordSalt, ...user } = userWithPassword
  return user
}

/**
 * Validate phone number format (basic validation)
 */
const isValidPhone = (phone: string): boolean => {
  // Basic phone validation - accepts digits, spaces, dashes, parentheses, and +
  const phoneRegex = /^[\d\s\-()+]+$/
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10
}

/**
 * Request a magic link for passwordless login
 * Supports both email and phone (SMS) magic links
 */
export const requestMagicLink = async (
  input: MagicLinkRequestInput,
): Promise<{ contactId: string; contactType: 'email' | 'phone' }> => {
  // Validate that exactly one contact method is provided
  if (!input.email && !input.phone) {
    throw new Error('Either email or phone is required')
  }
  if (input.email && input.phone) {
    throw new Error('Provide either email or phone, not both')
  }

  let contactType: 'email' | 'phone'
  let contactValue: string
  let contactMethod: ContactMethod | null = null

  if (input.email) {
    // Validate email format
    if (!isValidEmail(input.email)) {
      throw new Error('Invalid email address')
    }
    contactType = 'email'
    contactValue = input.email.toLowerCase()
    contactMethod = await findContactMethod('email', contactValue)
  } else if (input.phone) {
    // Validate phone format
    if (!isValidPhone(input.phone)) {
      throw new Error('Invalid phone number')
    }
    contactType = 'phone'
    contactValue = input.phone
    contactMethod = await findContactMethod('phone', contactValue)
  } else {
    // This should never happen due to earlier validation, but TypeScript needs it
    throw new Error('Either email or phone is required')
  }

  // If contact method doesn't exist, create account and contact method
  let contactId: string
  if (!contactMethod) {
    // Create passwordless account for magic link authentication
    const user = await createUser(
      {
        email: contactType === 'email' ? contactValue : undefined,
      },
      undefined,
      undefined,
    )

    // If it's a phone contact, we need to add it separately (createUser only inserts email)
    if (contactType === 'phone') {
      const newContactId = randomUUID()
      const now = new Date()
      await insertContactMethod(
        user.sub,
        newContactId,
        'phone',
        contactValue,
        true,
        null,
        now,
        now,
      )
      contactId = newContactId
    } else {
      // Find the email contact method we just created
      const newContactMethod = await findContactMethod('email', contactValue)
      if (!newContactMethod) {
        throw new Error('Failed to create contact method')
      }
      contactId = newContactMethod.contact_id
    }
  } else {
    contactId = contactMethod.contact_id
  }

  // Generate and store magic link token
  const token = generateMagicLinkToken()
  await storeMagicLinkToken(contactId, token, 15) // 15 minute expiration

  // TODO: Send email or SMS with magic link
  // In production, integrate with email/SMS service to send the token
  // Security: Never log authentication tokens or contact values (email/phone)
  log({
    message: 'Magic link generated',
    contactId,
    contactType,
    // Note: token and contactValue are intentionally excluded for security
  })

  return { contactId, contactType }
}

/**
 * Authenticate using magic link token
 */
export const authenticateWithMagicLink = async (
  input: MagicLinkVerifyInput,
): Promise<User> => {
  // Verify magic link token
  const isValid = await verifyMagicLinkToken(input.contactId, input.token)
  if (!isValid) {
    throw new Error('Invalid or expired magic link token')
  }

  // Find contact method by contactId to get account_id
  const contactMethod = await findContactMethodById(input.contactId)
  if (!contactMethod) {
    throw new Error('Contact method not found')
  }

  // Find user by account ID
  const user = await findUserById(contactMethod.account_id)
  if (!user) {
    throw new Error('User not found')
  }

  // Check if account is active
  if (!user.isActive) {
    throw new Error('Account is not active')
  }

  // Update last login
  await updateLastLogin(user.sub)

  // Return user (findUserById already returns User without password fields)
  return user
}

/**
 * Get user by subject identifier
 */
export const getUserById = async (sub: string): Promise<User | null> => {
  return await findUserById(sub)
}

/**
 * Update user profile
 */
export const updateUserProfile = async (
  sub: string,
  input: UserUpdateInput,
): Promise<User> => {
  // Check if user exists
  const existingUser = await findUserById(sub)
  if (!existingUser) {
    throw new Error('User not found')
  }

  // Update user
  return await updateUser(sub, input)
}

/**
 * Link a provider account to a contact method
 */
export const linkProvider = async (
  accountId: string,
  contactId: string,
  provider: 'google' | 'microsoft' | 'facebook',
  providerSub: string,
): Promise<{ provider: string; providerSub: string; linkedAt: Date }> => {
  // Check if provider account already exists
  const existing = await findProviderAccount(provider, providerSub)
  if (existing) {
    throw new Error('Provider account already linked')
  }

  // Link provider account
  const providerAccount = await linkProviderAccount({
    provider,
    provider_sub: providerSub,
    contact_id: contactId,
    account_id: accountId,
  })

  return {
    provider: providerAccount.provider,
    providerSub: providerAccount.provider_sub,
    linkedAt: providerAccount.linked_at,
  }
}

/**
 * Get all linked provider accounts for a user
 */
export const getLinkedProviders = async (
  accountId: string,
): Promise<
  Array<{
    provider: string
    providerSub: string
    contactId: string
    linkedAt: Date
  }>
> => {
  const providerAccounts = await findProviderAccountsByAccountId(accountId)

  return providerAccounts.map((pa) => ({
    provider: pa.provider,
    providerSub: pa.provider_sub,
    contactId: pa.contact_id,
    linkedAt: pa.linked_at,
  }))
}

/**
 * Unlink a provider account. Verifies the provider account belongs to the given user.
 */
export const unlinkProvider = async (
  accountId: string,
  provider: 'google' | 'microsoft' | 'facebook',
  providerSub: string,
): Promise<void> => {
  const existing = await findProviderAccount(provider, providerSub)
  if (!existing) {
    throw new Error('Provider account not found')
  }

  // Verify the provider account belongs to this user
  if (existing.account_id !== accountId) {
    throw new Error('Provider account not found')
  }

  await unlinkProviderAccount(provider, providerSub)
}
