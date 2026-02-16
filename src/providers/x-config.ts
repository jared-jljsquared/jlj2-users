export const X_AUTH_URL = 'https://twitter.com/i/oauth2/authorize'
export const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
export const X_USER_INFO_URL = 'https://api.twitter.com/2/users/me'

export const X_SCOPES = ['tweet.read', 'users.read', 'offline.access'] as const

export const getXConfig = (): {
  clientId: string
  clientSecret: string
  isConfigured: boolean
} => {
  const clientId = process.env.X_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.X_CLIENT_SECRET?.trim() ?? ''
  return {
    clientId,
    clientSecret,
    isConfigured: clientId.length > 0 && clientSecret.length > 0,
  }
}
