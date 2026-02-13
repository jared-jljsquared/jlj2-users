/**
 * Extract client credentials from URL-encoded form data (client_secret_post).
 */
export const extractClientCredentialsFromForm = (
  formData: URLSearchParams,
): { clientId: string; clientSecret: string } | null => {
  const clientId = formData.get('client_id')
  const clientSecret = formData.get('client_secret')

  if (clientId && clientSecret) {
    return { clientId, clientSecret }
  }
  return null
}

/**
 * Extract client credentials from Basic Authorization header (client_secret_basic).
 * Expects "Basic base64(client_id:client_secret)".
 */
export const extractClientCredentialsFromBasicAuthHeader = (
  authHeader: string | undefined,
): { clientId: string; clientSecret: string } | null => {
  if (!authHeader?.startsWith('Basic ')) {
    return null
  }
  try {
    const base64 = authHeader.slice(6)
    const decoded = atob(base64)
    const colonIndex = decoded.indexOf(':')
    if (colonIndex > 0) {
      const clientId = decoded.slice(0, colonIndex)
      const clientSecret = decoded.slice(colonIndex + 1)
      if (clientId && clientSecret) {
        return { clientId, clientSecret }
      }
    }
  } catch {
    // Fall through
  }
  return null
}
