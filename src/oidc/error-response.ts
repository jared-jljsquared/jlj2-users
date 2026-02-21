/**
 * OIDC/OAuth 2.0 compliant error response utilities.
 * RFC 6749 Section 5.2 (token endpoint), RFC 7009 (revocation), OIDC authorization errors.
 */

const DEFAULT_JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
} as const

/**
 * Returns a JSON error response for token, revoke, and similar endpoints.
 * Per RFC 6749 Section 5.2: error (required), error_description (optional).
 */
export const oidcJsonError = (
  error: string,
  errorDescription?: string,
  status = 400,
): Response =>
  new Response(
    JSON.stringify({
      error,
      ...(errorDescription && { error_description: errorDescription }),
    }),
    {
      status,
      headers: DEFAULT_JSON_HEADERS,
    },
  )

/**
 * Builds a redirect URL with OAuth error parameters.
 * Used for authorization endpoint errors when redirect_uri is validated.
 */
export const buildOidcRedirectUrl = (
  baseUrl: string,
  params: {
    error: string
    error_description?: string
    state?: string | null
  },
): string => {
  const url = new URL(baseUrl)
  url.searchParams.set('error', params.error)
  if (params.error_description) {
    url.searchParams.set('error_description', params.error_description)
  }
  if (params.state !== undefined && params.state !== null) {
    url.searchParams.set('state', params.state)
  }
  return url.toString()
}
