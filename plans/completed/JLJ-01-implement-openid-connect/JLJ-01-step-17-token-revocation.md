# Step 17: Token Revocation and Introspection

## Overview
Implement token revocation endpoint (RFC 7009). Introspection endpoint (RFC 7662) deferred. Enables clients to revoke refresh tokens.

## Implementation Summary

- **Handler**: `src/flows/revoke.ts` - handleRevokeRequest
- **Route**: `POST /revoke`
- **Storage**: `revokeRefreshToken(token, clientId)` in `src/flows/refresh-token-storage.ts`

## Key Features

- RFC 7009 compliant: token, token_type_hint (optional), client authentication
- Client auth: client_secret_basic, client_secret_post; public clients with client_id
- Revokes refresh tokens by deleting from refresh_tokens and refresh_tokens_by_user
- Returns 200 even when token invalid (prevents enumeration)
- revocation_endpoint in OIDC discovery

## Sub-steps

### 17.1 Revocation Endpoint (RFC 7009) ✅
- `POST /revoke` — revoke refresh tokens
- Parameters: token, token_type_hint (optional), client authentication
- Revoke refresh token: remove from both tables

### 17.2–17.4
- Access token revocation: deferred (short-lived; revoke refresh token instead)
- Introspection endpoint: deferred
- Client authentication: client_secret_basic, client_secret_post, public client with client_id

## Success Criteria
- [x] POST /revoke invalidates refresh tokens
- [x] Revoked refresh tokens cannot be used
- [ ] Introspection returns token status (deferred)
- [x] Unit tests for revocation flow
