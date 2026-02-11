import { getClientById, isRedirectUriAllowed } from '../clients/service.ts'

export interface AuthorizationValidationResult {
  isValid: boolean
  error?: string
  errorDescription?: string
}

export interface ValidatedAuthorizationRequest {
  clientId: string
  redirectUri: string
  scopes: string[]
  state: string | null
  codeChallenge: string | null
  codeChallengeMethod: string | null
  nonce: string | null
}

export const validateAuthorizationRequest = async (params: {
  clientId?: string
  redirectUri?: string
  responseType?: string
  scope?: string
  state?: string
  codeChallenge?: string
  codeChallengeMethod?: string
  nonce?: string
}): Promise<
  | { isValid: true; data: ValidatedAuthorizationRequest }
  | { isValid: false; error: string; errorDescription?: string }
> => {
  if (!params.clientId?.trim()) {
    return {
      isValid: false,
      error: 'invalid_request',
      errorDescription: 'client_id is required',
    }
  }

  if (!params.redirectUri?.trim()) {
    return {
      isValid: false,
      error: 'invalid_request',
      errorDescription: 'redirect_uri is required',
    }
  }

  if (params.responseType !== 'code') {
    return {
      isValid: false,
      error: 'unsupported_response_type',
      errorDescription: 'response_type must be "code"',
    }
  }

  if (!params.scope?.includes('openid')) {
    return {
      isValid: false,
      error: 'invalid_scope',
      errorDescription: 'scope must include "openid"',
    }
  }

  const client = await getClientById(params.clientId)
  if (!client) {
    return {
      isValid: false,
      error: 'invalid_client',
      errorDescription: 'Unknown client',
    }
  }

  const isRedirectAllowed = await isRedirectUriAllowed(
    params.clientId,
    params.redirectUri,
  )
  if (!isRedirectAllowed) {
    return {
      isValid: false,
      error: 'invalid_request',
      errorDescription: 'redirect_uri is not registered for this client',
    }
  }

  const scopes = params.scope.split(/\s+/).filter((s) => s.length > 0)
  const invalidScopes = scopes.filter((s) => !client.scopes.includes(s))
  if (invalidScopes.length > 0) {
    return {
      isValid: false,
      error: 'invalid_scope',
      errorDescription: `Invalid scope(s): ${invalidScopes.join(', ')}`,
    }
  }

  if (
    params.codeChallengeMethod &&
    !['S256', 'plain'].includes(params.codeChallengeMethod)
  ) {
    return {
      isValid: false,
      error: 'invalid_request',
      errorDescription: 'code_challenge_method must be S256 or plain',
    }
  }

  if (params.codeChallengeMethod && !params.codeChallenge) {
    return {
      isValid: false,
      error: 'invalid_request',
      errorDescription:
        'code_challenge is required when code_challenge_method is provided',
    }
  }

  return {
    isValid: true,
    data: {
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scopes,
      state: params.state?.trim() || null,
      codeChallenge: params.codeChallenge?.trim() || null,
      codeChallengeMethod: params.codeChallengeMethod?.trim() || null,
      nonce: params.nonce?.trim() || null,
    },
  }
}
