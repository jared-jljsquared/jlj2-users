import type { Context } from 'hono'
import { getOidcConfig } from './config.ts'

export const handleDiscovery = (c: Context) => {
  const config = getOidcConfig()

  const discoveryDocument = {
    issuer: config.issuer,
    authorization_endpoint: config.authorizationEndpoint,
    token_endpoint: config.tokenEndpoint,
    userinfo_endpoint: config.userinfoEndpoint,
    jwks_uri: config.jwksUri,
    response_types_supported: config.responseTypesSupported,
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256', 'ES256'],
    response_modes_supported: ['query', 'fragment'],
    grant_types_supported: config.grantTypesSupported,
    acr_values_supported: [],
    token_endpoint_auth_methods_supported:
      config.tokenEndpointAuthMethodsSupported,
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    display_values_supported: ['page'],
    claim_types_supported: ['normal'],
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'auth_time',
      'nonce',
      'email',
      'email_verified',
      'name',
      'given_name',
      'family_name',
      'picture',
    ],
    scopes_supported: config.scopesSupported,
    code_challenge_methods_supported: ['S256', 'plain'],
  }

  return c.json(discoveryDocument)
}
