import type { Context } from 'hono'
import type { AccessTokenPayload } from '../middleware/require-access-token.ts'
import { getUserById } from '../users/service.ts'
import { findContactMethodsByAccountId } from '../users/storage.ts'

/**
 * OIDC UserInfo endpoint handler.
 * Returns user claims based on the access token's scope.
 * Must be used after requireAccessToken middleware.
 *
 * When email scope is granted, returns:
 * - email, email_verified: primary email (OIDC standard)
 * - emails: all email addresses with value, verified, primary
 * - phone_numbers: all phone numbers with value, verified, primary
 */
export const handleUserInfo = async (c: Context): Promise<Response> => {
  const payload = c.get('accessTokenPayload') as AccessTokenPayload
  const sub = payload.sub

  const user = await getUserById(sub)
  if (!user) {
    c.status(404)
    return c.json({
      error: 'user_not_found',
      error_description: 'User not found',
    })
  }

  if (!user.isActive) {
    c.status(403)
    return c.json({
      error: 'user_inactive',
      error_description: 'User account is not active',
    })
  }

  const scopes = (payload.scope ?? '').split(/\s+/).filter(Boolean)

  const claims: Record<string, unknown> = {
    sub: user.sub,
  }

  if (scopes.includes('email')) {
    const contacts = await findContactMethodsByAccountId(sub)
    const emails = contacts
      .filter((cm) => cm.contact_type === 'email')
      .map((cm) => ({
        value: cm.contact_value,
        verified: cm.verified_at != null,
        primary: cm.is_primary,
      }))
    const phoneNumbers = contacts
      .filter((cm) => cm.contact_type === 'phone')
      .map((cm) => ({
        value: cm.contact_value,
        verified: cm.verified_at != null,
        primary: cm.is_primary,
      }))

    claims.email = user.email
    claims.email_verified = user.emailVerified
    claims.emails = emails
    claims.phone_numbers = phoneNumbers
  }

  if (scopes.includes('profile')) {
    if (user.name !== undefined) claims.name = user.name
    if (user.givenName !== undefined) claims.given_name = user.givenName
    if (user.familyName !== undefined) claims.family_name = user.familyName
    if (user.picture !== undefined) claims.picture = user.picture
  }

  return c.json(claims, 200, {
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  })
}
