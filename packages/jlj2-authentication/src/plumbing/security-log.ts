/**
 * Security and audit logging.
 * Logs authentication events, token events, and failures.
 * Never logs passwords, tokens, or secrets.
 */

import { log } from './logger.ts'

export interface AuthSuccessEvent {
  event: 'auth_success'
  user_id: string
  provider?: 'password' | 'google' | 'microsoft' | 'facebook' | 'x'
  client_id?: string
}

export interface AuthFailureEvent {
  event: 'auth_failure'
  provider?: 'password' | 'google' | 'microsoft' | 'facebook' | 'x'
  reason?: string
  client_id?: string
}

export interface TokenIssuedEvent {
  event: 'token_issued'
  user_id: string
  client_id: string
  grant_type: 'authorization_code' | 'refresh_token'
}

export interface TokenRevokedEvent {
  event: 'token_revoked'
  client_id: string
  /** Whether a token was actually found and revoked */
  revoked: boolean
}

export type SecurityEvent =
  | AuthSuccessEvent
  | AuthFailureEvent
  | TokenIssuedEvent
  | TokenRevokedEvent

export const logSecurityEvent = (event: SecurityEvent): void => {
  log({
    message: 'Security event',
    security_event: event,
  })
}
