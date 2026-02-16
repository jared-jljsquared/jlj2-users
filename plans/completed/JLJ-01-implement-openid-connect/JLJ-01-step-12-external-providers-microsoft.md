# Step 12: External Provider Integration - Microsoft

## Overview
Implement Microsoft OIDC provider integration for accepting and validating Microsoft ID tokens. Enables users to sign in with Microsoft and link Microsoft accounts to local user accounts.

## Implementation Summary

- **Config**: `src/providers/microsoft-config.ts` - MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT
- **JWKS**: `src/providers/microsoft-jwks.ts` - Fetch and cache Microsoft public keys (1-hour TTL)
- **Validation**: `src/providers/microsoft.ts` - validateMicrosoftToken (RS256, iss prefix, aud, oid as sub), getMicrosoftAuthorizationUrl
- **Auth**: `src/auth/microsoft-routes.ts` - GET /auth/microsoft, GET /auth/microsoft/callback
- **Service**: `src/users/service.ts` - authenticateWithMicrosoft
- **Login**: Sign in with Microsoft link on login page when configured

## Requirements Verification

| Requirement | Status |
|-------------|--------|
| 12.1 Provider Configuration | ✅ |
| 12.2 Provider Discovery and JWKS | ✅ |
| 12.3 Token Validation (RS256, iss, aud, oid as sub) | ✅ |
| 12.4 User Information Extraction | ✅ |
| 12.5 Account Linking | ✅ |
| 12.6 Routes | ✅ |
| Unit tests | ✅ |

## Success Criteria
- [x] Microsoft ID tokens can be validated
- [x] User information correctly extracted (oid as sub, email/preferred_username)
- [x] New users can sign in with Microsoft
- [x] Existing users can sign in with Microsoft (account linked by email)
- [x] Already-linked Microsoft accounts sign in directly
- [x] All unit tests for Microsoft provider validation pass
