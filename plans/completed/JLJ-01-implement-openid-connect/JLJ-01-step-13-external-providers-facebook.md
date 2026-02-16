# Step 13: External Provider Integration - Facebook

## Overview
Implement Facebook OAuth 2.0 provider integration. Facebook uses OAuth 2.0 (access tokens), not full OIDC (ID tokens). Enables users to sign in with Facebook and link Facebook accounts to local user accounts.

## Implementation Summary

- **Config**: `src/providers/facebook-config.ts` - FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
- **Validation**: `src/providers/facebook.ts` - validateFacebookToken (debug_token + /me), getFacebookAuthorizationUrl
- **Auth**: `src/auth/facebook-routes.ts` - GET /auth/facebook, GET /auth/facebook/callback
- **Service**: `src/users/service.ts` - authenticateWithFacebook
- **Login**: Sign in with Facebook link on login page when configured

## Key Differences from Google/Microsoft

- Uses **access tokens** (not ID tokens) - validated via Graph API debug_token endpoint
- App access token for validation: `{app_id}|{app_secret}`
- User info from Graph API: `/me?fields=id,name,email,picture`
- Scopes: `email`, `public_profile`

## Requirements Verification

| Requirement | Status |
|-------------|--------|
| Provider Configuration | ✅ |
| Token Validation (debug_token) | ✅ |
| User Information Extraction | ✅ |
| Account Linking | ✅ |
| Routes | ✅ |
| Unit tests | ✅ |

## Success Criteria
- [x] Facebook access tokens can be validated
- [x] User information correctly extracted from Graph API
- [x] New users can sign in with Facebook
- [x] Existing users can sign in with Facebook (account linked by email)
- [x] Already-linked Facebook accounts sign in directly
- [x] All unit tests for Facebook provider validation pass
