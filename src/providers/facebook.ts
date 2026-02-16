import {
  FACEBOOK_AUTH_URL,
  FACEBOOK_DEBUG_TOKEN_URL,
  FACEBOOK_USER_INFO_URL,
  getFacebookConfig,
} from './facebook-config.ts'
import type { ProviderUserInfo } from './types/provider-user-info.ts'

interface DebugTokenResponse {
  data?: {
    is_valid?: boolean
    user_id?: string
    app_id?: string
  }
}

interface UserInfoResponse {
  id?: string
  name?: string
  email?: string
  picture?: {
    data?: {
      url?: string
    }
  }
}

/**
 * Validate a Facebook access token and extract user information.
 * Uses debug_token to validate, then fetches user info from Graph API.
 * Facebook uses OAuth 2.0 (access tokens), not OIDC (ID tokens).
 */
export const validateFacebookToken = async (
  accessToken: string,
): Promise<ProviderUserInfo> => {
  const { clientId, clientSecret } = getFacebookConfig()
  if (!clientId || !clientSecret) {
    throw new Error(
      'Facebook OAuth is not configured: FACEBOOK_APP_ID and FACEBOOK_APP_SECRET required',
    )
  }

  const appAccessToken = `${clientId}|${clientSecret}`

  const debugUrl = new URL(FACEBOOK_DEBUG_TOKEN_URL)
  debugUrl.searchParams.set('input_token', accessToken)
  debugUrl.searchParams.set('access_token', appAccessToken)

  const debugResponse = await fetch(debugUrl.toString())
  if (!debugResponse.ok) {
    throw new Error(
      `Facebook token validation failed: ${debugResponse.status} ${debugResponse.statusText}`,
    )
  }

  const debugData = (await debugResponse.json()) as DebugTokenResponse
  if (!debugData.data?.is_valid) {
    throw new Error('Invalid Facebook token')
  }

  const userId = debugData.data.user_id
  if (!userId) {
    throw new Error('Facebook token validation did not return user_id')
  }

  const userInfoUrl = new URL(FACEBOOK_USER_INFO_URL)
  userInfoUrl.searchParams.set('access_token', accessToken)
  userInfoUrl.searchParams.set('fields', 'id,name,email,picture')

  const userResponse = await fetch(userInfoUrl.toString())
  if (!userResponse.ok) {
    throw new Error(
      `Facebook user info fetch failed: ${userResponse.status} ${userResponse.statusText}`,
    )
  }

  const userData = (await userResponse.json()) as UserInfoResponse
  if (userData.id !== userId) {
    throw new Error('Facebook user ID mismatch')
  }

  return {
    sub: userData.id ?? userId,
    email: userData.email ?? '',
    name: userData.name,
    picture: userData.picture?.data?.url,
  }
}

/**
 * Build the Facebook OAuth authorization URL.
 */
export const getFacebookAuthorizationUrl = (
  redirectUri: string,
  state: string,
): string => {
  const { clientId } = getFacebookConfig()
  if (!clientId) {
    throw new Error(
      'Facebook OAuth is not configured: FACEBOOK_APP_ID required',
    )
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'email,public_profile',
    state,
  })

  return `${FACEBOOK_AUTH_URL}?${params.toString()}`
}
