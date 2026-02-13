import { parseJwt, signJwt, verifyJwt } from '../tokens/jwt.ts'
import { getActiveKeyPair, initializeKeys } from '../tokens/key-management.ts'

const SESSION_COOKIE_NAME = 'oidc_session'
const SESSION_MAX_AGE_SECONDS = 15 * 60 // 15 minutes
const SESSION_TOKEN_PURPOSE = 'session'

export interface SessionPayload {
  sub: string
  iat: number
  exp: number
}

export const createSessionToken = (sub: string): string => {
  const keyPair = initializeKeys()
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
    purpose: SESSION_TOKEN_PURPOSE,
  }
  return signJwt(payload, keyPair.privateKey, 'RS256', keyPair.kid)
}

export const verifySessionToken = (token: string): SessionPayload | null => {
  try {
    const { header } = parseJwt(token)
    const kid = (header.kid as string) ?? initializeKeys().kid
    const keyPair = getActiveKeyPair(kid)
    if (!keyPair) {
      return null
    }

    const { payload } = verifyJwt(token, keyPair.publicKey, 'RS256')

    if (typeof payload.sub !== 'string' || !payload.sub) {
      return null
    }
    if (payload.purpose !== SESSION_TOKEN_PURPOSE) {
      return null
    }

    return {
      sub: payload.sub,
      iat: payload.iat as number,
      exp: payload.exp as number,
    }
  } catch {
    return null
  }
}

export const getSessionCookieName = (): string => SESSION_COOKIE_NAME
