import { parseJwt, verifyJwt } from '../tokens/jwt.ts'
import { getGoogleConfig } from './google-config.ts'
import { getGooglePublicKeyByKid } from './google-jwks.ts'
import type { ProviderUserInfo } from './types/provider-user-info.ts'

const VALID_ISSUERS = [
  'https://accounts.google.com',
  'accounts.google.com',
] as const

/**
 * Validate a Google ID token and extract user information.
 * Verifies signature with Google's JWKS, validates iss, aud, exp, nbf.
 */
export const validateGoogleToken = async (
  idToken: string,
  clientId?: string,
): Promise<ProviderUserInfo> => {
  const { header } = parseJwt(idToken)
  const kid = header.kid as string | undefined
  if (!kid) {
    throw new Error('Google ID token missing kid in header')
  }

  const publicKey = await getGooglePublicKeyByKid(kid)
  const { payload: verifiedPayload } = verifyJwt(idToken, publicKey, 'RS256')

  const iss = verifiedPayload.iss as string | undefined
  if (!iss || !VALID_ISSUERS.includes(iss as (typeof VALID_ISSUERS)[number])) {
    throw new Error('Invalid token issuer')
  }

  const expectedClientId = clientId ?? getGoogleConfig().clientId
  if (expectedClientId) {
    const aud = verifiedPayload.aud
    const audMatches =
      aud === expectedClientId ||
      (Array.isArray(aud) && aud.includes(expectedClientId))
    if (!audMatches) {
      throw new Error('Invalid token audience')
    }
  }

  const sub = verifiedPayload.sub as string | undefined
  if (!sub) {
    throw new Error('Google ID token missing sub claim')
  }

  return {
    sub,
    email: (verifiedPayload.email as string) ?? '',
    name: verifiedPayload.name as string | undefined,
    picture: verifiedPayload.picture as string | undefined,
    emailVerified: verifiedPayload.email_verified as boolean | undefined,
    givenName: verifiedPayload.given_name as string | undefined,
    familyName: verifiedPayload.family_name as string | undefined,
  }
}

/**
 * Build the Google OAuth authorization URL for the authorization code flow.
 */
export const getGoogleAuthorizationUrl = (
  redirectUri: string,
  state: string,
): string => {
  const { clientId } = getGoogleConfig()
  if (!clientId) {
    throw new Error('Google OAuth is not configured: GOOGLE_CLIENT_ID required')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}
