# Step 17: Token Revocation and Introspection

## Overview
Implement token revocation endpoint and optional token introspection endpoint. Deferred from Step 10 (Token Endpoint Extensions). Enables clients to revoke tokens and resource servers to check token status.

## Sub-steps

### 17.1 Revocation Endpoint (RFC 7009)
- `POST /revoke` — revoke access or refresh tokens
- Parameters: token, token_type_hint (optional), client authentication
- Revoke refresh token: remove from refresh_tokens table (or mark revoked)
- Revoke access token: add to revoked-token store (optional; access tokens are short-lived)

### 17.2 Revoked Token Storage
- Store revoked refresh tokens (or token identifiers) for revocation
- Optional: store revoked access token jti for introspection
- TTL: retain until token would have expired

### 17.3 Introspection Endpoint (RFC 7662, optional)
- `POST /introspect` — check token status
- Returns: active (boolean), exp, scope, sub, client_id, etc.
- Requires client authentication (resource server credentials)

### 17.4 Client Authentication
- Revocation and introspection require client authentication
- Support client_secret_basic and client_secret_post

## Implementation Notes

- Refresh tokens already stored in `refresh_tokens` table
- Add `revoked_tokens` table or similar for tracking revoked tokens
- Access tokens are JWTs; no server-side storage by default. Revocation typically invalidates refresh token; access token expires naturally.

## Success Criteria
- [ ] POST /revoke invalidates refresh tokens
- [ ] Revoked refresh tokens cannot be used
- [ ] Optional: introspection returns token status
- [ ] Unit tests for revocation flow
