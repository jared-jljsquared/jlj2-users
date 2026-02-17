# Step 16: UserInfo Endpoint

## Overview
Implement the OIDC UserInfo endpoint that returns user claims for authenticated requests. The endpoint is advertised in discovery (`userinfo_endpoint`) and requires a valid access token.

## Implementation Summary

- **Handler**: `src/flows/userinfo.ts` - handleUserInfo
- **Route**: `GET /userinfo` with requireAccessToken middleware
- **Storage**: `findContactMethodsByAccountId` in `src/users/storage.ts` for emails and phone numbers

## Key Features

- Bearer token validation via requireAccessToken middleware
- Scope-based claims: sub (always), email/profile (when scope granted)
- When email scope: `email`, `email_verified`, `emails` array, `phone_numbers` array
- When profile scope: `name`, `given_name`, `family_name`, `picture`
- 404 when user not found, 403 when user inactive
- Cache-Control: no-store, Pragma: no-cache

## Sub-steps

### 16.1 Endpoint Specification
- `GET /userinfo` — requires Bearer token in Authorization header
- Returns JSON with user claims per OIDC Core 1.0
- Supports `claims` parameter for requesting specific claims (optional)

### 16.2 Required Claims
Return claims based on token scopes and user data:
- `sub` (required) — subject identifier
- `email`, `email_verified`, `emails`, `phone_numbers` — when email scope granted
- `name`, `given_name`, `family_name`, `picture` — when profile scope granted

### 16.3 Error Responses
- 401 when token missing or invalid
- 403 when user inactive
- 404 when user not found

### 16.4 Token Validation
- Use Token Validation Middleware (Step 15) to validate access token
- Look up user by sub from token
- Return user claims from database and contact_methods_by_account

## Success Criteria
- [x] GET /userinfo returns user claims with valid token
- [x] Invalid token returns 401
- [x] Claims match requested scopes
- [x] Unit tests for endpoint
- [x] Returns emails and phone_numbers arrays when email scope granted
