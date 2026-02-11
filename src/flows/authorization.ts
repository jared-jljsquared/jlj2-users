import type { Context } from 'hono'
import { getOidcConfig } from '../oidc/config.ts'
import { generateAuthorizationCode } from './authorization-code-storage.ts'
import { validateAuthorizationRequest } from './authorization-validation.ts'
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
  if (params.state) {
    url.searchParams.set('state', params.state)
  }
  return url.toString()
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
    return c.redirect(
      buildRedirectUrl(params.redirect_uri ?? '', {
        error: validation.error,
        error_description: validation.errorDescription,
        state: params.state ?? null,
      }),
      302,
    )
  }

  const { data } = validation
  const sessionCookie = c.req.header('Cookie')
  const sessionToken = sessionCookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${getSessionCookieName()}=`))
    ?.split('=')[1]
    ?.trim()

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
