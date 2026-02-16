# Step 16: UserInfo Endpoint

## Overview
Implement the OIDC UserInfo endpoint that returns user claims for authenticated requests. The endpoint is advertised in discovery (`userinfo_endpoint`) and requires a valid access token.

## Sub-steps

### 16.1 Endpoint Specification
- `GET /userinfo` — requires Bearer token in Authorization header
- Returns JSON with user claims per OIDC Core 1.0
- Supports `claims` parameter for requesting specific claims (optional)

### 16.2 Required Claims
Return claims based on token scopes and user data:
- `sub` (required) — subject identifier
- `email`, `email_verified` — when email scope granted
- `name`, `given_name`, `family_name`, `picture` — when profile scope granted

### 16.3 Error Responses
- 401 when token missing or invalid
- 403 when token expired (include error in WWW-Authenticate)

### 16.4 Token Validation
- Use Token Validation Middleware (Step 15) to validate access token
- Look up user by sub from token
- Return user claims from database

## Implementation Notes

- Placeholder exists at `src/flows/userinfo.ts`
- Discovery already advertises `userinfo_endpoint` in config
- Mount `GET /userinfo` in flows or app routes

## Success Criteria
- [ ] GET /userinfo returns user claims with valid token
- [ ] Invalid token returns 401
- [ ] Claims match requested scopes
- [ ] Unit tests for endpoint
