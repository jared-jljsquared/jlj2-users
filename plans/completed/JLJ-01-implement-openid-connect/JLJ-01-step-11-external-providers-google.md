# Step 11: External Provider Integration - Google

## Overview
Implement Google OIDC provider integration for accepting and validating Google ID tokens. Enables users to sign in with Google and link Google accounts to local user accounts.

## Implementation Summary

- **Config**: `src/providers/google-config.ts` - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWKS URL, token URL
- **JWKS**: `src/providers/google-jwks.ts` - Fetch and cache Google public keys (1-hour TTL), lookup by kid
- **Validation**: `src/providers/google.ts` - validateGoogleToken (RS256, iss, aud, exp, nbf), getGoogleAuthorizationUrl
- **Types**: `src/providers/types/provider-user-info.ts` - ProviderUserInfo interface
- **Auth**: `src/auth/google-routes.ts` - GET /auth/google, GET /auth/google/callback (code exchange, state/CSRF)
- **Service**: `src/users/service.ts` - authenticateWithGoogle (find/link/create user, link provider account)
- **Login**: Sign in with Google link on login page when configured

## Requirements Verification

| Requirement | Status |
|-------------|--------|
| 9.1 Provider Configuration (client ID, secret, discovery, scopes) | ✅ |
| 9.2 Provider Discovery (JWKS fetch and cache) | ✅ |
| 9.3 Token Validation (signature, iss, aud, exp, nbf) | ✅ |
| 9.4 User Information Extraction (sub, email, name, picture, etc.) | ✅ |
| 9.5 Account Linking (create/find by email, store provider mapping) | ✅ |
| GET /auth/google redirect | ✅ |
| GET /auth/google/callback (code exchange, token validation) | ✅ |
| Unit tests for Google token validation | ✅ |

## Success Criteria
- [x] Google ID tokens can be validated
- [x] User information is correctly extracted from Google
- [x] New users can sign in with Google (account created)
- [x] Existing users can sign in with Google (account linked by email)
- [x] Already-linked Google accounts sign in directly
- [x] Provider accounts can be linked to local user accounts
- [x] Public keys are fetched and cached appropriately
- [x] Token validation includes all security checks
- [x] Provider-specific claim formats are handled correctly
- [x] All unit tests for Google provider validation pass
- [ ] Integration tests for provider callbacks (deferred)

## Deferred
- Integration tests for Google OAuth callback flow (Playwright)
- Microsoft (Step 12) and Facebook (Step 13) provider integration
