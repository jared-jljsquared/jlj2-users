# Step 15: Security Hardening

## Overview
Implement security best practices including PKCE support, state parameter validation, nonce handling, and rate limiting to protect against common OAuth 2.0 and OIDC attacks.

## Sub-steps

### 15.1 PKCE (Proof Key for Code Exchange) Implementation
Implement full PKCE support:
- Generate `code_verifier` and `code_challenge` in authorization requests
- Support both `S256` (SHA256) and `plain` methods
- Validate `code_verifier` during token exchange
- Require PKCE for public clients (optional but recommended)

### 15.2 State Parameter Validation
Enhance state parameter handling:
- Generate cryptographically random state values
- Store state with expiration (typically 10-15 minutes)
- Validate state on callback to prevent CSRF attacks
- Return state in error responses

### 15.3 Nonce Handling for ID Tokens
Implement nonce validation:
- Require nonce in authorization requests when ID token is requested
- Store nonce with authorization code
- Include nonce in ID token
- Validate nonce when ID token is received

### 15.4 Rate Limiting
Implement rate limiting:
- Limit authorization requests per IP
- Limit token exchange attempts
- Limit failed authentication attempts
- Use sliding window or token bucket algorithm

### 15.5 Token Binding and Replay Prevention
Implement token security measures:
- Include `jti` (JWT ID) claim in tokens
- Track used tokens to prevent replay attacks
- Implement token revocation tracking
- Set appropriate token lifetimes

### 15.6 HTTPS Enforcement
Ensure secure transport:
- Require HTTPS in production
- Validate redirect URIs use HTTPS (except localhost for development)
- Set secure cookies if using sessions
- Include security headers (HSTS, CSP, etc.)

### 15.7 Input Validation and Sanitization
Strengthen input validation:
- Validate all request parameters
- Sanitize redirect URIs
- Validate email formats
- Prevent injection attacks

### 15.8 Logging and Monitoring
Implement security logging:
- Log all authentication attempts
- Log token generation and validation
- Log suspicious activities
- Monitor for anomalies

## Code Samples

### Example: PKCE Code Challenge Generation
```typescript
// src/flows/pkce.ts
import crypto from 'crypto';

export const generateCodeVerifier = (): string => {
  return crypto.randomBytes(32).toString('base64url');
};

export const generateCodeChallenge = (
  verifier: string,
  method: 'S256' | 'plain' = 'S256'
): string => {
  if (method === 'plain') {
    return verifier;
  }
  
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
};
```

### Example: State Parameter Management
```typescript
// src/flows/state.ts
import crypto from 'crypto';

interface StateData {
  value: string;
  expiresAt: Date;
  redirectUri: string;
}

const stateStore = new Map<string, StateData>();

export const generateState = (redirectUri: string): string => {
  const state = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  
  stateStore.set(state, {
    value: state,
    expiresAt,
    redirectUri,
  });
  
  return state;
};

export const validateState = (state: string, redirectUri: string): boolean => {
  const stored = stateStore.get(state);
  
  if (!stored) {
    return false;
  }
  
  if (stored.expiresAt < new Date()) {
    stateStore.delete(state);
    return false;
  }
  
  if (stored.redirectUri !== redirectUri) {
    return false;
  }
  
  // Clean up after validation
  stateStore.delete(state);
  return true;
};
```

### Example: Rate Limiting Middleware
```typescript
// src/middleware/rate-limit.ts
import type { Context, Next } from 'hono';

interface RateLimitStore {
  count: number;
  resetAt: Date;
}

const rateLimitStore = new Map<string, RateLimitStore>();

export const rateLimit = (
  windowMs: number,
  maxRequests: number
) => {
  return async (c: Context, next: Next) => {
    const key = c.req.header('x-forwarded-for')?.split(',')[0] || 
                c.req.header('cf-connecting-ip') || 
                'unknown';
    const now = new Date();
    
    const record = rateLimitStore.get(key);
    
    if (!record || record.resetAt < now) {
      rateLimitStore.set(key, {
        count: 1,
        resetAt: new Date(now.getTime() + windowMs),
      });
      return next();
    }
    
    if (record.count >= maxRequests) {
      return c.json({
        error: 'rate_limit_exceeded',
        error_description: 'Too many requests',
      }, 429);
    }
    
    record.count++;
    return next();
  };
};
```

### Example: Token Replay Prevention
```typescript
// src/tokens/replay-prevention.ts
import crypto from 'crypto';

const usedTokens = new Set<string>();
const TOKEN_CACHE_TTL = 3600 * 1000; // 1 hour

export const generateJti = (): string => {
  return crypto.randomUUID();
};

export const checkTokenReplay = (jti: string): boolean => {
  if (usedTokens.has(jti)) {
    return true; // Token already used
  }
  
  usedTokens.add(jti);
  
  // Clean up old tokens periodically
  if (usedTokens.size > 10000) {
    // Simple cleanup - in production, use TTL-based cleanup
    const keys = Array.from(usedTokens);
    usedTokens.clear();
    // Keep recent 1000 tokens
    keys.slice(-1000).forEach(key => usedTokens.add(key));
  }
  
  return false;
};
```

### Example: Security Headers Middleware
```typescript
// src/middleware/security-headers.ts
import type { Context, Next } from 'hono';

export const securityHeaders = async (c: Context, next: Next) => {
  // HSTS
  const protocol = c.req.header('x-forwarded-proto') || 
                   (c.req.url.startsWith('https') ? 'https' : 'http');
  if (protocol === 'https') {
    c.header(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }
  
  // Content Security Policy
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  );
  
  // X-Frame-Options
  c.header('X-Frame-Options', 'DENY');
  
  // X-Content-Type-Options
  c.header('X-Content-Type-Options', 'nosniff');
  
  // Referrer-Policy
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  return next();
};
```

## Testing

### Unit Tests (Vitest)
- **PKCE Functions**: Test PKCE code verifier and challenge generation
  - Test code_verifier generation produces random values
  - Test code_challenge generation with S256 method
  - Test code_challenge generation with plain method
  - Test code_verifier validation works correctly
  - Test invalid code_verifier is rejected

- **State Parameter Management**: Test state generation and validation
  - Test state values are cryptographically random
  - Test state validation succeeds with correct state
  - Test state validation fails with wrong state
  - Test expired states are rejected
  - Test state is single-use

- **Rate Limiting Logic**: Test rate limiting algorithm
  - Test requests within limit are allowed
  - Test requests exceeding limit are blocked
  - Test rate limit window resets correctly
  - Test different IPs have separate limits

- **Token Replay Prevention**: Test replay prevention
  - Test jti generation produces unique values
  - Test used tokens are detected
  - Test token cache cleanup works

- **Security Headers**: Test security header setting
  - Test all required headers are set
  - Test HSTS header is set for HTTPS
  - Test CSP header is correct
  - Test headers are set on all responses

### Integration Tests (Playwright)
- **Rate Limiting**: Test rate limiting on endpoints
  - Test authorization endpoint rate limiting
  - Test token endpoint rate limiting
  - Test rate limit headers are returned
  - Test rate limit resets after window

- **PKCE Flow**: Test PKCE in full authorization flow
  - Test authorization with PKCE code_challenge
  - Test token exchange with PKCE code_verifier
  - Test invalid code_verifier is rejected
  - Test missing code_verifier is rejected

- **State Parameter Flow**: Test state parameter in full flow
  - Test state is generated and returned
  - Test state is validated on callback
  - Test missing state is handled
  - Test invalid state is rejected

- **Security Headers**: Test security headers on responses
  - Test all endpoints return security headers
  - Test HSTS header on HTTPS
  - Test CSP header is present
  - Test X-Frame-Options is set

### Test Examples
```typescript
// src/flows/__tests__/pkce.test.ts
import { describe, it, expect } from 'vitest';
import { generateCodeVerifier, generateCodeChallenge, verifyCodeVerifier } from '../pkce.ts';

describe('PKCE', () => {
  it('should generate unique code verifiers', () => {
    const verifier1 = generateCodeVerifier();
    const verifier2 = generateCodeVerifier();
    
    expect(verifier1).not.toBe(verifier2);
    expect(verifier1.length).toBeGreaterThan(32);
  });
  
  it('should generate S256 code challenge', () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier, 'S256');
    
    expect(challenge).not.toBe(verifier);
    expect(challenge.length).toBeGreaterThan(0);
  });
  
  it('should verify correct code verifier', () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier, 'S256');
    const isValid = verifyCodeVerifier(verifier, challenge, 'S256');
    
    expect(isValid).toBe(true);
  });
  
  it('should reject incorrect code verifier', () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier, 'S256');
    const isValid = verifyCodeVerifier('wrong-verifier', challenge, 'S256');
    
    expect(isValid).toBe(false);
  });
});
```

```typescript
// src/middleware/__tests__/rate-limit.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit } from '../rate-limit.ts';
import { createMockContext } from '../../test-utils.ts';

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Clear rate limit store
  });
  
  it('should allow requests within limit', async () => {
    const middleware = rateLimit(60000, 10);
    const c = createMockContext();
    
    for (let i = 0; i < 10; i++) {
      await middleware(c, async () => {});
      expect(c.res.status).not.toBe(429);
    }
  });
  
  it('should block requests exceeding limit', async () => {
    const middleware = rateLimit(60000, 5);
    const c = createMockContext();
    
    // Make 5 requests (within limit)
    for (let i = 0; i < 5; i++) {
      await middleware(c, async () => {});
    }
    
    // 6th request should be blocked
    await middleware(c, async () => {});
    expect(c.res.status).toBe(429);
  });
});
```

```typescript
// tests/integration/security.test.ts (Playwright)
import { test, expect } from '@playwright/test';

test.describe('Security Features', () => {
  test('should enforce rate limiting', async ({ request }) => {
    // Make requests up to limit
    for (let i = 0; i < 10; i++) {
      const response = await request.get('http://localhost:3000/authorize?client_id=test&redirect_uri=https://example.com&response_type=code&scope=openid');
      expect(response.status()).not.toBe(429);
    }
    
    // Next request should be rate limited
    const response = await request.get('http://localhost:3000/authorize?client_id=test&redirect_uri=https://example.com&response_type=code&scope=openid');
    expect(response.status()).toBe(429);
  });
  
  test('should include security headers', async ({ request }) => {
    const response = await request.get('http://localhost:3000/.well-known/openid-configuration');
    const headers = response.headers();
    
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });
  
  test('should validate PKCE code verifier', async ({ request }) => {
    // Get authorization code with PKCE
    const codeChallenge = 'test-challenge';
    const authResponse = await request.get(
      `http://localhost:3000/authorize?client_id=test&redirect_uri=https://example.com&response_type=code&scope=openid&code_challenge=${codeChallenge}&code_challenge_method=S256`
    );
    const code = extractCodeFromRedirect(authResponse);
    
    // Try to exchange with wrong code_verifier
    const tokenResponse = await request.post('http://localhost:3000/token', {
      form: {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: 'https://example.com',
        client_id: 'test',
        code_verifier: 'wrong-verifier',
      },
    });
    
    expect(tokenResponse.status()).toBe(400);
  });
});
```

## Success Criteria
- [ ] PKCE is fully implemented and validated
- [ ] State parameters are generated and validated correctly
- [ ] Nonce values are included in ID tokens and validated
- [ ] Rate limiting prevents abuse
- [ ] Token replay prevention is in place
- [ ] HTTPS is enforced in production
- [ ] All input is validated and sanitized
- [ ] Security headers are set correctly
- [ ] Security events are logged appropriately
- [ ] All unit tests for security features pass
- [ ] Integration tests for security features pass

