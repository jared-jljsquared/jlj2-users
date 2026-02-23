import type { Context } from 'hono'
import { isSecureRequest } from '../auth/auth-utils.ts'
import { getClientById } from '../clients/service.ts'
import { getOidcConfig } from '../oidc/config.ts'
import { parseJwt, verifyJwt } from '../tokens/jwt.ts'
import {
  getActiveKeyPair,
  getLatestActiveKey,
} from '../tokens/key-management.ts'
import { isValidRedirectUriFormat } from './input-validation.ts'
import { getSessionCookieName } from './session.ts'

/**
 * OIDC RP-Initiated Logout (End Session).
 * Clears the IdP session and optionally redirects to the RP.
 *
 * Query params: post_logout_redirect_uri, id_token_hint, state
 * When post_logout_redirect_uri is provided, id_token_hint is required to validate
 * that the redirect URI is registered for the client identified by the token's aud.
 */
export const handleEndSession = async (c: Context): Promise<Response> => {
  const postLogoutRedirectUri = c.req.query('post_logout_redirect_uri')?.trim()
  const idTokenHint = c.req.query('id_token_hint')?.trim()
  const state = c.req.query('state')?.trim()

  const config = getOidcConfig()
  const cookieName = getSessionCookieName()
  const secureFlag = isSecureRequest(c) ? '; Secure' : ''

  // Clear session cookie
  const clearCookie = `${cookieName}=; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=0`

  if (!postLogoutRedirectUri) {
    const res = c.redirect(`${config.issuer}/login`, 302)
    res.headers.append('Set-Cookie', clearCookie)
    return res
  }

  if (!idTokenHint) {
    // Cannot validate post_logout_redirect_uri without knowing the client
    const res = c.redirect(`${config.issuer}/login`, 302)
    res.headers.append('Set-Cookie', clearCookie)
    return res
  }

  if (!isValidRedirectUriFormat(postLogoutRedirectUri)) {
    const res = c.redirect(`${config.issuer}/login`, 302)
    res.headers.append('Set-Cookie', clearCookie)
    return res
  }

  let clientId: string
  try {
    const { header } = parseJwt(idTokenHint)
    const kid = header.kid as string | undefined
    const keyPair = kid ? getActiveKeyPair(kid) : getLatestActiveKey('RS256')
    if (!keyPair) {
      const res = c.redirect(`${config.issuer}/login`, 302)
      res.headers.append('Set-Cookie', clearCookie)
      return res
    }

    const { payload } = verifyJwt(
      idTokenHint,
      keyPair.publicKey,
      keyPair.algorithm,
    )

    if (payload.iss !== config.issuer) {
      const res = c.redirect(`${config.issuer}/login`, 302)
      res.headers.append('Set-Cookie', clearCookie)
      return res
    }

    const aud = payload.aud
    clientId = Array.isArray(aud) ? aud[0] : (aud as string)
    if (!clientId) {
      const res = c.redirect(`${config.issuer}/login`, 302)
      res.headers.append('Set-Cookie', clearCookie)
      return res
    }
  } catch {
    const res = c.redirect(`${config.issuer}/login`, 302)
    res.headers.append('Set-Cookie', clearCookie)
    return res
  }

  const client = await getClientById(clientId)
  if (!client || !client.redirectUris.includes(postLogoutRedirectUri)) {
    const res = c.redirect(`${config.issuer}/login`, 302)
    res.headers.append('Set-Cookie', clearCookie)
    return res
  }

  const redirectUrl = new URL(postLogoutRedirectUri)
  if (state) {
    redirectUrl.searchParams.set('state', state)
  }

  const res = c.redirect(redirectUrl.toString(), 302)
  res.headers.append('Set-Cookie', clearCookie)
  return res
}
