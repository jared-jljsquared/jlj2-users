# Step 9: Authorization Code Flow

## Overview

Implement the OAuth 2.0 authorization code flow including authorization endpoint, token endpoint, and redirect URI handling. This is the primary flow for OIDC authentication.

## Sub-steps

### 9.1 Authorization Request Validation ✅

Validate incoming authorization requests:

- `client_id` - Must be registered
- `redirect_uri` - Must match registered redirect URI
- `response_type` - Must be 'code'
- `scope` - Must include 'openid'
- `state` - Preserved through flow (CSRF protection)
- `code_challenge` and `code_challenge_method` (PKCE support)

### 9.2 Authorization Endpoint ✅

Implement `/authorize` endpoint that:

- Validates the authorization request
- Redirects to login page when user not authenticated
- Generates authorization code after login
- Stores authorization code with metadata
- Redirects to client's redirect_uri with code and state

### 9.3 Authorization Code Storage ✅

Create database-backed storage for authorization codes:

- Migration `013-create-authorization-codes-table.ts`
- Store code with client_id, redirect_uri, scopes, user_id, code_challenge, nonce
- 10-minute expiration
- Single-use (deleted on consume)

### 9.4 Token Exchange Request Validation ✅

Validate token exchange requests:

- `grant_type` - Must be 'authorization_code'
- `code` - Must be valid and not expired
- `redirect_uri` - Must match the one used in authorization
- Client authentication (Basic or POST body)
- `code_verifier` - Must match code_challenge (if PKCE was used)

### 9.5 Token Exchange Implementation ✅

Implement token exchange logic:

- Verify authorization code
- Verify client credentials
- Verify PKCE code_verifier if applicable
- Generate access token (JWT) and ID token (JWT)
- Invalidate authorization code (one-time use)
- Return tokens to client

### 9.6 Redirect URI Handling ✅

Implement secure redirect URI validation:

- Exact match against registered URIs
- Validated via `isRedirectUriAllowed` before redirect

### 9.7 Session and Login ✅

- JWT-based session cookie (oidc_session)
- GET /login - HTML form for email/password
- POST /login - authenticate, set session, redirect to return_to

## Implementation Summary

- **Migration**: `013-create-authorization-codes-table.ts`
- **Storage**: `src/flows/authorization-code-storage.ts` - generateAuthorizationCode, consumeAuthorizationCode
- **PKCE**: `src/flows/pkce.ts` - verifyCodeVerifier, generateCodeChallenge
- **Validation**: `src/flows/authorization-validation.ts` - validateAuthorizationRequest
- **Session**: `src/flows/session.ts` - createSessionToken, verifySessionToken
- **Authorization**: `src/flows/authorization.ts` - handleAuthorization
- **Token**: `src/flows/token.ts` - handleTokenRequest (access_token, id_token)
- **Routes**: `src/flows/routes.ts` - /authorize, /token, /login (GET/POST)

## Success Criteria

- [x] Authorization endpoint validates all required parameters
- [x] Authorization codes are generated securely
- [x] Authorization codes expire after 10 minutes
- [x] Authorization codes are single-use
- [x] Token exchange validates code and client credentials
- [x] PKCE code_verifier is validated correctly
- [x] Redirect URIs are validated securely
- [x] State parameter is preserved through the flow
- [x] All unit tests for authorization flow pass
- [x] Integration tests for authorization endpoint pass
