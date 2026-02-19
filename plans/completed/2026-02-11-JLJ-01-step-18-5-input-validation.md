# Step 18.5: Input Validation

**Status:** Complete  
**Parent:** Step 18 Security Hardening

## Overview

Review and strengthen input validation across OAuth/OIDC flows. Document validation coverage.

## Validation Additions

- [x] redirect_uri format validation in authorization flow (http/https only)
- [x] state max length (512 chars)
- [x] scope max length (2048 chars)
- [x] code_challenge max length (128 chars per RFC 7636)
- [x] Shared validation helpers in input-validation.ts
- [x] Document validation coverage

## Validation Coverage

### Authorization Endpoint (`/authorize`)

| Parameter | Validation | Location |
|-----------|------------|----------|
| client_id | Required, non-empty | authorization-validation.ts |
| redirect_uri | Required, valid http/https URL, must be in client's redirectUris | authorization-validation.ts |
| response_type | Must be "code" | authorization-validation.ts |
| scope | Required openid, must be client-allowed, max 2048 chars | authorization-validation.ts |
| state | Max 512 chars | authorization-validation.ts |
| code_challenge | Max 128 chars when provided | authorization-validation.ts |
| code_challenge_method | S256 or plain only | authorization-validation.ts |
| nonce | Accepted as-is (trimmed) | authorization-validation.ts |

### Token Endpoint (`/token`)

| Parameter | Validation | Location |
|-----------|------------|----------|
| Content-Type | application/x-www-form-urlencoded | token.ts |
| grant_type | authorization_code or refresh_token | token.ts |
| code | Required for auth code grant | token.ts |
| redirect_uri | Required for auth code, must match stored code | token.ts, authorization-code-storage |
| code_verifier | Required when PKCE used, verified against challenge | token.ts, pkce.ts |
| client_id / credentials | Per client auth method | token.ts |

### Revoke Endpoint (`/revoke`)

| Parameter | Validation | Location |
|-----------|------------|----------|
| Content-Type | application/x-www-form-urlencoded | revoke.ts |
| token | Required | revoke.ts |
| token_type_hint | refresh_token or access_token only | revoke.ts |

### Client Registration

| Field | Validation | Location |
|-------|------------|----------|
| redirect_uris | At least one, each must be valid http/https URL | clients/service.ts |
| grant_types, response_types, scopes | Must be in allowlist | clients/service.ts |
| token_endpoint_auth_method | client_secret_basic, client_secret_post, or none | clients/service.ts |

### Auth Routes (return_to)

| Parameter | Validation | Location |
|-----------|------------|----------|
| return_to | Must be path starting with / (not //), sanitized to / if invalid | auth-utils.ts |
