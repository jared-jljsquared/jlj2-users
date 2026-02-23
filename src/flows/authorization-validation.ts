import { getClientById } from '../clients/service.ts'
import {
  isCodeChallengeWithinLimit,
  isScopeWithinLimit,
  isStateWithinLimit,
  isValidRedirectUriFormat,
} from './input-validation.ts'

export interface ValidatedAuthorizationRequest {
  clientId: string
  redirectUri: string
  scopes: string[]
  state: string | null
  codeChallenge: string | null
  codeChallengeMethod: string | null
  nonce: string | null
  prompt: string | null
  maxAge: number | null
}

const VALID_PROMPT_VALUES = ['none', 'login', 'consent', 'select_account']

export const validateAuthorizationRequest = async (params: {
  clientId?: string
  redirectUri?: string
  responseType?: string
  scope?: string
  state?: string
  codeChallenge?: string
  codeChallengeMethod?: string
  nonce?: string
  prompt?: string
  max_age?: string
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

  if (!isValidRedirectUriFormat(params.redirectUri)) {
    return {
      isValid: false,
      error: 'invalid_request',
      errorDescription: 'redirect_uri must be a valid http or https URL',
    }
  }

  if (!isStateWithinLimit(params.state)) {
    return {
      isValid: false,
      error: 'invalid_request',
      errorDescription: 'state exceeds maximum length',
    }
  }

  if (!isScopeWithinLimit(params.scope)) {
    return {
      isValid: false,
      error: 'invalid_request',
      errorDescription: 'scope exceeds maximum length',
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

  if (!client.redirectUris.includes(params.redirectUri)) {
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
    client.tokenEndpointAuthMethod === 'none' &&
    !params.codeChallenge?.trim()
  ) {
    return {
      isValid: false,
      error: 'invalid_request',
      errorDescription: 'PKCE is required for public clients',
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

  if (params.prompt && !VALID_PROMPT_VALUES.includes(params.prompt)) {
    return {
      isValid: false,
      error: 'invalid_request',
      errorDescription: `prompt must be one of: ${VALID_PROMPT_VALUES.join(', ')}`,
      redirectUri: params.redirectUri,
      state: params.state ?? null,
    }
  }

  let maxAge: number | null = null
  if (params.max_age !== undefined && params.max_age !== '') {
    const parsed = parseInt(params.max_age, 10)
    if (Number.isNaN(parsed) || parsed < 0) {
      return {
        isValid: false,
        error: 'invalid_request',
        errorDescription: 'max_age must be a non-negative integer',
        redirectUri: params.redirectUri,
        state: params.state ?? null,
      }
    }
    maxAge = parsed
  }

  if (
    params.codeChallenge &&
    !isCodeChallengeWithinLimit(params.codeChallenge)
  ) {
    return {
      isValid: false,
      error: 'invalid_request',
      errorDescription: 'code_challenge exceeds maximum length',
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
      prompt:
        params.prompt?.trim() && VALID_PROMPT_VALUES.includes(params.prompt)
          ? params.prompt
          : null,
      maxAge,
    },
  }
}
