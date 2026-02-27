import { parseJwt, verifyJwt } from '../tokens/jwt.ts'
import { getMicrosoftConfig } from './microsoft-config.ts'
import { getMicrosoftPublicKeyByKid } from './microsoft-jwks.ts'
import type { ProviderUserInfo } from './types/provider-user-info.ts'

const MICROSOFT_ISSUER_PREFIX = 'https://login.microsoftonline.com/'

/**
 * Validate a Microsoft ID token and extract user information.
 * Verifies signature with Microsoft's JWKS, validates iss, aud, exp, nbf.
 * Uses oid (object ID) as subject identifier per Microsoft convention.
 */
export const validateMicrosoftToken = async (
  idToken: string,
  clientId?: string,
): Promise<ProviderUserInfo> => {
  const { header } = parseJwt(idToken)
  const kid = header.kid as string | undefined
  if (!kid) {
    throw new Error('Microsoft ID token missing kid in header')
  }

  const publicKey = await getMicrosoftPublicKeyByKid(kid)
  const { payload: verifiedPayload } = verifyJwt(idToken, publicKey, 'RS256')

  const iss = verifiedPayload.iss as string | undefined
  if (
    !iss ||
    typeof iss !== 'string' ||
    !iss.startsWith(MICROSOFT_ISSUER_PREFIX)
  ) {
    throw new Error('Invalid token issuer')
  }

  const expectedClientId = clientId ?? getMicrosoftConfig().clientId
  if (expectedClientId) {
    const aud = verifiedPayload.aud
    const audMatches =
      aud === expectedClientId ||
      (Array.isArray(aud) && aud.includes(expectedClientId))
    if (!audMatches) {
      throw new Error('Invalid token audience')
    }
  }

  const sub = (verifiedPayload.oid ?? verifiedPayload.sub) as string | undefined
  if (!sub) {
    throw new Error('Microsoft ID token missing oid/sub claim')
  }

  const email =
    (verifiedPayload.email as string) ??
    (verifiedPayload.preferred_username as string) ??
    ''

  return {
    sub,
    email,
    name: verifiedPayload.name as string | undefined,
    picture: verifiedPayload.picture as string | undefined,
    emailVerified: verifiedPayload.email_verified as boolean | undefined,
    givenName: verifiedPayload.given_name as string | undefined,
    familyName: verifiedPayload.family_name as string | undefined,
  }
}

/**
 * Build the Microsoft OAuth authorization URL for the authorization code flow.
 */
export const getMicrosoftAuthorizationUrl = (
  redirectUri: string,
  state: string,
): string => {
  const { clientId, tenant, apiVersion } = getMicrosoftConfig()
  if (!clientId) {
    throw new Error(
      'Microsoft OAuth is not configured: MICROSOFT_CLIENT_ID required',
    )
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    response_mode: 'query',
  })

  const tenantPath = tenant || 'common'
  return `https://login.microsoftonline.com/${tenantPath}/oauth2/${apiVersion}/authorize?${params.toString()}`
}
