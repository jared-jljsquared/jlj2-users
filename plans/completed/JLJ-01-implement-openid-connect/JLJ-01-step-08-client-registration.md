# Step 8: Client Registration and Management

## Overview

Implement OAuth 2.0 client registration, client credentials storage, and client authentication mechanisms. This enables the authorization server to manage OAuth/OIDC clients (applications) that will use the authorization and token endpoints.

## Sub-steps

### 8.1 Client Data Model ✅

Define the OAuth 2.0 client data structure including:

- `client_id` - Unique identifier (generated on registration)
- `client_secret` - Hashed secret for confidential clients (optional for public clients)
- `client_secret_expires_at` - Optional expiration for client secret
- `client_name` - Human-readable client name
- `redirect_uris` - Allowed redirect URIs for authorization code flow
- `grant_types` - Allowed grant types (authorization_code, refresh_token, etc.)
- `response_types` - Allowed response types (code, token, etc.)
- `scopes` - Allowed scopes (openid, profile, email, etc.)
- `token_endpoint_auth_method` - How client authenticates (client_secret_basic, client_secret_post, none)
- `created_at` / `updated_at` - Timestamps

### 8.2 Client Storage ✅

Create database-backed client storage:

- Create `clients` table migration (ScyllaDB)
- Partition by `client_id` for direct lookups
- Store client_secret as hash (use Node.js crypto)
- Implement CRUD operations

### 8.3 Client Registration ✅

Implement client registration:

- Generate unique `client_id` (UUID or opaque string)
- Generate `client_secret` for confidential clients
- Hash and store client_secret
- Validate redirect_uris format
- Validate grant_types and response_types against allowed values
- Return client metadata (exclude secret from responses after initial registration)

### 8.4 Client Lookup and Validation ✅

Implement client lookup:

- Find client by `client_id`
- Verify client exists and is active
- Validate redirect_uri against allowed URIs
- Validate requested scopes against client's allowed scopes

### 8.5 Client Authentication ✅

Implement client authentication for token endpoint:

- **client_secret_basic**: HTTP Basic auth with client_id:client_secret
- **client_secret_post**: client_id and client_secret in POST body
- **none**: For public clients (no secret)
- Verify hashed secret against provided secret

### 8.6 Client Management API ✅

Implement API endpoints:

- `POST /clients` - Register new client (returns client_id, client_secret on creation)
- `GET /clients/:client_id` - Get client metadata (admin; never returns secret)
- `PUT /clients/:client_id` - Update client (admin)
- `DELETE /clients/:client_id` - Revoke/delete client (admin)

## Implementation Summary

- **Migration**: `012-create-clients-table.ts` creates the clients table with client_id, client_secret_hash, redirect_uris, grant_types, response_types, scopes, and token_endpoint_auth_method
- **Types**: `src/clients/types/client.ts`, `src/database/types/oauth-client.ts`
- **Credentials**: `src/clients/credentials.ts` - hashClientSecret, verifyClientSecret (SHA-256, timing-safe)
- **Storage**: `src/clients/storage.ts` - insertClient, findClientById, updateClient, deactivateClient
- **Service**: `src/clients/service.ts` - registerClient, getClientById, authenticateClient, isRedirectUriAllowed, validateScopes
- **Routes**: `src/clients/routes.ts` - POST/GET/PUT/DELETE /clients
- **Auth**: `src/clients/auth.ts` - extractClientCredentialsFromForm, extractClientCredentialsFromBasicAuthHeader (used by token endpoint)

## Success Criteria

- [x] Client data model defined with OAuth 2.0 fields
- [x] Clients table migration created and applied
- [x] Client registration works with secret generation
- [x] Client secrets are hashed before storage
- [x] Client lookup by client_id works
- [x] Client authentication (basic, post) works
- [x] Redirect URI validation works
- [x] All unit tests pass
- [x] Integration tests pass
