import type { Context } from 'hono'
import { log } from '../plumbing/logger.ts'
import { setSessionCookieAndRedirect } from './auth-utils.ts'
import { consumeOAuthState } from './oauth-state-storage.ts'

export interface OAuthCallbackConfig {
  isConfigured: boolean
  clientId: string
  clientSecret: string
}

export interface OAuthCallbackStateData {
  returnTo: string
  codeVerifier?: string
}

export type ExchangeAndAuthenticateFn = (params: {
  code: string
  redirectUri: string
  stateData: OAuthCallbackStateData
  clientId: string
  clientSecret: string
}) => Promise<{ sub: string }>

export interface HandleOAuthCallbackOptions {
  provider: string
  getConfig: () => OAuthCallbackConfig
  getRedirectUri: () => string
  exchangeAndAuthenticate: ExchangeAndAuthenticateFn
  /** When true, redirects with invalid_state if stateData.codeVerifier is missing (e.g. PKCE flow) */
  requireCodeVerifier?: boolean
}

/**
 * Generic OAuth callback handler. Validates state/code, consumes state,
 * delegates token exchange and authentication to the provider-specific function,
 * then sets session cookie and redirects.
 */
export const handleOAuthCallback = async (
  c: Context,
  options: HandleOAuthCallbackOptions,
): Promise<Response> => {
  const {
    provider,
    getConfig,
    getRedirectUri,
    exchangeAndAuthenticate,
    requireCodeVerifier = false,
  } = options

  const { isConfigured, clientId, clientSecret } = getConfig()
  if (!isConfigured) {
    return c.redirect(`/login?error=${provider}_not_configured`, 302)
  }

  const state = c.req.query('state')
  const code = c.req.query('code')
  const errorParam = c.req.query('error')

  if (errorParam) {
    return c.redirect(
      `/login?error=${encodeURIComponent(`${provider}_${errorParam}`)}`,
      302,
    )
  }

  if (!state || !code) {
    return c.redirect('/login?error=missing_callback_params', 302)
  }

  const stateData = await consumeOAuthState(state)
  if (!stateData) {
    return c.redirect('/login?error=invalid_state', 302)
  }

  if (requireCodeVerifier && !stateData.codeVerifier) {
    return c.redirect('/login?error=invalid_state', 302)
  }

  const { returnTo } = stateData

  try {
    const redirectUri = getRedirectUri()
    const user = await exchangeAndAuthenticate({
      code,
      redirectUri,
      stateData,
      clientId,
      clientSecret,
    })
    return setSessionCookieAndRedirect(c, user.sub, returnTo)
  } catch (err) {
    log({
      message: `${provider} auth failed`,
      error: err instanceof Error ? err.message : String(err),
    })
    const errorParam =
      err instanceof Error &&
      typeof (err as Error & { redirectErrorParam?: string })
        .redirectErrorParam === 'string'
        ? (err as Error & { redirectErrorParam: string }).redirectErrorParam
        : `${provider}_auth_failed`
    return c.redirect(
      `/login?return_to=${encodeURIComponent(returnTo)}&error=${encodeURIComponent(errorParam)}`,
      302,
    )
  }
}
