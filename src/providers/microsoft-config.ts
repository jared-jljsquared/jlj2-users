const getMicrosoftApiVersion = (): string =>
  process.env.MICROSOFT_API_VERSION?.trim() ?? 'v2.0'

const MICROSOFT_API_VERSION = getMicrosoftApiVersion()

export const MICROSOFT_DISCOVERY_URL = `https://login.microsoftonline.com/common/${MICROSOFT_API_VERSION}/.well-known/openid-configuration`
export const MICROSOFT_JWKS_URL = `https://login.microsoftonline.com/common/discovery/${MICROSOFT_API_VERSION}/keys`
export const MICROSOFT_AUTH_URL = `https://login.microsoftonline.com/common/oauth2/${MICROSOFT_API_VERSION}/authorize`
export const MICROSOFT_TOKEN_URL = `https://login.microsoftonline.com/common/oauth2/${MICROSOFT_API_VERSION}/token`

export const MICROSOFT_SCOPES = ['openid', 'profile', 'email'] as const

export const getMicrosoftConfig = (): {
  clientId: string
  clientSecret: string
  tenant: string
  apiVersion: string
  isConfigured: boolean
} => {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? ''
  const tenant = process.env.MICROSOFT_TENANT?.trim() ?? 'common'
  const apiVersion = getMicrosoftApiVersion()
  return {
    clientId,
    clientSecret,
    tenant,
    apiVersion,
    isConfigured: clientId.length > 0 && clientSecret.length > 0,
  }
}
