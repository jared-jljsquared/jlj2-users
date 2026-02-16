# Step 15: Token Validation Middleware

## Overview
Create Hono middleware for validating access tokens and ID tokens in protected routes. This enables resource servers and API endpoints to verify Bearer tokens and extract user/subject information.

## Sub-steps

### 15.1 Access Token Validation
- Extract Bearer token from `Authorization` header
- Verify JWT signature using provider's JWKS
- Validate claims: iss, aud, exp, nbf
- Extract sub (user identifier) for downstream use

### 15.2 Middleware Interface
- Create `requireAccessToken` middleware
- Attach validated payload (sub, scope, client_id) to context
- Return 401 with `WWW-Authenticate: Bearer` on invalid/missing token

### 15.3 Optional: ID Token Validation
- Support validating ID tokens when passed as Bearer (e.g. for back-channel flows)
- Validate nonce if present

### 15.4 Scope Checking
- Optional: validate requested scope against token's scope claim
- Support scope format: space-separated list

## Implementation Notes

- Reuse `verifyJwt` from `src/tokens/jwt.ts`
- Use `getActiveKeyPair` from `src/tokens/key-management.ts` for signature verification
- Access tokens from token endpoint include: iss, sub, aud, exp, iat, scope, client_id

## Success Criteria
- [ ] Middleware validates Bearer tokens
- [ ] Invalid tokens return 401
- [ ] Valid tokens attach user context to request
- [ ] Unit tests for middleware
