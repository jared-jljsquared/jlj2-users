/**
 * OAuth 2.0 / OIDC input validation helpers.
 * Used for authorization params, token params, and client registration.
 */

export const MAX_STATE_LENGTH = 512
export const MAX_SCOPE_LENGTH = 2048
export const MAX_CODE_CHALLENGE_LENGTH = 128

/**
 * Validates redirect_uri format per OAuth 2.0.
 * Must be absolute URI with http or https protocol.
 * Rejects javascript:, data:, file:, etc.
 */
export const isValidRedirectUriFormat = (uri: string): boolean => {
  try {
    const parsed = new URL(uri)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const isStateWithinLimit = (state: string | undefined): boolean => {
  if (!state) return true
  return state.length <= MAX_STATE_LENGTH
}

export const isScopeWithinLimit = (scope: string | undefined): boolean => {
  if (!scope) return true
  return scope.length <= MAX_SCOPE_LENGTH
}

export const isCodeChallengeWithinLimit = (
  challenge: string | undefined,
): boolean => {
  if (!challenge) return true
  return challenge.length <= MAX_CODE_CHALLENGE_LENGTH
}
