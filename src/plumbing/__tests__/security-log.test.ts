import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logSecurityEvent } from '../security-log.ts'

const logSpy = vi.spyOn(console, 'log')

beforeEach(() => {
  logSpy.mockClear()
})

describe('logSecurityEvent', () => {
  it('logs auth_success event', () => {
    logSecurityEvent({
      event: 'auth_success',
      user_id: 'user-123',
      provider: 'google',
    })
    expect(logSpy).toHaveBeenCalledTimes(1)
    const call = logSpy.mock.calls[0][0]
    expect(call).toMatchObject({
      message: 'Security event',
      security_event: {
        event: 'auth_success',
        user_id: 'user-123',
        provider: 'google',
      },
    })
  })

  it('logs auth_failure event', () => {
    logSecurityEvent({
      event: 'auth_failure',
      provider: 'password',
      reason: 'invalid_credentials',
    })
    expect(logSpy).toHaveBeenCalledTimes(1)
    const call = logSpy.mock.calls[0][0]
    expect(call.security_event).toMatchObject({
      event: 'auth_failure',
      provider: 'password',
      reason: 'invalid_credentials',
    })
  })

  it('logs token_issued event', () => {
    logSecurityEvent({
      event: 'token_issued',
      user_id: 'user-456',
      client_id: 'client-789',
      grant_type: 'authorization_code',
    })
    expect(logSpy).toHaveBeenCalledTimes(1)
    const call = logSpy.mock.calls[0][0]
    expect(call.security_event).toMatchObject({
      event: 'token_issued',
      user_id: 'user-456',
      client_id: 'client-789',
      grant_type: 'authorization_code',
    })
  })

  it('logs token_revoked event', () => {
    logSecurityEvent({
      event: 'token_revoked',
      client_id: 'client-abc',
      revoked: true,
    })
    expect(logSpy).toHaveBeenCalledTimes(1)
    const call = logSpy.mock.calls[0][0]
    expect(call.security_event).toMatchObject({
      event: 'token_revoked',
      client_id: 'client-abc',
      revoked: true,
    })
  })
})
