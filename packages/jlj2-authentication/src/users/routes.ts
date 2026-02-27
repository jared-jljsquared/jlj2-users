import { Hono } from 'hono'
import { rateLimit } from '../middleware/rate-limit.ts'
import {
  authenticateUser,
  authenticateWithMagicLink,
  getLinkedProviders,
  getUserById,
  linkProvider,
  registerUser,
  requestMagicLink,
  unlinkProvider,
  updateUserProfile,
} from './service.ts'
import type {
  MagicLinkRequestInput,
  MagicLinkVerifyInput,
  ProviderLinkInput,
  UserAuthenticationInput,
  UserRegistrationInput,
  UserUpdateInput,
} from './types/user.ts'

const users = new Hono()

users.use(
  '*',
  rateLimit({ scope: 'users', windowMs: 60_000, maxRequests: 100 }),
)

/**
 * POST /users/register
 * Register a new user
 */
users.post('/register', async (c) => {
  try {
    const body = (await c.req.json()) as UserRegistrationInput

    if (!body.email) {
      return c.json({ error: 'Email is required' }, 400)
    }

    const user = await registerUser(body)

    return c.json(
      {
        sub: user.sub,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
      },
      201,
    )
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'User already exists with this email') {
        return c.json({ error: error.message }, 409)
      }
      if (error.message === 'Invalid email address') {
        return c.json({ error: error.message }, 400)
      }
    }
    return c.json({ error: 'Registration failed' }, 500)
  }
})

/**
 * POST /users/login
 * Authenticate a user
 */
users.post('/login', async (c) => {
  try {
    const body = (await c.req.json()) as UserAuthenticationInput

    if (!body.email) {
      return c.json({ error: 'Email is required' }, 400)
    }

    if (!body.password) {
      return c.json(
        {
          error: 'Password or magic link token required',
          hint: 'Use /users/magic-link/verify for magic link authentication',
        },
        400,
      )
    }

    const user = await authenticateUser(body)

    return c.json({
      sub: user.sub,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      lastLoginAt: user.lastLoginAt?.toISOString(),
    })
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === 'Invalid email or password' ||
        error.message === 'Invalid email address'
      ) {
        return c.json({ error: 'Invalid email or password' }, 401)
      }
      if (error.message === 'Account is not active') {
        return c.json({ error: error.message }, 403)
      }
    }
    return c.json({ error: 'Authentication failed' }, 500)
  }
})

/**
 * GET /users/:sub
 * Get user by subject identifier
 */
users.get('/:sub', async (c) => {
  try {
    const sub = c.req.param('sub')

    if (!sub) {
      return c.json({ error: 'User ID is required' }, 400)
    }

    const user = await getUserById(sub)

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    return c.json({
      sub: user.sub,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      givenName: user.givenName,
      familyName: user.familyName,
      picture: user.picture,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt?.toISOString(),
    })
  } catch (_error) {
    return c.json({ error: 'Failed to retrieve user' }, 500)
  }
})

/**
 * PUT /users/:sub
 * Update user profile
 */
users.put('/:sub', async (c) => {
  try {
    const sub = c.req.param('sub')

    if (!sub) {
      return c.json({ error: 'User ID is required' }, 400)
    }

    const body = (await c.req.json()) as UserUpdateInput

    const user = await updateUserProfile(sub, body)

    return c.json({
      sub: user.sub,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      givenName: user.givenName,
      familyName: user.familyName,
      picture: user.picture,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt?.toISOString(),
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'User not found') {
        return c.json({ error: error.message }, 404)
      }
    }
    return c.json({ error: 'Failed to update user' }, 500)
  }
})

/**
 * POST /users/magic-link/request
 * Request a magic link for passwordless login
 * Supports both email and phone (SMS) magic links
 */
users.post('/magic-link/request', async (c) => {
  try {
    const body = (await c.req.json()) as MagicLinkRequestInput

    if (!body.email && !body.phone) {
      return c.json({ error: 'Either email or phone is required' }, 400)
    }
    if (body.email && body.phone) {
      return c.json({ error: 'Provide either email or phone, not both' }, 400)
    }

    const { contactId, contactType } = await requestMagicLink(body)

    // Don't reveal if user exists or not (security best practice)
    return c.json({
      message:
        'If an account exists with this contact method, a magic link has been sent',
      contactId,
      contactType,
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Invalid email address') {
        return c.json({ error: error.message }, 400)
      }
      if (error.message === 'Invalid phone number') {
        return c.json({ error: error.message }, 400)
      }
      if (
        error.message === 'Either email or phone is required' ||
        error.message === 'Provide either email or phone, not both'
      ) {
        return c.json({ error: error.message }, 400)
      }
    }
    return c.json({ error: 'Failed to process magic link request' }, 500)
  }
})

/**
 * POST /users/magic-link/verify
 * Authenticate using a magic link token
 */
users.post('/magic-link/verify', async (c) => {
  try {
    const body = (await c.req.json()) as MagicLinkVerifyInput

    if (!body.contactId || !body.token) {
      return c.json({ error: 'Contact ID and token are required' }, 400)
    }

    const user = await authenticateWithMagicLink(body)

    return c.json({
      sub: user.sub,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      lastLoginAt: user.lastLoginAt?.toISOString(),
    })
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === 'Invalid or expired magic link token' ||
        error.message === 'Contact method not found'
      ) {
        return c.json({ error: 'Invalid or expired magic link token' }, 401)
      }
      if (error.message === 'Account is not active') {
        return c.json({ error: error.message }, 403)
      }
      if (error.message === 'User not found') {
        return c.json({ error: 'Invalid or expired magic link token' }, 401)
      }
    }
    return c.json({ error: 'Magic link verification failed' }, 500)
  }
})

/**
 * GET /users/:sub/providers
 * Get all linked provider accounts for a user
 */
users.get('/:sub/providers', async (c) => {
  try {
    const sub = c.req.param('sub')

    if (!sub) {
      return c.json({ error: 'User ID is required' }, 400)
    }

    const providers = await getLinkedProviders(sub)

    return c.json({
      providers: providers.map((p) => ({
        provider: p.provider,
        providerSub: p.providerSub,
        contactId: p.contactId,
        linkedAt: p.linkedAt.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'User not found') {
        return c.json({ error: error.message }, 404)
      }
    }
    return c.json({ error: 'Failed to retrieve linked providers' }, 500)
  }
})

/**
 * POST /users/:sub/providers
 * Link a provider account to a user
 */
users.post('/:sub/providers', async (c) => {
  try {
    const sub = c.req.param('sub')

    if (!sub) {
      return c.json({ error: 'User ID is required' }, 400)
    }

    const body = (await c.req.json()) as ProviderLinkInput

    if (!body.contactId || !body.provider || !body.providerSub) {
      return c.json(
        {
          error: 'contactId, provider, and providerSub are required',
        },
        400,
      )
    }

    const result = await linkProvider(
      sub,
      body.contactId,
      body.provider,
      body.providerSub,
    )

    return c.json(
      {
        provider: result.provider,
        providerSub: result.providerSub,
        linkedAt: result.linkedAt.toISOString(),
      },
      201,
    )
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Provider account already linked') {
        return c.json({ error: error.message }, 409)
      }
      if (error.message === 'User not found') {
        return c.json({ error: error.message }, 404)
      }
    }
    return c.json({ error: 'Failed to link provider account' }, 500)
  }
})

/**
 * DELETE /users/:sub/providers/:provider/:providerSub
 * Unlink a provider account from a user
 */
users.delete('/:sub/providers/:provider/:providerSub', async (c) => {
  try {
    const sub = c.req.param('sub')
    const provider = c.req.param('provider') as
      | 'google'
      | 'microsoft'
      | 'facebook'
      | 'x'
    const providerSub = c.req.param('providerSub')

    if (!sub || !provider || !providerSub) {
      return c.json(
        { error: 'User ID, provider, and providerSub are required' },
        400,
      )
    }

    if (
      provider !== 'google' &&
      provider !== 'microsoft' &&
      provider !== 'facebook' &&
      provider !== 'x'
    ) {
      return c.json(
        {
          error: 'Invalid provider. Must be google, microsoft, facebook, or x',
        },
        400,
      )
    }

    await unlinkProvider(sub, provider, providerSub)

    return c.json({ message: 'Provider account unlinked successfully' })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Provider account not found') {
        return c.json({ error: error.message }, 404)
      }
    }
    return c.json({ error: 'Failed to unlink provider account' }, 500)
  }
})

export default users
