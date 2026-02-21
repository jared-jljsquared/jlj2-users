# Realms Evaluation (Step 22)

**Date:** 2026-02-20  
**Status:** Evaluation Complete

---

## Overview

This document evaluates whether to support OIDC realms (multi-tenant or multi-site access control) in jlj2-users.

---

## Current State

- **Audience:** Tokens use `OIDC_DEFAULT_AUDIENCE` (default: `jlj-squared-development`). Configurable via environment variable.
- **Token validation:** `requireAccessToken({ validAudiences: ['api.example.com'] })` supports optional audience validation for resource servers.
- **Token issuance:** Access tokens and ID tokens set `aud` to the client ID (OAuth client that requested the token).
- **Single issuer:** One issuer URL; no built-in realm path (e.g. `/realms/site-a`).

---

## Use Cases Considered

| Use Case | Description | Realm Needed? |
|----------|-------------|---------------|
| Site A vs Site B | Two separate web properties sharing one IdP | Maybe – `aud` can distinguish |
| Multi-tenant SaaS | Multiple tenants, each with own clients | No – client_id already scopes tokens |
| Multiple API audiences | One token valid for multiple resource servers | Optional – `aud` can be array |
| Strict tenant isolation | Tenants must not see each other's data | Yes – would need realm-scoped storage |

---

## Technical Assessment

### How `aud` Distinguishes Contexts

- **Client ID as audience:** Current design uses client_id as `aud`. Each OAuth client represents an application. Different sites/apps register as different clients → different `aud` values.
- **Custom audience:** `OIDC_DEFAULT_AUDIENCE` could be used for a default API audience. Resource servers validate `aud` via `requireAccessToken({ validAudiences: [...] })`.
- **Multiple audiences:** OIDC allows `aud` to be a string or array. Supporting multiple audiences per token would require changes to token issuance (e.g., accept `audience` param in auth request).

### Realm Selection in Authorization Flow

- **Option A – Client-based:** No explicit realm. Realm is implicit from client registration (client belongs to a tenant/site).
- **Option B – `aud` in auth request:** Add optional `audience` parameter to `/authorize`. Token `aud` would include requested audiences.
- **Option C – Path-based realms:** Issuer paths like `https://idp.example.com/realms/site-a`. Would require discovery per realm, different issuer per realm.

### Impact on Discovery, Clients, Tokens

- **Discovery:** Single discovery document today. Multi-realm would need per-realm discovery or `issuer` per realm.
- **Client registration:** Clients could have optional `realm` or `audience` metadata.
- **Token issuance:** Would need to merge requested audiences with client_id.

---

## Decision

**Recommendation: Do not implement full realm support at this time.**

### Rationale

1. **Client ID already provides isolation:** Each OAuth client is a distinct application. Tokens are scoped to the client that requested them. Multi-site scenarios can use multiple clients.
2. **`aud` and `validAudiences` suffice for resource servers:** APIs can validate that the token's `aud` includes their identifier. No realm abstraction needed.
3. **Complexity vs. benefit:** Full realm support (path-based issuers, per-realm discovery, realm-scoped storage) adds significant complexity. Current use cases are satisfied by client registration and audience validation.
4. **Future flexibility:** If realm requirements emerge (e.g., strict tenant isolation with separate user namespaces), the design can be extended. The `aud` claim and `validAudiences` pattern already support multiple audiences conceptually.

### What to Do Instead

- **Multiple sites:** Register one OAuth client per site. Each client has its own redirect_uri, and tokens are scoped to that client.
- **Multiple APIs:** If one token must be valid for multiple resource servers, extend the token endpoint to accept an `audience` parameter in the authorization request and include those values in `aud`. This is a smaller change than full realms.
- **Document current behavior:** Ensure deployers understand that `OIDC_DEFAULT_AUDIENCE` and `validAudiences` support resource server validation.

---

## If Realms Are Needed Later

1. Add optional `realm` to client registration.
2. Add `realm` or `audience` to authorization request parameters.
3. Scope user/client/token storage by realm (schema changes).
4. Support per-realm discovery (e.g., `/.well-known/openid-configuration?realm=site-a` or path-based issuer).
5. Document migration path for existing deployments.
