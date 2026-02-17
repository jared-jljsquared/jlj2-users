import { log } from '../plumbing/logger.ts'
import type { OidcConfig } from './types/oidc-config.ts'

let cachedConfig: OidcConfig | null = null

const validateConfig = (config: OidcConfig): void => {
  const errors: string[] = []

  if (!config.issuer || config.issuer.trim() === '') {
    errors.push('OIDC issuer must be set')
  }

  if (!config.issuer.match(/^https?:\/\//)) {
    errors.push('OIDC issuer must be a valid URL (http:// or https://)')
  }

  if (!config.scopesSupported.includes('openid')) {
    errors.push('OIDC must support the "openid" scope')
  }

  if (config.responseTypesSupported.length === 0) {
    errors.push('At least one response type must be supported')
  }

  if (config.grantTypesSupported.length === 0) {
    errors.push('At least one grant type must be supported')
  }

  if (errors.length > 0) {
    throw new Error(
      `OIDC configuration validation failed:\n${errors.join('\n')}`,
    )
  }
}

export const getOidcConfig = (): OidcConfig => {
  if (cachedConfig) {
    return cachedConfig
  }

  const port = Number(process.env.PORT) || 3000
  const issuerEnv = process.env.OIDC_ISSUER
  // If OIDC_ISSUER is explicitly set but empty, that's an error
  // If it's not set at all, use the default
  const issuer =
    issuerEnv !== undefined ? issuerEnv.trim() : `http://localhost:${port}`

  const defaultAudienceRaw = process.env.OIDC_DEFAULT_AUDIENCE?.trim()
  const defaultAudience =
    defaultAudienceRaw && defaultAudienceRaw.length > 0
      ? defaultAudienceRaw
      : 'jlj-squared-development'

  const config: OidcConfig = {
    issuer,
    defaultAudience,
    authorizationEndpoint: `${issuer}/authorize`,
    tokenEndpoint: `${issuer}/token`,
    userinfoEndpoint: `${issuer}/userinfo`,
    revocationEndpoint: `${issuer}/revoke`,
    jwksUri: `${issuer}/.well-known/jwks.json`,
    scopesSupported: ['openid', 'profile', 'email', 'offline_access'],
    responseTypesSupported: ['code'],
    grantTypesSupported: ['authorization_code', 'refresh_token'],
    tokenEndpointAuthMethodsSupported: [
      'client_secret_basic',
      'client_secret_post',
      'none',
    ],
  }

  validateConfig(config)
  cachedConfig = config

  log('OIDC configuration validated and loaded')

  return config
}

export const clearConfigCache = (): void => {
  cachedConfig = null
}
