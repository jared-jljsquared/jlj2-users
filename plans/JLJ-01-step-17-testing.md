# Step 17: Testing and Validation

## Overview
Create comprehensive test suite and validate OIDC compliance using standard OIDC conformance tests. Ensure all flows work correctly and security measures are effective.

**Note:** Each step in the implementation plan includes its own testing section with specific unit tests (Vitest) and integration tests (Playwright) relevant to that step. This step focuses on overall test infrastructure, end-to-end testing, and OIDC conformance validation.

## Sub-steps

### 17.1 Unit Tests for Core Components
Create unit tests for:
- JWT creation and verification
- Token signing and validation
- Key management operations
- User management functions
- Client management functions
- Provider token validation

### 17.2 Integration Tests for OAuth Flows
Create integration tests for:
- Authorization code flow (happy path)
- Authorization code flow with PKCE
- Token exchange
- Refresh token flow
- Error scenarios (invalid codes, expired tokens, etc.)

### 17.3 Provider Integration Tests
Test external provider integrations:
- Google token validation
- Microsoft token validation
- Facebook token validation
- Account linking scenarios

### 17.4 Security Testing
Test security measures:
- CSRF protection (state parameter)
- Token replay prevention
- Rate limiting effectiveness
- Input validation
- PKCE enforcement

### 17.5 OIDC Conformance Testing
Use OIDC conformance test suite:
- Set up OIDC Provider Conformance Test (from OpenID Foundation)
- Run automated conformance tests
- Fix any compliance issues
- Document test results

### 17.6 Load and Performance Testing
Test application performance:
- Token generation performance
- Concurrent request handling
- Key rotation performance
- Database/storage performance (if applicable)

### 17.7 Manual Testing Scenarios
Create manual test scenarios:
- End-to-end authentication flow
- Multiple provider authentication
- Token refresh scenarios
- Error handling and user experience

## Code Samples

### Example: JWT Unit Test
```typescript
// src/tokens/__tests__/jwt.test.ts
import { describe, it, expect } from 'vitest';
import { signJWT, verifyJWT } from '../jwt.ts';
import { generateKeyPair } from 'crypto';
import { promisify } from 'util';

const generateKeyPairAsync = promisify(generateKeyPair);

describe('JWT Operations', () => {
  it('should sign and verify JWT with RS256', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    });
    
    const payload = {
      sub: 'user123',
      iss: 'https://example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    
    const token = signJWT(payload, privateKey, 'RS256');
    const { payload: verifiedPayload } = verifyJWT(token, publicKey, 'RS256');
    
    expect(verifiedPayload.sub).toBe('user123');
  });
  
  it('should reject expired tokens', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    });
    
    const payload = {
      sub: 'user123',
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired
    };
    
    const token = signJWT(payload, privateKey, 'RS256');
    
    expect(() => {
      verifyJWT(token, publicKey, 'RS256');
    }).toThrow('JWT has expired');
  });
});
```

### Example: Authorization Flow Integration Test
```typescript
// src/flows/__tests__/authorization.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { handleAuthorization } from '../authorization.ts';

describe('Authorization Flow', () => {
  let app: Hono;
  
  beforeEach(() => {
    app = new Hono();
    app.get('/authorize', handleAuthorization);
  });
  
  it('should redirect with authorization code', async () => {
    const req = new Request(
      'http://localhost/authorize?client_id=test-client&redirect_uri=https://example.com/callback&response_type=code&scope=openid%20profile&state=test-state'
    );
    const res = await app.request(req);
    
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('code=');
    expect(location).toContain('state=test-state');
  });
  
  it('should reject invalid client_id', async () => {
    const req = new Request(
      'http://localhost/authorize?client_id=invalid-client&redirect_uri=https://example.com/callback&response_type=code&scope=openid'
    );
    const res = await app.request(req);
    
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('error=');
  });
});
```

### Example: Provider Validation Test
```typescript
// src/providers/__tests__/google.test.ts
import { describe, it, expect } from 'vitest';
import { validateGoogleToken } from '../google.ts';

describe('Google Provider', () => {
  it('should validate valid Google ID token', async () => {
    // Mock Google token (in real test, use actual token from Google)
    const mockToken = 'eyJ...'; // Valid Google ID token
    
    const userInfo = await validateGoogleToken(mockToken);
    
    expect(userInfo.sub).toBeDefined();
    expect(userInfo.email).toBeDefined();
  });
  
  it('should reject invalid token signature', async () => {
    const invalidToken = 'invalid.token.signature';
    
    await expect(validateGoogleToken(invalidToken)).rejects.toThrow();
  });
});
```

### Example: Security Test
```typescript
// src/middleware/__tests__/rate-limit.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { rateLimit } from '../rate-limit.ts';

describe('Rate Limiting', () => {
  it('should allow requests within limit', async () => {
    const app = new Hono();
    app.use(rateLimit(60000, 10)); // 10 requests per minute
    app.get('/test', (c) => c.json({ ok: true }));
    
    for (let i = 0; i < 10; i++) {
      const req = new Request('http://localhost/test');
      const res = await app.request(req);
      expect(res.status).toBe(200);
    }
  });
  
  it('should block requests exceeding limit', async () => {
    const app = new Hono();
    app.use(rateLimit(60000, 5));
    app.get('/test', (c) => c.json({ ok: true }));
    
    // Make 5 requests (within limit)
    for (let i = 0; i < 5; i++) {
      const req = new Request('http://localhost/test');
      await app.request(req);
    }
    
    // 6th request should be blocked
    const req = new Request('http://localhost/test');
    const res = await app.request(req);
    expect(res.status).toBe(429);
  });
});
```

## Test Configuration

### Example: Test Setup
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

## OIDC Conformance Testing

### Setup Instructions
1. Register your provider with OpenID Foundation's conformance test suite
2. Configure test client with your provider's endpoints
3. Run automated test suite
4. Address any failing tests
5. Document compliance status

## Success Criteria
- [ ] Unit tests cover all core components (>80% coverage)
- [ ] Integration tests validate all OAuth flows
- [ ] Provider integration tests pass
- [ ] Security tests validate protection mechanisms
- [ ] OIDC conformance tests pass
- [ ] Performance tests meet requirements
- [ ] Manual test scenarios are documented and pass
- [ ] Test results are documented

