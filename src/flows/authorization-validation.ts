import { getClientById, isRedirectUriAllowed } from '../clients/service.ts'

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
  | {
      isValid: false
      error: string
      errorDescription?: string
      redirectUri?: string
      state?: string | null
    }
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

  if (params.responseType !== 'code') {
    return {
      isValid: false,
      error: 'unsupported_response_type',
      errorDescription: 'response_type must be "code"',
      redirectUri: params.redirectUri,
      state: params.state ?? null,
    }
  }

  const scopes = params.scope?.split(/\s+/).filter((s) => s.length > 0) ?? []
  if (!scopes.includes('openid')) {
    return {
      isValid: false,
      error: 'invalid_scope',
      errorDescription: 'scope must include "openid"',
      redirectUri: params.redirectUri,
      state: params.state ?? null,
    }
  }

  if (!client.responseTypes.includes('code')) {
    return {
      isValid: false,
      error: 'unsupported_response_type',
      errorDescription:
        'Client is not registered for authorization code response type',
      redirectUri: params.redirectUri,
      state: params.state ?? null,
    }
  }

  const invalidScopes = scopes.filter((s) => !client.scopes.includes(s))
  if (invalidScopes.length > 0) {
    return {
      isValid: false,
      error: 'invalid_scope',
      errorDescription: `Invalid scope(s): ${invalidScopes.join(', ')}`,
      redirectUri: params.redirectUri,
      state: params.state ?? null,
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
      redirectUri: params.redirectUri,
      state: params.state ?? null,
    }
  }

  if (params.codeChallengeMethod && !params.codeChallenge) {
    return {
      isValid: false,
      error: 'invalid_request',
      errorDescription:
        'code_challenge is required when code_challenge_method is provided',
      redirectUri: params.redirectUri,
      state: params.state ?? null,
    }
  }

  return {
    isValid: true,
    data: {
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scopes,
      state: params.state ?? null,
      codeChallenge: params.codeChallenge?.trim() || null,
      codeChallengeMethod: params.codeChallengeMethod?.trim() || null,
      nonce: params.nonce?.trim() || null,
    },
  }
}
