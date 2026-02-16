import type { ProviderUserInfo } from './types/provider-user-info.ts'
import {
  getXConfig,
  X_AUTH_URL,
  X_SCOPES,
  X_USER_INFO_URL,
} from './x-config.ts'

interface XUserResponse {
  data?: {
    id?: string
    name?: string
    username?: string
    profile_image_url?: string
    email?: string
  }
  errors?: Array<{ message?: string }>
}

/**
 * Validate an X access token and extract user information.
 * X uses OAuth 2.0 (access tokens), not OIDC (ID tokens).
 * Validates by calling the users/me endpoint with the Bearer token.
 */
export const validateXToken = async (
  accessToken: string,
): Promise<ProviderUserInfo> => {
  const { clientId, clientSecret } = getXConfig()
  if (!clientId || !clientSecret) {
    throw new Error(
      'X OAuth is not configured: X_CLIENT_ID and X_CLIENT_SECRET required',
    )
  }

  const userInfoUrl = new URL(X_USER_INFO_URL)
  userInfoUrl.searchParams.set(
    'user.fields',
    'id,name,username,profile_image_url,email',
  )

  const response = await fetch(userInfoUrl.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(
      `X token validation failed: ${response.status} ${response.statusText} ${errText}`,
    )
  }

  const data = (await response.json()) as XUserResponse

  if (data.errors?.length) {
    throw new Error(
      data.errors.map((e) => e.message).join('; ') || 'Invalid X token',
    )
  }

  const userData = data.data
  if (!userData?.id) {
    throw new Error('X user info did not return user id')
  }

  return {
    sub: userData.id,
    email: userData.email ?? '',
    name: userData.name ?? userData.username,
    picture: userData.profile_image_url,
  }
}

/**
 * Build the X OAuth authorization URL.
 * X requires PKCE; callers must pass code_challenge and code_challenge_method.
 */
export const getXAuthorizationUrl = (
  redirectUri: string,
  state: string,
  codeChallenge: string,
): string => {
  const { clientId } = getXConfig()
  if (!clientId) {
    throw new Error('X OAuth is not configured: X_CLIENT_ID required')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: X_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  return `${X_AUTH_URL}?${params.toString()}`
}
