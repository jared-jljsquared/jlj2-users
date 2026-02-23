export interface OidcConfig {
  issuer: string
  defaultAudience: string
  authorizationEndpoint: string
  tokenEndpoint: string
  userinfoEndpoint: string
  revocationEndpoint: string
  endSessionEndpoint: string
  introspectionEndpoint: string
  jwksUri: string
  registrationEndpoint?: string
  scopesSupported: string[]
  responseTypesSupported: string[]
  grantTypesSupported: string[]
  tokenEndpointAuthMethodsSupported: string[]
}
