# Step 18: Security Hardening

**Status:** In Progress  
**Branch:** (current)

## Overview

Implement security best practices to protect against common OAuth 2.0 and OIDC attacks. PKCE, state validation, and nonce handling are already implemented.

## Sub-steps

### 18.1 Rate Limiting ✅
- [x] Create rate limit middleware (fixed window)
- [x] Apply to flows (`/authorize`, `/token`, `/login`, `/revoke`, `/userinfo`, `/auth/*`)
- [x] Configurable via env (RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)
- [x] Use IP from x-forwarded-for, cf-connecting-ip, or hostname

### 18.2 Security Headers ✅
- [x] Create security headers middleware
- [x] X-Content-Type-Options: nosniff
- [x] X-Frame-Options: DENY
- [x] Referrer-Policy: strict-origin-when-cross-origin
- [x] HSTS when HTTPS (Strict-Transport-Security)
- [x] Apply to all responses globally

### 18.3 Token Replay Prevention (jti) ✅
- [x] Add jti claim to access tokens and ID tokens
- [x] Use crypto.randomUUID() for uniqueness
- [x] Enables audit trail and future replay tracking if needed

### 18.4 HTTPS Enforcement ✅
- [x] Add middleware to reject non-HTTPS in production (when NODE_ENV=production)
- [x] Allow localhost for development
- [x] Check x-forwarded-proto when behind proxy

### 18.5 Input Validation
- [ ] Review and strengthen existing validation (redirect URIs, etc.)
- [ ] Document validation coverage

## Files Created/Modified

- `src/middleware/rate-limit.ts` - rate limiting
- `src/middleware/security-headers.ts` - security headers
- `src/middleware/https-enforcement.ts` - HTTPS check
- `src/middleware/__tests__/rate-limit.test.ts` - rate limit tests
- `src/middleware/__tests__/security-headers.test.ts` - security headers tests
- `src/middleware/__tests__/https-enforcement.test.ts` - HTTPS enforcement tests
- `src/flows/token.ts` - add jti to token payloads
- `src/app.ts` - wire security headers and HTTPS enforcement globally
- `src/flows/routes.ts` - apply rate limit to flows
