# Step 10: Token Endpoint Implementation

## Overview
Create the token endpoint that issues access tokens, ID tokens, and refresh tokens with proper validation and security. This endpoint handles the authorization code exchange and refresh token flows.

## Sub-steps

### 8.1 Token Endpoint Request Validation
Validate incoming token requests:
- Content-Type must be `application/x-www-form-urlencoded`
- Client authentication (client_secret_basic or client_secret_post)
- Grant type validation
- Required parameters for each grant type

### 8.2 Access Token Generation
Generate access tokens (JWTs) with:
- Issuer (iss)
- Subject (sub) - user identifier
- Audience (aud) - client_id
- Expiration (exp)
- Issued at (iat)
- Scopes (scope)
- Client ID (client_id)

### 8.3 ID Token Generation
Generate ID tokens (JWTs) with:
- All standard OIDC claims (iss, sub, aud, exp, iat, auth_time)
- Nonce (if provided in authorization request)
- User claims based on requested scopes
- Signed with provider's private key

### 8.4 Refresh Token Generation
Generate refresh tokens:
- Long-lived tokens for obtaining new access tokens
- Store refresh token with metadata (user_id, client_id, scopes)
- Include expiration (typically 30-90 days)

### 8.5 Token Response Format
Format token response according to OAuth 2.0 specification:
- `access_token` - JWT access token
- `token_type` - Always "Bearer"
- `expires_in` - Token lifetime in seconds
- `refresh_token` - Refresh token (if applicable)
- `id_token` - ID token (for OIDC)
- `scope` - Granted scopes

### 8.6 Refresh Token Flow
Implement refresh token exchange:
- Validate refresh token
- Verify client credentials
- Generate new access token and ID token
- Optionally rotate refresh token

### 8.7 Token Storage and Revocation Tracking
Implement storage for:
- Active refresh tokens
- Revoked tokens (for token introspection)
- Token metadata for auditing

## Code Samples

### Example: Token Endpoint Handler
```typescript
// src/flows/token.ts
import type { Context } from 'hono';
import { validateTokenRequest } from './validation.ts';
import { generateAccessToken, generateIdToken } from '../tokens/jwt.ts';
import { generateRefreshToken } from './refresh-tokens.ts';

export const handleTokenRequest = async (c: Context) => {
  try {
    // Validate request - Hono handles form data via c.req.formData() or c.req.json()
    const body = await c.req.parseBody();
    const validation = await validateTokenRequest(body);
    if (!validation.isValid) {
      return c.json({
        error: validation.error,
        error_description: validation.errorDescription,
      }, 400);
    }
    
    const { grantType, clientId, code, redirectUri, codeVerifier } = validation.data;
    
    if (grantType === 'authorization_code') {
      // Exchange authorization code for tokens
      const codeData = validateAuthorizationCode(code, clientId, redirectUri);
      if (!codeData) {
        return c.json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code',
        }, 400);
      }
      
      // Verify PKCE if applicable
      if (codeData.codeChallenge && codeVerifier) {
        if (!verifyCodeVerifier(
          codeVerifier,
          codeData.codeChallenge,
          codeData.codeChallengeMethod || 'plain'
        )) {
          return c.json({
            error: 'invalid_grant',
            error_description: 'Invalid code_verifier',
          }, 400);
        }
      }
      
      // Generate tokens
      const accessToken = await generateAccessToken({
        sub: codeData.userId,
        aud: clientId,
        scopes: codeData.scopes,
      });
      
      const idToken = await generateIdToken({
        sub: codeData.userId,
        aud: clientId,
        nonce: codeData.nonce,
      });
      
      const refreshToken = await generateRefreshToken({
        userId: codeData.userId,
        clientId,
        scopes: codeData.scopes,
      });
      
      return c.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600, // 1 hour
        refresh_token: refreshToken,
        id_token: idToken,
        scope: codeData.scopes.join(' '),
      });
    }
    
    if (grantType === 'refresh_token') {
      // Handle refresh token flow
      const refreshTokenData = await validateRefreshToken(
        body.refresh_token as string,
        clientId
      );
      
      if (!refreshTokenData) {
        return c.json({
          error: 'invalid_grant',
          error_description: 'Invalid refresh token',
        }, 400);
      }
      
      // Generate new tokens
      const accessToken = await generateAccessToken({
        sub: refreshTokenData.userId,
        aud: clientId,
        scopes: refreshTokenData.scopes,
      });
      
      const idToken = await generateIdToken({
        sub: refreshTokenData.userId,
        aud: clientId,
      });
      
      return c.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: idToken,
        scope: refreshTokenData.scopes.join(' '),
      });
    }
    
    return c.json({
      error: 'unsupported_grant_type',
      error_description: 'Grant type not supported',
    }, 400);
  } catch (error) {
    return c.json({
      error: 'server_error',
      error_description: 'An internal error occurred',
    }, 500);
  }
};
```

### Example: Access Token Generation
```typescript
// src/tokens/jwt.ts
import { signJWT } from './jwt.ts';
import { getPrivateKey } from '../oidc/key-management.ts';
import { getOidcConfig } from '../oidc/config.ts';

export const generateAccessToken = async (claims: {
  sub: string;
  aud: string;
  scopes: string[];
}): Promise<string> => {
  const config = getOidcConfig();
  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    iss: config.issuer,
    sub: claims.sub,
    aud: claims.aud,
    exp: now + 3600, // 1 hour
    iat: now,
    scope: claims.scopes.join(' '),
    client_id: claims.aud,
  };
  
  const privateKey = await getPrivateKey();
  return signJWT(payload, privateKey, 'RS256');
};
```

### Example: ID Token Generation
```typescript
// src/tokens/jwt.ts
import { getUserById } from '../users/service.ts';

export const generateIdToken = async (claims: {
  sub: string;
  aud: string;
  nonce?: string;
}): Promise<string> => {
  const config = getOidcConfig();
  const now = Math.floor(Date.now() / 1000);
  
  // Fetch user data for claims
  const user = await getUserById(claims.sub);
  
  const payload = {
    iss: config.issuer,
    sub: claims.sub,
    aud: claims.aud,
    exp: now + 3600,
    iat: now,
    auth_time: now,
    nonce: claims.nonce,
    email: user.email,
    email_verified: user.emailVerified,
    name: user.name,
    given_name: user.givenName,
    family_name: user.familyName,
    picture: user.picture,
  };
  
  const privateKey = await getPrivateKey();
  return signJWT(payload, privateKey, 'RS256');
};
```

## Testing

### Unit Tests (Vitest)
- **Access Token Generation**: Test access token creation
  - Test tokens contain all required claims (iss, sub, aud, exp, iat)
  - Test tokens include correct scopes
  - Test tokens have correct expiration time
  - Test tokens are valid JWTs
  - Test tokens can be verified with public key

- **ID Token Generation**: Test ID token creation
  - Test tokens contain all required OIDC claims
  - Test tokens include user claims based on scopes
  - Test nonce is included when provided
  - Test auth_time is set correctly
  - Test tokens are valid JWTs

- **Refresh Token Generation**: Test refresh token creation
  - Test refresh tokens are generated
  - Test refresh tokens are stored with metadata
  - Test refresh tokens have correct expiration
  - Test refresh token validation works

- **Token Request Validation**: Test token request validation
  - Test valid authorization code exchange succeeds
  - Test invalid authorization code is rejected
  - Test expired authorization code is rejected
  - Test wrong client credentials are rejected
  - Test invalid PKCE code_verifier is rejected
  - Test refresh token exchange works

### Integration Tests (Playwright)
- **Token Endpoint**: Test `/token` endpoint
  - Test authorization code exchange returns tokens
  - Test response format matches OAuth 2.0 specification
  - Test access_token is a valid JWT
  - Test id_token is a valid JWT
  - Test refresh_token is provided
  - Test invalid authorization code returns error
  - Test invalid client credentials return error
  - Test PKCE code_verifier validation works

- **Refresh Token Flow**: Test refresh token endpoint
  - Test refresh token exchange returns new tokens
  - Test new access token is valid
  - Test new ID token is valid
  - Test invalid refresh token returns error
  - Test expired refresh token returns error

- **End-to-End Token Flow**: Test complete token flow
  - Test authorization code → token exchange
  - Test token refresh flow
  - Test tokens can be used to access protected resources

### Test Examples
```typescript
// src/tokens/__tests__/access-token.test.ts
import { describe, it, expect } from 'vitest';
import { generateAccessToken } from '../jwt.ts';
import { getPrivateKey, getPublicKey } from '../key-management.ts';

describe('Access Token Generation', () => {
  it('should generate valid access token', async () => {
    const token = await generateAccessToken({
      sub: 'user123',
      aud: 'client123',
      scopes: ['openid', 'profile'],
    });
    
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    
    const publicKey = await getPublicKey();
    const { payload } = verifyJWT(token, publicKey, 'RS256');
    
    expect(payload.sub).toBe('user123');
    expect(payload.aud).toBe('client123');
    expect(payload.scope).toBe('openid profile');
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
  
  it('should include correct expiration time', async () => {
    const token = await generateAccessToken({
      sub: 'user123',
      aud: 'client123',
      scopes: ['openid'],
    });
    
    const { payload } = verifyJWT(token, await getPublicKey(), 'RS256');
    const exp = payload.exp as number;
    const iat = payload.iat as number;
    
    expect(exp - iat).toBe(3600); // 1 hour
  });
});
```

```typescript
// src/tokens/__tests__/id-token.test.ts
import { describe, it, expect } from 'vitest';
import { generateIdToken } from '../jwt.ts';
import { getPublicKey } from '../key-management.ts';

describe('ID Token Generation', () => {
  it('should generate valid ID token with all required claims', async () => {
    const token = await generateIdToken({
      sub: 'user123',
      aud: 'client123',
      nonce: 'test-nonce',
    });
    
    const { payload } = verifyJWT(token, await getPublicKey(), 'RS256');
    
    expect(payload.iss).toBeDefined();
    expect(payload.sub).toBe('user123');
    expect(payload.aud).toBe('client123');
    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();
    expect(payload.auth_time).toBeDefined();
    expect(payload.nonce).toBe('test-nonce');
  });
  
  it('should include user claims based on scopes', async () => {
    const token = await generateIdToken({
      sub: 'user123',
      aud: 'client123',
    });
    
    const { payload } = verifyJWT(token, await getPublicKey(), 'RS256');
    
    expect(payload.email).toBeDefined();
    expect(payload.email_verified).toBeDefined();
  });
});
```

```typescript
// tests/integration/token-endpoint.test.ts (Playwright)
import { test, expect } from '@playwright/test';

test.describe('Token Endpoint', () => {
  test('should exchange authorization code for tokens', async ({ request }) => {
    // First get authorization code
    const authResponse = await request.get(
      'http://localhost:3000/authorize?client_id=test-client&redirect_uri=https://example.com/callback&response_type=code&scope=openid'
    );
    const authUrl = authResponse.headers()['location'];
    const code = new URL(authUrl).searchParams.get('code');
    
    // Exchange code for tokens
    const tokenResponse = await request.post('http://localhost:3000/token', {
      form: {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: 'https://example.com/callback',
        client_id: 'test-client',
        client_secret: 'test-secret',
      },
    });
    
    expect(tokenResponse.ok()).toBeTruthy();
    const tokens = await tokenResponse.json();
    
    expect(tokens).toHaveProperty('access_token');
    expect(tokens).toHaveProperty('id_token');
    expect(tokens).toHaveProperty('refresh_token');
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBe(3600);
  });
  
  test('should reject invalid authorization code', async ({ request }) => {
    const response = await request.post('http://localhost:3000/token', {
      form: {
        grant_type: 'authorization_code',
        code: 'invalid-code',
        redirect_uri: 'https://example.com/callback',
        client_id: 'test-client',
        client_secret: 'test-secret',
      },
    });
    
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('invalid_grant');
  });
  
  test('should refresh tokens with refresh token', async ({ request }) => {
    // Get initial tokens (setup from previous test)
    const refreshToken = 'valid-refresh-token';
    
    const response = await request.post('http://localhost:3000/token', {
      form: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: 'test-client',
        client_secret: 'test-secret',
      },
    });
    
    expect(response.ok()).toBeTruthy();
    const tokens = await response.json();
    expect(tokens).toHaveProperty('access_token');
    expect(tokens).toHaveProperty('id_token');
  });
});
```

## Success Criteria
- [ ] Token endpoint validates all request parameters
- [ ] Access tokens are generated as JWTs with correct claims
- [ ] ID tokens include all required OIDC claims
- [ ] Refresh tokens are generated and stored securely
- [ ] Token responses follow OAuth 2.0 format
- [ ] Refresh token flow works correctly
- [ ] Tokens are signed with provider's private key
- [ ] Token expiration is properly set
- [ ] All unit tests for token generation pass
- [ ] Integration tests for token endpoint pass

