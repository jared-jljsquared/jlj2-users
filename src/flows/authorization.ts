import type { Context } from 'hono'
import { getOidcConfig } from '../oidc/config.ts'
import { generateAuthorizationCode } from './authorization-code-storage.ts'
import { validateAuthorizationRequest } from './authorization-validation.ts'
import { escapeHtml } from './escape-html.ts'
import { getSessionCookieName, verifySessionToken } from './session.ts'

const buildRedirectUrl = (
  baseUrl: string,
  params: {
    code?: string
    error?: string
    error_description?: string
    state?: string | null
  },
): string => {
  const url = new URL(baseUrl)
  if (params.code) {
    url.searchParams.set('code', params.code)
  }
  if (params.error) {
    url.searchParams.set('error', params.error)
  }
  if (params.error_description) {
    url.searchParams.set('error_description', params.error_description)
  }
  if (params.state !== undefined && params.state !== null) {
    url.searchParams.set('state', params.state)
  }
  return url.toString()
}

/**
 * Render error page for invalid authorization requests.
 * Per OAuth 2.0 RFC 6749 §4.1.2.1: MUST NOT redirect to unvalidated redirect_uri.
 */
const renderAuthorizationError = (
  error: string,
  errorDescription?: string,
): string => {
  const desc = errorDescription ?? error
  return `<!DOCTYPE html>
<html>
<head><title>Authorization Error</title></head>
<body>
  <h1>Authorization Error</h1>
  <p><strong>${escapeHtml(error)}</strong></p>
  <p>${escapeHtml(desc)}</p>
</body>
</html>`
}

export const handleAuthorization = async (c: Context): Promise<Response> => {
  const params = c.req.query()
  const validation = await validateAuthorizationRequest({
    clientId: params.client_id,
    redirectUri: params.redirect_uri,
    responseType: params.response_type,
    scope: params.scope,
    state: params.state,
    codeChallenge: params.code_challenge,
    codeChallengeMethod: params.code_challenge_method,
    nonce: params.nonce,
  })

  if (!validation.isValid) {
    if (validation.redirectUri) {
      return c.redirect(
        buildRedirectUrl(validation.redirectUri, {
          error: validation.error,
          error_description: validation.errorDescription,
          state: validation.state ?? undefined,
        }),
        302,
      )
    }
    return c.html(
      renderAuthorizationError(validation.error, validation.errorDescription),
      400,
    )
  }

  const { data } = validation
  const sessionCookie = c.req.header('Cookie')
  const cookieMatch = sessionCookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${getSessionCookieName()}=`))
  const sessionToken = cookieMatch
    ? cookieMatch.substring(cookieMatch.indexOf('=') + 1).trim()
    : null

  const session = sessionToken ? verifySessionToken(sessionToken) : null

  if (!session) {
    const config = getOidcConfig()
    const currentUrl = new URL(c.req.url)
    const loginUrl = new URL(`${config.issuer}/login`)
    loginUrl.searchParams.set(
      'return_to',
      currentUrl.pathname + currentUrl.search,
    )
    return c.redirect(loginUrl.toString(), 302)
  }

  const code = await generateAuthorizationCode({
    client_id: data.clientId,
    redirect_uri: data.redirectUri,
    scopes: data.scopes,
    user_id: session.sub,
    code_challenge: data.codeChallenge,
    code_challenge_method: data.codeChallengeMethod,
    nonce: data.nonce,
  })

  return c.redirect(
    buildRedirectUrl(data.redirectUri, {
      code,
      state: data.state,
    }),
    302,
  )
}
