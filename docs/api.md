# API Documentation

OAuth 2.0 / OpenID Connect API for jlj2-users.

## Base URL

All endpoints are relative to the issuer URL (configurable via `OIDC_ISSUER`). Default: `http://localhost:3000`.

---

## OIDC Discovery

### GET /.well-known/openid-configuration

Returns the OIDC discovery document with provider metadata.

**Response:** JSON object with `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `revocation_endpoint`, `jwks_uri`, `scopes_supported`, `response_types_supported`, `grant_types_supported`, `token_endpoint_auth_methods_supported`, `code_challenge_methods_supported`, and other OIDC metadata.

---

## JWKS

### GET /.well-known/jwks.json

Returns the JSON Web Key Set for token verification.

**Response:** JSON object with `keys` array of JWK objects (RSA public keys).

---

## Authorization Endpoint

### GET /authorize

Initiates the authorization code flow. User must be authenticated (session cookie).

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `client_id` | Yes | OAuth client ID |
| `redirect_uri` | Yes | Callback URL (must be registered for client) |
| `response_type` | Yes | Must be `code` |
| `scope` | Yes | Space-separated scopes; must include `openid` |
| `state` | Recommended | CSRF protection; returned in callback |
| `code_challenge` | For public clients | PKCE code challenge |
| `code_challenge_method` | With code_challenge | `S256` or `plain` |
| `nonce` | Optional | For ID token replay protection |

**Success:** 302 redirect to `redirect_uri` with `code` and `state` query parameters.

**Error:** 302 redirect to `redirect_uri` with `error` and `error_description` (and `state` if provided), or 400 HTML error page when redirect_uri cannot be validated.

**Error Codes:** `invalid_request`, `invalid_client`, `invalid_scope`, `unsupported_response_type`, `access_denied`

---

## Token Endpoint

### POST /token

Exchanges authorization code for tokens, or refreshes tokens.

**Headers:** `Content-Type: application/x-www-form-urlencoded`

**Request Body (form-urlencoded):**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `grant_type` | Yes | `authorization_code` or `refresh_token` |
| `code` | For authorization_code | Authorization code from /authorize |
| `redirect_uri` | For authorization_code | Same as used in /authorize |
| `code_verifier` | For authorization_code + PKCE | PKCE code verifier |
| `refresh_token` | For refresh_token | Refresh token from prior token response |
| `client_id` | For public clients | Client ID when using `token_endpoint_auth_method: none` |

**Client Authentication:** `client_secret_basic` (Authorization header) or `client_secret_post` (form body).

**Success Response (200):**

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email",
  "id_token": "...",
  "refresh_token": "..."  // when offline_access scope granted
}
```

**Error Response (4xx/5xx):** JSON with `error` and optional `error_description`.

**Error Codes:** `invalid_request`, `invalid_client`, `invalid_grant`, `unauthorized_client`, `unsupported_grant_type`, `server_error`

---

## UserInfo Endpoint

### GET /userinfo

Returns user claims. Requires Bearer access token.

**Headers:** `Authorization: Bearer <access_token>`

**Success Response (200):** JSON with claims based on token scope:

- `sub` (always)
- `email`, `email_verified`, `emails`, `phone_numbers` (with `email` scope)
- `name`, `given_name`, `family_name`, `picture` (with `profile` scope)

**Error Response:**

| Status | Error | Description |
|--------|-------|-------------|
| 401 | `invalid_token` | Missing/invalid Authorization header or token |
| 403 | `user_inactive` | User account is deactivated |
| 404 | `user_not_found` | User no longer exists |

---

## Revocation Endpoint

### POST /revoke

Revokes a refresh token. Per RFC 7009, returns 200 even when token is invalid (prevents enumeration).

**Headers:** `Content-Type: application/x-www-form-urlencoded`

**Request Body:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `token` | Yes | Refresh token to revoke |
| `token_type_hint` | No | `refresh_token` or `access_token` |
| `client_id` | For public clients | Client ID |

**Client Authentication:** Same as token endpoint.

**Success:** 200 with empty body.

**Error Response (4xx):** JSON with `error` and `error_description` for invalid requests.

---

## Client Registration

### POST /clients

Register a new OAuth client.

**Request Body (JSON):**

```json
{
  "name": "My Application",
  "redirectUris": ["https://myapp.example.com/callback"],
  "grantTypes": ["authorization_code", "refresh_token"],
  "responseTypes": ["code"],
  "scopes": ["openid", "profile", "email", "offline_access"],
  "tokenEndpointAuthMethod": "client_secret_post"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Client display name |
| `redirectUris` | Yes | Array of allowed redirect URIs |
| `grantTypes` | Yes | `authorization_code`, `refresh_token` |
| `responseTypes` | Yes | `code` |
| `scopes` | Yes | `openid`, `profile`, `email`, `offline_access` |
| `tokenEndpointAuthMethod` | Yes | `client_secret_basic`, `client_secret_post`, or `none` |

**Success (201):** Returns client with `id`, `secret` (store securely; shown only once), and metadata.

### GET /clients/:id

Retrieve client metadata (never returns secret).

### PUT /clients/:id

Update client metadata.

### DELETE /clients/:id

Deactivate a client.

---

## Authentication Flows

### Password Login

- **GET /login** – Login form
- **POST /login** – Submit email/password; redirects to `return_to` on success

### External Providers

- **GET /auth/google** – Initiate Google sign-in
- **GET /auth/google/callback** – Google callback
- **GET /auth/microsoft** – Initiate Microsoft sign-in
- **GET /auth/microsoft/callback** – Microsoft callback
- **GET /auth/facebook** – Initiate Facebook sign-in
- **GET /auth/facebook/callback** – Facebook callback
- **GET /auth/x** – Initiate X (Twitter) sign-in
- **GET /auth/x/callback** – X callback

All auth routes accept `return_to` query parameter for post-login redirect.

---

## Health Check

### GET /health

Returns service health status.

**Response:** `{ "status": "ok" | "degraded", "checks": { "database": {...} } }`
