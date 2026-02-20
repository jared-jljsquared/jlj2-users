# Step 11: Google OIDC Integration - Implementation Plan

## Overview
Implement Google OIDC provider integration for accepting and validating Google ID tokens. This enables users to sign in with Google and optionally link Google accounts to existing local accounts.

## Sub-steps

### 11.1 Provider Configuration
- Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars
- Discovery URL: `https://accounts.google.com/.well-known/openid-configuration`
- JWKS URL: `https://www.googleapis.com/oauth2/v3/certs`
- Scopes: `openid`, `profile`, `email`

### 11.2 Provider Discovery and JWKS
- Fetch and cache Google JWKS
- Parse JWK to KeyObject for verifyJwt (Node crypto supports JWK format)
- Cache keys with TTL (respect Cache-Control from Google)
- Handle key rotation (lookup by kid from token header)

### 11.3 Token Validation
- Parse JWT header to get `kid`
- Fetch public key for kid from cached JWKS
- Verify signature with verifyJwt (RS256)
- Validate claims: iss (`https://accounts.google.com` or `accounts.google.com`), aud (matches client ID), exp, nbf

### 11.4 User Information Extraction
- Extract sub, email, email_verified, name, picture, given_name, family_name from payload
- Return ProviderUserInfo interface

### 11.5 Account Linking / Authentication
- If provider account exists: find user by account_id, create session
- If user exists by email: link provider account, create session
- If no user: create new user (passwordless), link provider account, create session

### 11.6 Routes
- `GET /auth/google` - Redirect to Google authorization URL
- `GET /auth/google/callback` - Handle callback with `code`, exchange for tokens, validate id_token, authenticate/link

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/providers/types/provider-user-info.ts` | Create - ProviderUserInfo interface |
| `src/providers/google-config.ts` | Create - Google config from env |
| `src/providers/google-jwks.ts` | Create - JWKS fetch and cache |
| `src/providers/google.ts` | Implement - validateGoogleToken, getAuthorizationUrl |
| `src/auth/google-routes.ts` | Create - /auth/google, /auth/google/callback |
| `src/users/service.ts` | Add authenticateWithGoogle |
| `src/app.ts` | Mount auth routes |
| `src/providers/__tests__/google.test.ts` | Create - unit tests |

## Success Criteria
- [x] Google ID tokens can be validated
- [x] User information is correctly extracted
- [x] New users can sign in with Google (account created)
- [x] Existing users can sign in with Google (account linked by email)
- [x] Already-linked Google accounts sign in directly
- [x] Authorization URL generation works
- [x] Callback exchanges code for tokens and validates id_token
- [x] Unit tests pass
