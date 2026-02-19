# Step 14: External Provider Integration - X

## Overview
Implement X (Twitter) OAuth 2.0 provider integration for accepting and validating X access tokens. X uses OAuth 2.0 Authorization Code Flow with PKCE—access tokens, not ID tokens—similar to Facebook. Enables users to sign in with X and link X accounts to local user accounts.

## Prerequisites
- Enable "Sign in with X" in the X Developer Portal (Developer Apps → your app → User authentication settings)
- Add callback URL to the app's allowlist: `{OIDC_ISSUER}/auth/x/callback`

## Sub-steps

### 14.1 Provider Configuration
- X_CLIENT_ID (API Key), X_CLIENT_SECRET (API Key Secret)
- Authorization: https://twitter.com/i/oauth2/authorize
- Token: https://api.twitter.com/2/oauth2/token
- User info: https://api.twitter.com/2/users/me
- Scopes: tweet.read, users.read, offline.access (email requires additional approval)

### 14.2 PKCE Requirement
- X requires PKCE for the authorization code flow
- Generate code_verifier and code_challenge (S256) before redirect
- Include code_challenge and code_challenge_method in authorization URL
- Include code_verifier in token exchange

### 14.3 Token Validation
- Exchange authorization code for access token (with code_verifier)
- Validate token by calling users/me endpoint with Bearer token
- Extract user info: id, name, profile_image_url, email (if granted)

### 14.4 User Information Extraction
- sub from user id
- email (may be empty—X requires separate approval for email scope)
- name, picture from profile_image_url

### 14.5 Account Linking
- Same flow as other providers: find by provider_sub, link by email, create new user
- Handle case where email is not available (reject or use X id as fallback for account creation)

### 14.6 Routes
- GET /auth/x
- GET /auth/x/callback

## Database
- Add 'x' to ProviderName type in provider-account.ts
- Add migration if provider_accounts table restricts provider values (or 'x' may already be supported via TEXT)

## Success Criteria
- [ ] X access tokens can be validated
- [ ] User information is correctly extracted
- [ ] New users can sign in with X
- [ ] Existing users can sign in with X (account linked by email)
- [ ] Already-linked X accounts sign in directly
- [ ] PKCE flow works correctly
- [ ] Unit tests pass
