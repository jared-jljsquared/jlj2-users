# Manual Test Scenarios

Use this checklist for end-to-end validation of OAuth/OIDC flows.

## Prerequisites

- ScyllaDB running (`docker-compose up -d`)
- Migrations applied (`pnpm migrate`)
- App running (`pnpm dev`)
- At least one OAuth client registered (via `POST /clients`)

---

## 1. Discovery and JWKS

- [ ] `GET /.well-known/openid-configuration` returns valid JSON with `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `revocation_endpoint`, `jwks_uri`
- [ ] `GET /.well-known/jwks.json` returns `keys` array with at least one RSA key

---

## 2. Password Login Flow

- [ ] Navigate to `/login`
- [ ] Enter valid email/password → redirects to `return_to` (or `/`) with session
- [ ] Enter invalid password → redirects to login with error message
- [ ] Submit empty form → redirects with `missing_credentials` error

---

## 3. Authorization Code Flow (Happy Path)

- [ ] Ensure logged in (session cookie)
- [ ] Navigate to `/authorize?client_id={id}&redirect_uri={uri}&response_type=code&scope=openid%20profile&state=test123`
- [ ] Redirects to `redirect_uri` with `code` and `state=test123` in query
- [ ] Exchange code at `POST /token` (grant_type=authorization_code, code, redirect_uri, client_id, client_secret)
- [ ] Receive `access_token`, `id_token`, `expires_in`
- [ ] Call `GET /userinfo` with `Authorization: Bearer {access_token}` → returns user claims

---

## 4. Authorization Code Flow with PKCE (Public Client)

- [ ] Register client with `tokenEndpointAuthMethod: "none"`
- [ ] Generate code_verifier and code_challenge (S256)
- [ ] Navigate to `/authorize` with `code_challenge`, `code_challenge_method=S256`
- [ ] Receive code, exchange with `code_verifier` (no client_secret)
- [ ] Receive tokens

---

## 5. Refresh Token Flow

- [ ] Obtain refresh_token from authorization_code exchange (include `offline_access` in scope)
- [ ] `POST /token` with grant_type=refresh_token, refresh_token, client_id, client_secret
- [ ] Receive new access_token, id_token, refresh_token
- [ ] Old refresh_token is invalid (single-use)

---

## 6. Token Revocation

- [ ] `POST /revoke` with token, client_id, client_secret (or Basic auth)
- [ ] Returns 200
- [ ] Attempt to use revoked refresh_token → `invalid_grant`

---

## 7. Error Handling

- [ ] `/authorize` with invalid client_id → error in redirect or error page
- [ ] `/authorize` with unregistered redirect_uri → error (no redirect to arbitrary URI)
- [ ] `/token` with invalid code → `invalid_grant`
- [ ] `/token` with wrong client_secret → `invalid_client`
- [ ] `/userinfo` without Authorization header → 401
- [ ] `/userinfo` with invalid token → 401

---

## 8. External Providers (if configured)

For each configured provider (Google, Microsoft, Facebook, X):

- [ ] Click "Sign in with {Provider}" on login page
- [ ] Complete provider consent flow
- [ ] Redirected back to app with session
- [ ] Can access `/authorize` and complete OAuth flow

---

## 9. Rate Limiting

- [ ] Send many requests rapidly to `/token` or other rate-limited route
- [ ] Eventually receive 429 Too Many Requests
- [ ] After window expires, requests succeed again

---

## 10. Security Headers

- [ ] Response headers include `X-Content-Type-Options`, `X-Frame-Options`, etc. (check `security-headers` middleware)
