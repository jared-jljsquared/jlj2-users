import crypto from 'node:crypto'
import { base64UrlDecode, base64UrlEncode } from '../tokens/jwt.ts'
import { getActiveKeyPair, initializeKeys } from '../tokens/key-management.ts'

const SESSION_COOKIE_NAME = 'oidc_session'
const SESSION_MAX_AGE_SECONDS = 15 * 60 // 15 minutes

export interface SessionPayload {
  sub: string
  iat: number
  exp: number
}

export const createSessionToken = (sub: string): string => {
  const keyPair = getActiveKeyPair(initializeKeys().kid) ?? initializeKeys()
  const header = { alg: 'RS256', typ: 'JWT', kid: keyPair.kid }
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = {
    sub,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  }

  const encodedHeader = base64UrlEncode(
    Buffer.from(JSON.stringify(header), 'utf8'),
  )
  const encodedPayload = base64UrlEncode(
    Buffer.from(JSON.stringify(payload), 'utf8'),
  )
  const signatureInput = `${encodedHeader}.${encodedPayload}`

  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signatureInput)
  sign.end()
  const signature = base64UrlEncode(
    Buffer.from(sign.sign(keyPair.privateKey, 'base64'), 'base64'),
  )

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

export const verifySessionToken = (token: string): SessionPayload | null => {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts
    const header = JSON.parse(
      base64UrlDecode(encodedHeader).toString('utf8'),
    ) as { kid?: string; alg: string }
    const payload = JSON.parse(
      base64UrlDecode(encodedPayload).toString('utf8'),
    ) as SessionPayload

    const now = Math.floor(Date.now() / 1000)
    if (payload.exp < now || !payload.sub) {
      return null
    }

    const keyPair = header.kid
      ? getActiveKeyPair(header.kid)
      : getActiveKeyPair(initializeKeys().kid)
    if (!keyPair) {
      return null
    }

    const signatureInput = `${encodedHeader}.${encodedPayload}`
    const sign = crypto.createVerify('RSA-SHA256')
    sign.update(signatureInput)
    sign.end()

    const signatureBuffer = base64UrlDecode(encodedSignature)
    const isValid = sign.verify(keyPair.publicKey, signatureBuffer)
    if (!isValid) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export const getSessionCookieName = (): string => SESSION_COOKIE_NAME
