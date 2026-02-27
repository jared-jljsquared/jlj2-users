/**
 * User information extracted from an external identity provider's token.
 * Normalized across Google, Microsoft, and Facebook.
 */
export interface ProviderUserInfo {
  sub: string
  email: string
  name?: string
  picture?: string
  emailVerified?: boolean
  givenName?: string
  familyName?: string
}
