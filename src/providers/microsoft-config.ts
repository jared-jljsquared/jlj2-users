export const MICROSOFT_DISCOVERY_URL =
  'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration'
export const MICROSOFT_JWKS_URL =
  'https://login.microsoftonline.com/common/discovery/v2.0/keys'
export const MICROSOFT_AUTH_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
export const MICROSOFT_TOKEN_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/token'

export const MICROSOFT_SCOPES = ['openid', 'profile', 'email'] as const

export const getMicrosoftConfig = (): {
  clientId: string
  clientSecret: string
  tenant: string
  isConfigured: boolean
} => {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? ''
  const tenant = process.env.MICROSOFT_TENANT?.trim() ?? 'common'
  return {
    clientId,
    clientSecret,
    tenant,
    isConfigured: clientId.length > 0 && clientSecret.length > 0,
  }
}
