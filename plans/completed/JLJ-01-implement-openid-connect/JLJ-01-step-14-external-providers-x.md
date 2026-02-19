# Step 14: External Provider Integration - X

## Overview
Implement X (Twitter) OAuth 2.0 provider integration. X uses OAuth 2.0 Authorization Code Flow with PKCE (access tokens, not ID tokens). Enables users to sign in with X and link X accounts to local user accounts.

## Implementation Summary

- **Config**: `src/providers/x-config.ts` - X_CLIENT_ID, X_CLIENT_SECRET
- **Validation**: `src/providers/x.ts` - validateXToken (users/me API), getXAuthorizationUrl
- **Auth**: `src/auth/x-routes.ts` - GET /auth/x, GET /auth/x/callback (with PKCE)
- **Service**: `src/users/service.ts` - authenticateWithX
- **PKCE**: `src/flows/pkce.ts` - generateCodeVerifier (added for X flow)
- **Login**: Sign in with X link on login page when configured

## Key Differences from Other Providers

- **PKCE required** - X mandates PKCE for authorization code flow
- Uses **access tokens** (not ID tokens) - validated via users/me endpoint
- Token exchange: Basic auth (client_id:client_secret) + code_verifier
- Scopes: `tweet.read`, `users.read`, `offline.access`
- Email may be unavailable (X requires additional approval for email scope); fallback: `x-{id}@placeholder.local`

## Requirements Verification

| Requirement | Status |
|-------------|--------|
| Provider Configuration | ✅ |
| PKCE (code_verifier, code_challenge) | ✅ |
| Token Validation (users/me) | ✅ |
| User Information Extraction | ✅ |
| Account Linking | ✅ |
| Routes | ✅ |
| Unit tests | ✅ |

## Success Criteria
- [x] X access tokens can be validated
- [x] User information correctly extracted from users/me
- [x] New users can sign in with X
- [x] Existing users can sign in with X (account linked by email when available)
- [x] Already-linked X accounts sign in directly
- [x] PKCE flow works correctly
- [x] All unit tests for X provider validation pass
