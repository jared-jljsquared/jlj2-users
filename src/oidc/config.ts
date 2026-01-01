import type { OidcConfig } from './types/oidc-config.ts'

export const getOidcConfig = (): OidcConfig => {
  const port = Number(process.env.PORT) || 3000
  const issuer = process.env.OIDC_ISSUER || `http://localhost:${port}`

  return {
    issuer,
    authorizationEndpoint: `${issuer}/authorize`,
    tokenEndpoint: `${issuer}/token`,
    userinfoEndpoint: `${issuer}/userinfo`,
    jwksUri: `${issuer}/.well-known/jwks.json`,
    scopesSupported: ['openid', 'profile', 'email'],
    responseTypesSupported: ['code'],
    grantTypesSupported: ['authorization_code', 'refresh_token'],
    tokenEndpointAuthMethodsSupported: [
      'client_secret_basic',
      'client_secret_post',
    ],
  }
}
