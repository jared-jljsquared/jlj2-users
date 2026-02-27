export const GOOGLE_DISCOVERY_URL =
  'https://accounts.google.com/.well-known/openid-configuration'
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export const GOOGLE_SCOPES = ['openid', 'profile', 'email'] as const

export const getGoogleConfig = (): {
  clientId: string
  clientSecret: string
  isConfigured: boolean
} => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? ''
  return {
    clientId,
    clientSecret,
    isConfigured: clientId.length > 0 && clientSecret.length > 0,
  }
}
