# JLJ-01 Remaining Steps Plan

**Date:** 2026-02-20  
**Status:** Implemented (Steps 19–22)  
**Prerequisites:** Steps 1–18 complete (see [JLJ-01-implement-openid-connect-overview.md](./JLJ-01-implement-openid-connect-overview.md))

---

## Overview

This plan covers the four remaining steps (19–22) to complete the OpenID Connect implementation, plus the deferred Token Introspection endpoint. Steps 1–18 are complete.

---

## Step 19: Error Handling and Logging

### Objective
Enhance error handling with OIDC-compliant error responses across all endpoints and implement comprehensive security logging.

### Current State
- **Token endpoint:** Already uses RFC 6749 Section 5.2 format (`error`, `error_description`, proper status codes, `Cache-Control: no-store`)
- **Auth callbacks:** Log errors before redirecting on failure (per JLJ-01-10 branch review)

### Sub-steps

#### 19.1 Audit Error Response Consistency
- [x] Authorization endpoint: Ensure `error` and `error_description` in redirect fragment/query per OIDC/OAuth 2.0
- [x] UserInfo endpoint: Ensure 401/403 with `WWW-Authenticate` header when appropriate
- [x] Revocation endpoint: Ensure RFC 7009 error format
- [x] Discovery: Ensure no sensitive error details leak

#### 19.2 Standardize Error Response Helper
- [x] Create shared `oidcJsonError()` utility for consistent format across endpoints
- [x] Support both JSON (token, revoke) and redirect (authorization) error formats

#### 19.3 Security Logging
- [x] Audit log: Authentication successes and failures (user_id, client_id, provider, timestamp)
- [x] Token events: Issuance, refresh, revocation (without logging token values)
- [x] Failed auth attempts: Rate, source, and pattern detection support
- [x] Ensure no sensitive data (passwords, tokens, secrets) in logs

#### 19.4 Success Criteria
- [x] All OAuth/OIDC endpoints return spec-compliant error responses
- [x] Security-relevant events are logged
- [x] No sensitive data in logs

---

## Step 20: Testing and Validation

### Objective
Create comprehensive test suite and validate OIDC compliance using standard OIDC conformance tests.

### Current State
- 35 test files (unit + integration) exist
- Vitest configured with coverage
- Tests cover JWT, auth flows, token, PKCE, userinfo, revoke, providers, middleware

### Sub-steps

See [JLJ-01-step-19-testing.md](./JLJ-01-step-19-testing.md) for detailed test plan.

#### 20.1 Unit Test Coverage
- [x] Verify >80% coverage for core components (325 tests; run `pnpm test:coverage` to verify)
- [x] Add missing unit tests for any uncovered paths

#### 20.2 Integration Tests
- [x] Authorization code flow (happy path and error scenarios)
- [x] Token exchange and refresh token flow
- [x] Provider integration (Google, Microsoft, Facebook, X)
- [ ] Account linking scenarios (deferred)

#### 20.3 Security Testing
- [x] CSRF (state parameter)
- [x] PKCE enforcement
- [x] Rate limiting
- [x] Input validation

#### 20.4 OIDC Conformance
- [ ] Set up OpenID Foundation OIDC Provider Conformance Test (manual/external)
- [ ] Run automated conformance suite
- [ ] Fix any compliance issues
- [ ] Document test results

#### 20.5 Load and Performance
- [ ] Token generation performance (deferred)
- [ ] Concurrent request handling (deferred)
- [ ] Key rotation performance (deferred)

#### 20.6 Manual Test Scenarios
- [x] Document end-to-end flows
- [x] Document manual test checklist

---

## Step 21: Documentation and Deployment

### Objective
Create API documentation, deployment guides, and operational runbooks.

### Current State
- README.md has basic notes (session cookie, token middleware, provider API versions)
- README-SCYLLA.md exists for ScyllaDB

### Sub-steps

#### 21.1 API Documentation
- [x] Document all OAuth/OIDC endpoints (authorization, token, userinfo, revoke, discovery, jwks)
- [x] Document request/response formats
- [x] Document error codes and meanings
- [x] Document client registration flow
- [ ] Consider OpenAPI/Swagger spec (deferred)

#### 21.2 Deployment Guide
- [x] Environment variables reference
- [x] ScyllaDB setup and migration steps
- [x] Key generation and rotation procedures
- [x] Provider configuration (Google, Microsoft, Facebook, X client IDs/secrets)
- [x] HTTPS/TLS requirements

#### 21.3 Operational Runbooks
- [x] Health check interpretation
- [x] Common failure scenarios and remediation
- [x] Key rotation procedure
- [x] Incident response (token compromise, provider outage)

#### 21.4 Success Criteria
- [x] New deployer can follow docs to deploy
- [x] API consumers can integrate without code inspection

---

## Step 22: Evaluate Use of Realms

### Objective
Evaluate OIDC realms for multi-tenant or multi-site access control.

### Current State
- Tokens use `jlj-squared-development` as default audience via `OIDC_DEFAULT_AUDIENCE`
- `requireAccessToken` supports optional `validAudiences` for `aud` validation

### Sub-steps

#### 22.1 Requirements Gathering
- [x] Define use cases: site A vs site B, multi-tenant SaaS, etc.
- [x] Determine if realms are needed for current or future requirements

#### 22.2 Technical Assessment
- [x] How `aud` claim distinguishes realms
- [x] How realm selection integrates with authorization flow (e.g., `aud` in auth request)
- [x] Whether to support multiple audiences per token
- [x] Impact on discovery, client registration, and token issuance

#### 22.3 Decision and Design
- [x] Document decision: support realms or not
- [x] If yes: create implementation plan for realm support
- [x] If no: document rationale and current single-audience behavior

---

## Optional: Token Introspection Endpoint (RFC 7662)

**Status:** Deferred from Step 17

### Objective
Implement RFC 7662 Token Introspection endpoint for resource servers to validate tokens.

### When to Implement
- When a resource server needs to validate tokens via HTTP (e.g., API gateway, microservices)
- When caching or offline validation is insufficient

### Sub-steps (when implemented)
- [ ] Add `POST /oauth2/introspect` endpoint
- [ ] Accept `token` and `token_type_hint` parameters
- [ ] Require client authentication (confidential clients)
- [ ] Return active/inactive and token metadata
- [ ] Add to discovery as `introspection_endpoint`

---

## Execution Order

1. **Step 19** – Error Handling and Logging (foundation for observability)
2. **Step 20** – Testing and Validation (validate before documentation)
3. **Step 21** – Documentation and Deployment (enable operators)
4. **Step 22** – Evaluate Realms (design decision, can run in parallel with 21)
5. **Token Introspection** – As needed

---

## References

- [JLJ-01-implement-openid-connect-overview.md](./JLJ-01-implement-openid-connect-overview.md) – Master plan
- [JLJ-01-step-19-testing.md](./JLJ-01-step-19-testing.md) – Detailed testing plan
- [completed/README.md](./completed/README.md) – Completed steps log
