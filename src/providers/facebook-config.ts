const FACEBOOK_GRAPH_VERSION = 'v21.0'

export const FACEBOOK_AUTH_URL = `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`
export const FACEBOOK_TOKEN_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`
export const FACEBOOK_DEBUG_TOKEN_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/debug_token`
export const FACEBOOK_USER_INFO_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me`

export const FACEBOOK_SCOPES = ['email', 'public_profile'] as const

export const getFacebookConfig = (): {
  clientId: string
  clientSecret: string
  isConfigured: boolean
} => {
  const clientId = process.env.FACEBOOK_APP_ID?.trim() ?? ''
  const clientSecret = process.env.FACEBOOK_APP_SECRET?.trim() ?? ''
  return {
    clientId,
    clientSecret,
    isConfigured: clientId.length > 0 && clientSecret.length > 0,
  }
}
