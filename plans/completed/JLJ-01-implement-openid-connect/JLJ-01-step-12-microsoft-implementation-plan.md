# Step 12: Microsoft OIDC Integration - Implementation Plan

## Overview
Implement Microsoft OIDC provider integration for accepting and validating Microsoft ID tokens. Enables users to sign in with Microsoft and link Microsoft accounts to local user accounts.

## Sub-steps

### 12.1 Provider Configuration
- MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT (default: common)
- Discovery: https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration
- JWKS: https://login.microsoftonline.com/common/discovery/v2.0/keys
- Scopes: openid, profile, email

### 12.2 Provider Discovery and JWKS
- Fetch and cache Microsoft JWKS (same pattern as Google)
- Lookup by kid for key rotation

### 12.3 Token Validation
- RS256 signature verification
- iss must start with https://login.microsoftonline.com/
- aud matches client ID
- Use oid as subject identifier (Microsoft convention)

### 12.4 User Information Extraction
- sub from oid (or sub fallback)
- email from email or preferred_username
- name, given_name, family_name

### 12.5 Account Linking
- Same flow as Google: find by provider_sub, link by email, create new user

### 12.6 Routes
- GET /auth/microsoft
- GET /auth/microsoft/callback

## Implementation Summary

- **Config**: `src/providers/microsoft-config.ts` - MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT
- **JWKS**: `src/providers/microsoft-jwks.ts` - Fetch and cache Microsoft public keys
- **Validation**: `src/providers/microsoft.ts` - validateMicrosoftToken (oid as sub), getMicrosoftAuthorizationUrl
- **Auth**: `src/auth/microsoft-routes.ts` - GET /auth/microsoft, GET /auth/microsoft/callback
- **Service**: `src/users/service.ts` - authenticateWithMicrosoft
