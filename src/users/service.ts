import { randomUUID } from 'node:crypto'
import type { ContactMethod } from '../database/types/contact-method.ts'
import { log } from '../plumbing/logger.ts'
import { validateFacebookToken } from '../providers/facebook.ts'
import { validateGoogleToken } from '../providers/google.ts'
import { validateMicrosoftToken } from '../providers/microsoft.ts'
import { validateXToken } from '../providers/x.ts'
import {
  generateMagicLinkToken,
  storeMagicLinkToken,
  verifyMagicLinkToken,
} from './magic-link.ts'
import { hashPassword, verifyPassword } from './password.ts'
import {
  createAccount,
  createUser,
  findContactMethod,
  findContactMethodById,
  findProviderAccount,
  findProviderAccountsByAccountId,
  findUserByEmail,
  findUserById,
  linkProviderAccount,
  tryInsertContactMethod,
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
    const newAccountId = randomUUID()
    const newContactId = randomUUID()
    const now = new Date()

    if (contactType === 'phone') {
      // Claim phone contact first (LWT) to prevent race, then create account
      const applied = await tryInsertContactMethod(
        newAccountId,
        newContactId,
        'phone',
        contactValue,
        true,
        null,
        now,
        now,
      )
      if (applied) {
        await createAccount(newAccountId, {})
      }
      const found = await findContactMethod('phone', contactValue)
      if (!found) throw new Error('Failed to create contact method')
      contactId = found.contact_id
    } else {
      // Email: createUser uses tryInsertContactMethod internally
      try {
        await createUser({ email: contactValue }, undefined, undefined)
        const newContactMethod = await findContactMethod('email', contactValue)
        if (!newContactMethod)
          throw new Error('Failed to create contact method')
        contactId = newContactMethod.contact_id
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'User already exists with this email'
        ) {
          // Race: another request created it; use existing contact
          const existing = await findContactMethod('email', contactValue)
          if (!existing) throw error
          contactId = existing.contact_id
        } else {
          throw error
        }
      }
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
 * Authenticate a user with a Google ID token.
 * Finds or creates a user, links the Google account if needed, and returns the user.
 */
export const authenticateWithGoogle = async (
  idToken: string,
): Promise<User> => {
  const providerUserInfo = await validateGoogleToken(idToken)

  if (!providerUserInfo.email) {
    throw new Error('Google ID token must include email claim')
  }

  const providerSub = providerUserInfo.sub
  const email = providerUserInfo.email.toLowerCase()

  // Case 1: Provider account already linked
  const existingProviderAccount = await findProviderAccount(
    'google',
    providerSub,
  )
  if (existingProviderAccount) {
    const user = await findUserById(existingProviderAccount.account_id)
    if (!user) {
      throw new Error('Linked account not found')
    }
    if (!user.isActive) {
      throw new Error('Account is not active')
    }
    await updateLastLogin(user.sub)
    return user
  }

  // Case 2: User exists by email - link provider account
  const existingUser = await findUserByEmail(email)
  if (existingUser) {
    if (!existingUser.isActive) {
      throw new Error('Account is not active')
    }
    const contactMethod = await findContactMethod('email', email)
    if (!contactMethod) {
      throw new Error('Contact method not found')
    }
    await linkProviderAccount({
      provider: 'google',
      provider_sub: providerSub,
      contact_id: contactMethod.contact_id,
      account_id: existingUser.sub,
    })
    await updateLastLogin(existingUser.sub)
    const { passwordDigest, passwordSalt, ...user } = existingUser
    return user
  }

  // Case 3: New user - create account and link provider
  const newUser = await createUser(
    {
      email,
      name: providerUserInfo.name ?? undefined,
      givenName: providerUserInfo.givenName ?? undefined,
      familyName: providerUserInfo.familyName ?? undefined,
    },
    undefined,
    undefined,
  )
  const contactMethod = await findContactMethod('email', email)
  if (!contactMethod) {
    throw new Error('Contact method not found after user creation')
  }
  await linkProviderAccount({
    provider: 'google',
    provider_sub: providerSub,
    contact_id: contactMethod.contact_id,
    account_id: newUser.sub,
  })
  await updateLastLogin(newUser.sub)
  return newUser
}

/**
 * Authenticate a user with a Microsoft ID token.
 * Finds or creates a user, links the Microsoft account if needed, and returns the user.
 */
export const authenticateWithMicrosoft = async (
  idToken: string,
): Promise<User> => {
  const providerUserInfo = await validateMicrosoftToken(idToken)

  if (!providerUserInfo.email) {
    throw new Error(
      'Microsoft ID token must include email or preferred_username claim',
    )
  }

  const providerSub = providerUserInfo.sub
  const email = providerUserInfo.email.toLowerCase()

  // Case 1: Provider account already linked
  const existingProviderAccount = await findProviderAccount(
    'microsoft',
    providerSub,
  )
  if (existingProviderAccount) {
    const user = await findUserById(existingProviderAccount.account_id)
    if (!user) {
      throw new Error('Linked account not found')
    }
    if (!user.isActive) {
      throw new Error('Account is not active')
    }
    await updateLastLogin(user.sub)
    return user
  }

  // Case 2: User exists by email - link provider account
  const existingUser = await findUserByEmail(email)
  if (existingUser) {
    if (!existingUser.isActive) {
      throw new Error('Account is not active')
    }
    const contactMethod = await findContactMethod('email', email)
    if (!contactMethod) {
      throw new Error('Contact method not found')
    }
    await linkProviderAccount({
      provider: 'microsoft',
      provider_sub: providerSub,
      contact_id: contactMethod.contact_id,
      account_id: existingUser.sub,
    })
    await updateLastLogin(existingUser.sub)
    const { passwordDigest, passwordSalt, ...user } = existingUser
    return user
  }

  // Case 3: New user - create account and link provider
  const newUser = await createUser(
    {
      email,
      name: providerUserInfo.name ?? undefined,
      givenName: providerUserInfo.givenName ?? undefined,
      familyName: providerUserInfo.familyName ?? undefined,
    },
    undefined,
    undefined,
  )
  const contactMethod = await findContactMethod('email', email)
  if (!contactMethod) {
    throw new Error('Contact method not found after user creation')
  }
  await linkProviderAccount({
    provider: 'microsoft',
    provider_sub: providerSub,
    contact_id: contactMethod.contact_id,
    account_id: newUser.sub,
  })
  await updateLastLogin(newUser.sub)
  return newUser
}

/**
 * Authenticate a user with a Facebook access token.
 * Finds or creates a user, links the Facebook account if needed, and returns the user.
 * Note: Facebook uses OAuth 2.0 access tokens, not OIDC ID tokens.
 */
export const authenticateWithFacebook = async (
  accessToken: string,
): Promise<User> => {
  const providerUserInfo = await validateFacebookToken(accessToken)

  if (!providerUserInfo.email) {
    throw new Error(
      'Facebook must grant email permission. Ensure scope includes email.',
    )
  }

  const providerSub = providerUserInfo.sub
  const email = providerUserInfo.email.toLowerCase()

  // Case 1: Provider account already linked
  const existingProviderAccount = await findProviderAccount(
    'facebook',
    providerSub,
  )
  if (existingProviderAccount) {
    const user = await findUserById(existingProviderAccount.account_id)
    if (!user) {
      throw new Error('Linked account not found')
    }
    if (!user.isActive) {
      throw new Error('Account is not active')
    }
    await updateLastLogin(user.sub)
    return user
  }

  // Case 2: User exists by email - link provider account
  const existingUser = await findUserByEmail(email)
  if (existingUser) {
    if (!existingUser.isActive) {
      throw new Error('Account is not active')
    }
    const contactMethod = await findContactMethod('email', email)
    if (!contactMethod) {
      throw new Error('Contact method not found')
    }
    await linkProviderAccount({
      provider: 'facebook',
      provider_sub: providerSub,
      contact_id: contactMethod.contact_id,
      account_id: existingUser.sub,
    })
    await updateLastLogin(existingUser.sub)
    const { passwordDigest, passwordSalt, ...user } = existingUser
    return user
  }

  // Case 3: New user - create account and link provider
  const newUser = await createUser(
    {
      email,
      name: providerUserInfo.name ?? undefined,
    },
    undefined,
    undefined,
  )
  const contactMethod = await findContactMethod('email', email)
  if (!contactMethod) {
    throw new Error('Contact method not found after user creation')
  }
  await linkProviderAccount({
    provider: 'facebook',
    provider_sub: providerSub,
    contact_id: contactMethod.contact_id,
    account_id: newUser.sub,
  })
  await updateLastLogin(newUser.sub)
  return newUser
}

/**
 * Authenticate a user with an X access token.
 * Finds or creates a user, links the X account if needed, and returns the user.
 * X uses OAuth 2.0 access tokens, not OIDC ID tokens.
 * When email is not available (X requires additional approval for email scope),
 * uses x-{id}@placeholder.local as fallback for account creation.
 */
export const authenticateWithX = async (accessToken: string): Promise<User> => {
  const providerUserInfo = await validateXToken(accessToken)

  const providerSub = providerUserInfo.sub
  const email = providerUserInfo.email
    ? providerUserInfo.email.toLowerCase()
    : `x-${providerSub}@placeholder.local`

  // Case 1: Provider account already linked
  const existingProviderAccount = await findProviderAccount('x', providerSub)
  if (existingProviderAccount) {
    const user = await findUserById(existingProviderAccount.account_id)
    if (!user) {
      throw new Error('Linked account not found')
    }
    if (!user.isActive) {
      throw new Error('Account is not active')
    }
    await updateLastLogin(user.sub)
    return user
  }

  // Case 2: User exists by email - link provider account (only when X provided email)
  if (providerUserInfo.email) {
    const existingUser = await findUserByEmail(email)
    if (existingUser) {
      if (!existingUser.isActive) {
        throw new Error('Account is not active')
      }
      const contactMethod = await findContactMethod('email', email)
      if (!contactMethod) {
        throw new Error('Contact method not found')
      }
      await linkProviderAccount({
        provider: 'x',
        provider_sub: providerSub,
        contact_id: contactMethod.contact_id,
        account_id: existingUser.sub,
      })
      await updateLastLogin(existingUser.sub)
      const { passwordDigest, passwordSalt, ...user } = existingUser
      return user
    }
  }

  // Case 3: New user - create account and link provider
  const newUser = await createUser(
    {
      email,
      name: providerUserInfo.name ?? undefined,
    },
    undefined,
    undefined,
  )
  const contactMethod = await findContactMethod('email', email)
  if (!contactMethod) {
    throw new Error('Contact method not found after user creation')
  }
  await linkProviderAccount({
    provider: 'x',
    provider_sub: providerSub,
    contact_id: contactMethod.contact_id,
    account_id: newUser.sub,
  })
  await updateLastLogin(newUser.sub)
  return newUser
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
  provider: 'google' | 'microsoft' | 'facebook' | 'x',
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
  provider: 'google' | 'microsoft' | 'facebook' | 'x',
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
