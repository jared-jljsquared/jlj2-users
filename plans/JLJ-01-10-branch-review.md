# Branch Review: JLJ-01-10 vs main

**Date:** 2026-02-11  
**Branch:** JLJ-01-10  
**Comparison:** Current branch vs main

---

## Addressed in This Branch (Post-Review)

The following review items have been implemented:

- **In-memory state (Recommendation 1)** – OAuth state is now stored in ScyllaDB via `oauth_state` table and `oauth-state-storage.ts`. Horizontally scalable; survives restarts.
- **Error logging (Recommendation 2)** – Auth callbacks now log errors before redirecting on failure.
- **Code duplication (Recommendation 8)** – Shared `auth-utils.ts` and `oauth-state-storage.ts`; all four auth routes use these modules.

---

## Summary of Changes

The branch adds the following functionality on top of main:

- **External Provider Integration**: Google, Microsoft, Facebook, and X (Twitter) OAuth/OIDC
- **Refresh Token Flow**: Token endpoint extensions with refresh_token grant
- **Token Validation Middleware**: `requireAccessToken` and `requireScope` for protected routes
- **PKCE Support**: `generateCodeVerifier` and `generateCodeChallenge` (used by X flow)

---

## Recommendations

### 1. In-Memory State Stores (Auth Routes)

**Issue:** Each auth route (Google, Microsoft, Facebook, X) maintains its own in-memory `stateStore`:

```typescript
const stateStore = new Map<string, { returnTo: string; expiresAt: number }>()
```

**Concerns:**

- **Not horizontally scalable**: With multiple app instances behind a load balancer, state created on instance A won't be available when the callback hits instance B
- **Lost on restart**: Server restart invalidates all in-flight OAuth flows
- **Code duplication**: Same pattern repeated across four route files

**Recommendation:** Move state storage to a shared backend (Redis, ScyllaDB, or similar) with TTL, or extract a shared module and document the single-instance limitation for now.

---

### 2. Error Handling in Auth Callbacks

**Issue:** Callbacks use a bare `catch` that swallows all errors:

```typescript
} catch {
  return c.redirect(
    `/login?return_to=${encodeURIComponent(returnTo)}&error=facebook_auth_failed`,
    302,
  )
}
```

**Concerns:**

- No logging of the underlying error (token exchange failure, provider API error, etc.)
- Difficult to debug production issues
- Potential information leakage if errors are ever surfaced

**Recommendation:** Log the error (without sensitive data) before redirecting:

```typescript
} catch (err) {
  log({ message: 'Facebook auth failed', error: err instanceof Error ? err.message : String(err) })
  return c.redirect(...)
}
```

---

### 3. Facebook Token Endpoint

**Issue:** Uses `oauth/access_token` endpoint:

```typescript
export const FACEBOOK_TOKEN_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`
```

**Concerns:**

- Facebook has deprecated some OAuth endpoints in favor of newer flows
- The `oauth/access_token` endpoint may return different response formats depending on configuration

**Recommendation:** Verify against current [Facebook Login documentation](https://developers.facebook.com/docs/facebook-login/) that this endpoint and response format are correct. Consider whether a newer token endpoint is recommended.

---

### 4. Refresh Token Storage – Primary Key Design

**Issue:** The `refresh_tokens` table uses `token_value` as the primary key:

```sql
PRIMARY KEY (token_value)
```

**Concerns:**

- Lookup by token is efficient
- Revoking all tokens for a user or client would require a full table scan (no partition by `user_id` or `client_id`)

**Recommendation:** If user/client-wide revocation is a requirement, consider a schema that supports it (e.g., secondary table or index). Otherwise, document the current limitation.

---

### 5. Refresh Token – Single-Use Enforcement

**Issue:** `consumeRefreshToken` uses `DELETE ... IF EXISTS` and `wasApplied()` to enforce single-use, which is correct. The distinction between "already used" vs "invalid/expired" could be clearer for debugging.

**Recommendation:** Consider returning a distinct error or logging when a token is reused (security event) vs. when it's simply invalid.

---

### 6. Token Validation Middleware – Missing `aud` Validation

**Issue:** The middleware validates `iss`, `exp`, and `nbf` but does not validate `aud`:

```typescript
const validateAccessTokenClaims = (payload, issuer) => {
  // validates iss, exp, nbf - but NOT aud
}
```

**Concerns:**

- A token issued for Client A could be used to access resources intended for Client B
- OIDC/OAuth 2.0 best practice is to validate audience for access tokens

**Recommendation:** Add optional `aud` validation. For resource servers, accept a configurable list of valid audiences and validate `payload.aud` against it.

---

### 7. Session Cookie – SameSite Consideration

**Issue:** Session cookie uses `SameSite=Lax`:

```typescript
`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=900`
```

**Concerns:**

- `Lax` is generally appropriate for login flows
- If the OAuth callback involves cross-site redirects from external IdPs, `Lax` may block cookies in certain scenarios

**Recommendation:** Document the choice. If cross-site redirect issues arise, evaluate `SameSite=None` with `Secure` (requires HTTPS).

---

### 8. Code Duplication Across Auth Routes

**Issue:** Google, Microsoft, Facebook, and X routes duplicate significant logic:

- `stateStore`, `pruneExpiredState`, `isValidReturnTo`, `sanitizeReturnTo`, `isSecureRequest`, `getRedirectUri`
- Callback flow: state validation, token exchange, session creation, error redirect

**Recommendation:** Extract shared utilities and a generic callback handler parameterized by provider-specific token exchange logic. Reduces maintenance burden and bug surface.

---

### 9. X Placeholder Email

**Issue:** When X doesn't provide email, the code uses `x-{id}@placeholder.local`:

```typescript
const email = providerUserInfo.email
  ? providerUserInfo.email.toLowerCase()
  : `x-${providerSub}@placeholder.local`
```

**Concerns:**

- `placeholder.local` could theoretically collide with real addresses (unlikely but possible)
- May cause confusion in account linking or recovery flows

**Recommendation:** Document the behavior. Consider using a domain you control (e.g. `x-{id}@users.yourapp.local`) or rejecting sign-in when email is required and X doesn't provide it.

---

### 10. Provider Config – Hardcoded API Versions

**Issue:** Facebook uses `v21.0` and similar versioned URLs are hardcoded in config files.

**Recommendation:** Make the Graph API version configurable via environment variable so upgrades don't require code changes when providers release new versions.

---

### 11. Missing UserInfo Endpoint

**Issue:** Discovery advertises `userinfo_endpoint`, but the endpoint is still a placeholder (`src/flows/userinfo.ts`).

**Recommendation:** Implement the UserInfo endpoint (Step 16) or remove it from discovery until implemented, to avoid misleading clients.

---

### 12. `requireScope` Depends on `requireAccessToken`

**Issue:** `requireScope` expects `accessTokenPayload` to already be set in context:

```typescript
const payload = c.get('accessTokenPayload')
if (!payload) { ... }
```

**Recommendation:** Document that `requireScope` must be used after `requireAccessToken`, or have `requireScope` invoke `requireAccessToken` internally so it can be used standalone.

---

## Summary Table

| Area | Severity | Recommendation | Status |
|------|----------|-----------------|--------|
| In-memory state | High | Use shared storage or document single-instance limitation | Done – ScyllaDB |
| Error logging | Medium | Log errors in auth callbacks | Done |
| `aud` validation | Medium | Add optional audience validation in middleware | Pending |
| Code duplication | Medium | Extract shared auth route logic | Done |
| Facebook endpoint | Low | Verify against current Facebook docs | Pending |
| Refresh token PK | Low | Consider schema for user/client revocation | Pending |
| X placeholder email | Low | Document and optionally refine strategy | Pending |
| UserInfo endpoint | Low | Implement or remove from discovery | Pending |

---

## What's Working Well

- **Parameterized queries** for refresh tokens (no SQL injection)
- **PKCE** correctly implemented for X flow
- **State validation** for CSRF protection
- **Secure cookie flags** (`HttpOnly`, `Secure` when HTTPS)
- **Provider-specific token validation** (Google JWKS, Facebook debug_token, etc.)
- **Unit tests** for providers and middleware
- **Separation of concerns** between providers, routes, and user service
