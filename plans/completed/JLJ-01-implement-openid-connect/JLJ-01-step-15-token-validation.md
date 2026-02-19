# Step 15: Token Validation Middleware

## Overview
Create Hono middleware for validating access tokens and ID tokens in protected routes. Enables resource servers and API endpoints to verify Bearer tokens and extract user/subject information.

## Implementation Summary

- **Middleware**: `src/middleware/require-access-token.ts` - requireAccessToken, requireScope
- **Types**: `src/types/hono.d.ts` - ContextVariableMap for accessTokenPayload
- **Payload**: sub, scope, client_id, iss, aud, exp, iat, nbf

## Key Features

- Extracts Bearer token from Authorization header
- Verifies JWT signature using provider's key (getActiveKeyPair, getLatestActiveKey)
- Validates claims: iss, exp, nbf
- Attaches AccessTokenPayload to context via c.set('accessTokenPayload')
- Returns 401 with WWW-Authenticate on invalid/missing token
- Optional requireScope(scope) for scope checking

## Requirements Verification

| Requirement | Status |
|-------------|--------|
| Access Token Validation | ✅ |
| Middleware Interface (requireAccessToken) | ✅ |
| Scope Checking (requireScope) | ✅ |
| 401 with WWW-Authenticate | ✅ |
| Unit tests | ✅ |

## Success Criteria
- [x] Middleware validates Bearer tokens
- [x] Invalid tokens return 401
- [x] Valid tokens attach user context to request
- [x] Unit tests for middleware
