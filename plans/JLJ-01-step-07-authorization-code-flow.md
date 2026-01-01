# Step 7: Authorization Code Flow

## Overview
Implement the OAuth 2.0 authorization code flow including authorization endpoint, token endpoint, and redirect URI handling. This is the primary flow for OIDC authentication.

## Sub-steps

### 7.1 Authorization Request Validation
Validate incoming authorization requests:
- `client_id` - Must be registered
- `redirect_uri` - Must match registered redirect URI
- `response_type` - Must be 'code'
- `scope` - Must include 'openid'
- `state` - Should be present (CSRF protection)
- `code_challenge` and `code_challenge_method` (PKCE support)

### 7.2 Authorization Endpoint
Implement `/authorize` endpoint that:
- Validates the authorization request
- Presents login/consent UI (or auto-approves in development)
- Generates authorization code
- Stores authorization code with metadata
- Redirects to client's redirect_uri with code and state

### 7.3 Authorization Code Storage
Create temporary storage for authorization codes:
- Store code with associated client_id, redirect_uri, scopes, user_id
- Include expiration time (typically 10 minutes)
- Support code lookup and deletion

### 7.4 Token Exchange Request Validation
Validate token exchange requests:
- `grant_type` - Must be 'authorization_code'
- `code` - Must be valid and not expired
- `redirect_uri` - Must match the one used in authorization
- `client_id` and `client_secret` - Must be valid
- `code_verifier` - Must match code_challenge (if PKCE was used)

### 7.5 Token Exchange Implementation
Implement token exchange logic:
- Verify authorization code
- Verify client credentials
- Verify PKCE code_verifier if applicable
- Generate access token, ID token, and refresh token
- Invalidate authorization code (one-time use)
- Return tokens to client

### 7.6 Redirect URI Handling
Implement secure redirect URI validation:
- Exact match or pattern matching for registered URIs
- Prevent open redirect vulnerabilities
- Support multiple redirect URIs per client

## Code Samples

### Example: Authorization Endpoint
```typescript
// src/flows/authorization.ts
import type { Context } from 'hono';
import { validateAuthorizationRequest } from './validation.ts';
import { generateAuthorizationCode } from './codes.ts';

export const handleAuthorization = async (c: Context) => {
  try {
    // Validate request parameters
    const {
      client_id,
      redirect_uri,
      response_type,
      scope,
      state,
      code_challenge,
      code_challenge_method,
    } = c.req.query();
    
    const validation = await validateAuthorizationRequest({
      clientId: client_id,
      redirectUri: redirect_uri,
      responseType: response_type,
      scope: scope,
      state: state,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
    });
    
    if (!validation.isValid) {
      return c.redirect(
        `${redirect_uri}?error=${validation.error}&state=${state || ''}`
      );
    }
    
    // In a real implementation, this would show a login/consent page
    // For now, we'll assume the user is authenticated
    // Session management would be handled separately with Hono sessions
    const userId = 'demo-user-id'; // Get from session/context
    
    // Generate authorization code
    const code = await generateAuthorizationCode({
      clientId: client_id,
      redirectUri: redirect_uri,
      scopes: scope.split(' '),
      userId,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
    });
    
    // Redirect with authorization code
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }
    
    return c.redirect(redirectUrl.toString());
  } catch (error) {
    const redirectUri = c.req.query('redirect_uri');
    const state = c.req.query('state');
    return c.redirect(
      `${redirectUri}?error=server_error&state=${state || ''}`
    );
  }
};
```

### Example: Authorization Code Generation
```typescript
// src/flows/codes.ts
import crypto from 'crypto';

interface AuthorizationCodeData {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  userId: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

const codeStore = new Map<string, AuthorizationCodeData & { expiresAt: Date }>();

export const generateAuthorizationCode = async (
  data: AuthorizationCodeData
): Promise<string> => {
  const code = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  codeStore.set(code, {
    ...data,
    expiresAt,
  });
  
  return code;
};

export const validateAuthorizationCode = (
  code: string,
  clientId: string,
  redirectUri: string
): AuthorizationCodeData | null => {
  const stored = codeStore.get(code);
  
  if (!stored) {
    return null;
  }
  
  if (stored.expiresAt < new Date()) {
    codeStore.delete(code);
    return null;
  }
  
  if (stored.clientId !== clientId || stored.redirectUri !== redirectUri) {
    return null;
  }
  
  // Delete code after validation (one-time use)
  codeStore.delete(code);
  
  return stored;
};
```

### Example: PKCE Verification
```typescript
// src/flows/pkce.ts
import crypto from 'crypto';

export const verifyCodeVerifier = (
  codeVerifier: string,
  codeChallenge: string,
  method: string
): boolean => {
  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  }
  
  if (method === 'S256') {
    const hash = crypto.createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return hash === codeChallenge;
  }
  
  return false;
};
```

## Testing

### Unit Tests (Vitest)
- **Authorization Code Generation**: Test code generation and storage
  - Test codes are generated with sufficient entropy
  - Test codes are stored with correct metadata
  - Test codes expire after correct time period
  - Test codes are single-use (deleted after validation)
  - Test code validation with correct parameters succeeds
  - Test code validation with wrong client_id fails
  - Test code validation with wrong redirect_uri fails
  - Test expired codes are rejected

- **PKCE Verification**: Test PKCE code verifier validation
  - Test S256 method verification works correctly
  - Test plain method verification works correctly
  - Test invalid code_verifier is rejected
  - Test code_challenge generation produces correct format

- **Authorization Request Validation**: Test request parameter validation
  - Test valid requests pass validation
  - Test missing required parameters fail validation
  - Test invalid client_id is rejected
  - Test invalid redirect_uri is rejected
  - Test invalid response_type is rejected
  - Test missing openid scope is rejected

### Integration Tests (Playwright)
- **Authorization Endpoint**: Test `/authorize` endpoint
  - Test successful authorization redirects with code
  - Test state parameter is preserved in redirect
  - Test invalid client_id redirects with error
  - Test invalid redirect_uri redirects with error
  - Test missing required parameters redirects with error
  - Test PKCE code_challenge is accepted
  - Test authorization code is single-use

- **End-to-End Authorization Flow**: Test complete flow
  - Test full authorization code flow from start to finish
  - Test flow with PKCE
  - Test flow with state parameter
  - Test error scenarios redirect correctly
  - Test code can be exchanged for tokens (after Step 8)

### Test Examples
```typescript
// src/flows/__tests__/authorization-code.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { generateAuthorizationCode, validateAuthorizationCode } from '../codes.ts';

describe('Authorization Code', () => {
  beforeEach(() => {
    // Clear code store
  });
  
  it('should generate unique codes', async () => {
    const code1 = await generateAuthorizationCode({
      clientId: 'client1',
      redirectUri: 'https://example.com/callback',
      scopes: ['openid'],
      userId: 'user1',
    });
    
    const code2 = await generateAuthorizationCode({
      clientId: 'client1',
      redirectUri: 'https://example.com/callback',
      scopes: ['openid'],
      userId: 'user1',
    });
    
    expect(code1).not.toBe(code2);
  });
  
  it('should validate correct code', () => {
    const code = generateAuthorizationCode({...});
    const result = validateAuthorizationCode(code, 'client1', 'https://example.com/callback');
    
    expect(result).not.toBeNull();
    expect(result?.clientId).toBe('client1');
  });
  
  it('should reject expired codes', async () => {
    // Mock time to create expired code
    const code = await generateAuthorizationCode({...});
    // Advance time past expiration
    const result = validateAuthorizationCode(code, 'client1', 'https://example.com/callback');
    
    expect(result).toBeNull();
  });
  
  it('should be single-use', () => {
    const code = generateAuthorizationCode({...});
    validateAuthorizationCode(code, 'client1', 'https://example.com/callback');
    
    // Second use should fail
    const result = validateAuthorizationCode(code, 'client1', 'https://example.com/callback');
    expect(result).toBeNull();
  });
});
```

```typescript
// src/flows/__tests__/pkce.test.ts
import { describe, it, expect } from 'vitest';
import { verifyCodeVerifier, generateCodeChallenge } from '../pkce.ts';

describe('PKCE', () => {
  it('should verify S256 code verifier', () => {
    const verifier = 'test-verifier-123';
    const challenge = generateCodeChallenge(verifier, 'S256');
    const isValid = verifyCodeVerifier(verifier, challenge, 'S256');
    
    expect(isValid).toBe(true);
  });
  
  it('should verify plain code verifier', () => {
    const verifier = 'test-verifier-123';
    const challenge = generateCodeChallenge(verifier, 'plain');
    const isValid = verifyCodeVerifier(verifier, challenge, 'plain');
    
    expect(isValid).toBe(true);
  });
  
  it('should reject invalid code verifier', () => {
    const verifier = 'test-verifier-123';
    const challenge = generateCodeChallenge(verifier, 'S256');
    const isValid = verifyCodeVerifier('wrong-verifier', challenge, 'S256');
    
    expect(isValid).toBe(false);
  });
});
```

```typescript
// tests/integration/authorization-flow.test.ts (Playwright)
import { test, expect } from '@playwright/test';

test.describe('Authorization Code Flow', () => {
  test('should redirect with authorization code', async ({ page }) => {
    const redirectUri = 'https://example.com/callback';
    const state = 'test-state-123';
    
    await page.goto(
      `http://localhost:3000/authorize?client_id=test-client&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid&state=${state}`
    );
    
    // Should redirect to callback with code
    const url = page.url();
    expect(url).toContain(redirectUri);
    expect(url).toContain('code=');
    expect(url).toContain(`state=${state}`);
  });
  
  test('should include error in redirect for invalid client', async ({ page }) => {
    await page.goto(
      'http://localhost:3000/authorize?client_id=invalid-client&redirect_uri=https://example.com/callback&response_type=code&scope=openid'
    );
    
    const url = page.url();
    expect(url).toContain('error=');
  });
  
  test('should support PKCE', async ({ page }) => {
    const codeChallenge = 'test-challenge';
    await page.goto(
      `http://localhost:3000/authorize?client_id=test-client&redirect_uri=https://example.com/callback&response_type=code&scope=openid&code_challenge=${codeChallenge}&code_challenge_method=S256`
    );
    
    const url = page.url();
    expect(url).toContain('code=');
  });
});
```

## Success Criteria
- [ ] Authorization endpoint validates all required parameters
- [ ] Authorization codes are generated securely
- [ ] Authorization codes expire after 10 minutes
- [ ] Authorization codes are single-use
- [ ] Token exchange validates code and client credentials
- [ ] PKCE code_verifier is validated correctly
- [ ] Redirect URIs are validated securely
- [ ] State parameter is preserved through the flow
- [ ] All unit tests for authorization flow pass
- [ ] Integration tests for authorization endpoint pass

