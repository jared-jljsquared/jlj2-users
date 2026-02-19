# Step 10: Token Endpoint Implementation

## Overview
Create the token endpoint that issues access tokens, ID tokens, and refresh tokens with proper validation and security. This endpoint handles the authorization code exchange and refresh token flows.

## Implementation Summary

- **Migration**: `015-create-refresh-tokens-table.ts` - refresh_tokens table with token_value, client_id, user_id, scopes, expires_at
- **Note**: Revocation endpoint and token introspection (8.7) are deferred to Step 16
- **Types**: `src/database/types/refresh-token.ts` - RefreshToken, RefreshTokenInput
- **Storage**: `src/flows/refresh-token-storage.ts` - generateRefreshToken, consumeRefreshToken (30-day TTL, single-use with rotation)
- **Token**: `src/flows/token.ts` - handleRefreshTokenGrant, refresh_token in authorization_code response when client has refresh_token grant and scope includes offline_access

## Success Criteria
- [x] Token endpoint validates all request parameters
- [x] Access tokens are generated as JWTs with correct claims
- [x] ID tokens include all required OIDC claims
- [x] Refresh tokens are generated and stored securely
- [x] Token responses follow OAuth 2.0 format
- [x] Refresh token flow works correctly (with rotation)
- [x] Tokens are signed with provider's private key
- [x] Token expiration is properly set
- [x] All unit tests for token generation pass
- [x] Integration tests for token endpoint pass
