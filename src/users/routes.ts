import { Hono } from 'hono'
import {
  authenticateUser,
  authenticateWithMagicLink,
  getUserById,
  registerUser,
  requestMagicLink,
} from './service.ts'
import type {
  MagicLinkRequestInput,
  MagicLinkVerifyInput,
  UserAuthenticationInput,
  UserRegistrationInput,
} from './types/user.ts'

const users = new Hono()

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
 * POST /users/magic-link/request
 * Request a magic link for passwordless login
 */
users.post('/magic-link/request', async (c) => {
  try {
    const body = (await c.req.json()) as MagicLinkRequestInput

    if (!body.email) {
      return c.json({ error: 'Email is required' }, 400)
    }

    await requestMagicLink(body)

    // Don't reveal if user exists or not (security best practice)
    return c.json({
      message:
        'If an account exists with this email, a magic link has been sent',
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Invalid email address') {
        return c.json({ error: error.message }, 400)
      }
    }
    // Don't reveal if user exists or not
    return c.json({
      message:
        'If an account exists with this email, a magic link has been sent',
    })
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

export default users
