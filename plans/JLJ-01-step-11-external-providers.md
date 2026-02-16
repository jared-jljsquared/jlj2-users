# Step 11: External Provider Integration

## Overview
Implement integration with major identity providers (Google, Microsoft, Facebook) to accept and validate their ID tokens. This allows users to authenticate using their existing accounts from these providers.

## Common Sub-steps (Applied to All Providers)

### 9.1 Provider Configuration
Set up provider-specific configuration:
- Client ID and Client Secret from provider
- Discovery endpoint URLs
- Provider-specific scopes
- Token validation endpoints

### 9.2 Provider Discovery
Fetch and cache provider discovery documents:
- Well-known configuration endpoints
- JWKS endpoints for public key retrieval
- Token validation endpoints

### 9.3 Token Validation
Implement token validation:
- Verify token signature using provider's public keys
- Validate token claims (iss, aud, exp, etc.)
- Verify token hasn't been tampered with

### 9.4 User Information Extraction
Extract user information from provider tokens:
- Map provider user ID to local user account
- Extract email, name, and other profile information
- Handle provider-specific claim formats

### 9.5 Account Linking
Link external provider accounts to local user accounts:
- Create or find user by email
- Store provider user ID mapping
- Support multiple providers per user

## Provider-Specific Details

### Google OIDC Integration

#### Google-Specific Configuration
```typescript
// src/providers/google.ts
export const GOOGLE_CONFIG = {
  discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  scopes: ['openid', 'profile', 'email'],
};
```

#### Google Token Validation
- Google uses RS256 for token signing
- JWKS available at `https://www.googleapis.com/oauth2/v3/certs`
- Validate `iss` claim: `https://accounts.google.com` or `accounts.google.com`
- Validate `aud` claim matches your Google Client ID

#### Code Sample: Google Token Validation
```typescript
// src/providers/google.ts
import { verifyJWT } from '../tokens/jwt.ts';
import { fetchGooglePublicKeys } from './google-keys.ts';

export const validateGoogleToken = async (idToken: string): Promise<GoogleUserInfo> => {
  // Parse token to get key ID
  const parts = idToken.split('.');
  const header = JSON.parse(
    Buffer.from(parts[0], 'base64url').toString()
  );
  
  // Fetch Google's public key
  const publicKey = await fetchGooglePublicKeys(header.kid);
  
  // Verify token
  const { payload } = verifyJWT(idToken, publicKey, 'RS256');
  
  // Validate claims
  if (payload.iss !== 'https://accounts.google.com' && 
      payload.iss !== 'accounts.google.com') {
    throw new Error('Invalid token issuer');
  }
  
  if (payload.aud !== GOOGLE_CONFIG.clientId) {
    throw new Error('Invalid token audience');
  }
  
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    emailVerified: payload.email_verified as boolean,
    name: payload.name as string,
    picture: payload.picture as string,
  };
};
```

### Microsoft OIDC Integration

#### Microsoft-Specific Configuration
```typescript
// src/providers/microsoft.ts
export const MICROSOFT_CONFIG = {
  discoveryUrl: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
  clientId: process.env.MICROSOFT_CLIENT_ID || '',
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
  scopes: ['openid', 'profile', 'email'],
  tenant: process.env.MICROSOFT_TENANT || 'common', // or specific tenant ID
};
```

#### Microsoft Token Validation
- Microsoft uses RS256 for token signing
- JWKS available via discovery document
- Validate `iss` claim: `https://login.microsoftonline.com/{tenant-id}/v2.0`
- Validate `aud` claim matches your Microsoft Client ID
- Note: Microsoft uses `oid` (object ID) as the subject identifier

#### Code Sample: Microsoft Token Validation
```typescript
// src/providers/microsoft.ts
export const validateMicrosoftToken = async (idToken: string): Promise<MicrosoftUserInfo> => {
  const parts = idToken.split('.');
  const header = JSON.parse(
    Buffer.from(parts[0], 'base64url').toString()
  );
  
  const publicKey = await fetchMicrosoftPublicKeys(header.kid);
  const { payload } = verifyJWT(idToken, publicKey, 'RS256');
  
  // Microsoft uses oid as the subject identifier
  const sub = (payload.oid || payload.sub) as string;
  
  if (!payload.iss?.toString().startsWith('https://login.microsoftonline.com/')) {
    throw new Error('Invalid token issuer');
  }
  
  return {
    sub,
    email: payload.email as string,
    name: payload.name as string,
    preferredUsername: payload.preferred_username as string,
  };
};
```

### Facebook OAuth 2.0 Integration

**Note:** Facebook uses OAuth 2.0, not full OIDC. They provide access tokens, not ID tokens.

#### Facebook-Specific Configuration
```typescript
// src/providers/facebook.ts
export const FACEBOOK_CONFIG = {
  tokenValidationUrl: 'https://graph.facebook.com/debug_token',
  userInfoUrl: 'https://graph.facebook.com/me',
  clientId: process.env.FACEBOOK_APP_ID || '',
  clientSecret: process.env.FACEBOOK_APP_SECRET || '',
  scopes: ['email', 'public_profile'],
};
```

#### Facebook Token Validation
- Facebook uses access tokens, not ID tokens
- Validate token by calling Facebook's debug_token endpoint
- Fetch user info from Graph API
- No JWKS - uses API calls for validation

#### Code Sample: Facebook Token Validation
```typescript
// src/providers/facebook.ts
import https from 'https';

export const validateFacebookToken = async (
  accessToken: string
): Promise<FacebookUserInfo> => {
  // Validate token with Facebook
  const validationUrl = new URL(FACEBOOK_CONFIG.tokenValidationUrl);
  validationUrl.searchParams.set('input_token', accessToken);
  validationUrl.searchParams.set('access_token', 
    `${FACEBOOK_CONFIG.clientId}|${FACEBOOK_CONFIG.clientSecret}`
  );
  
  const validationResponse = await fetch(validationUrl.toString());
  const validationData = await validationResponse.json();
  
  if (!validationData.data?.is_valid) {
    throw new Error('Invalid Facebook token');
  }
  
  // Fetch user info
  const userInfoUrl = new URL(FACEBOOK_CONFIG.userInfoUrl);
  userInfoUrl.searchParams.set('access_token', accessToken);
  userInfoUrl.searchParams.set('fields', 'id,name,email,picture');
  
  const userResponse = await fetch(userInfoUrl.toString());
  const userData = await userResponse.json();
  
  return {
    sub: userData.id,
    email: userData.email,
    name: userData.name,
    picture: userData.picture?.data?.url,
  };
};
```

## Unified Provider Interface

### Base Provider Interface
```typescript
// src/providers/base.ts
export interface ProviderUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
}

export interface IdentityProvider {
  name: string;
  validateToken(token: string): Promise<ProviderUserInfo>;
  getAuthorizationUrl(state: string, redirectUri: string): string;
}
```

## Testing

### Unit Tests (Vitest)
- **Google Token Validation**: Test Google ID token validation
  - Test valid Google tokens are verified
  - Test invalid signatures are rejected
  - Test expired tokens are rejected
  - Test wrong issuer is rejected
  - Test wrong audience is rejected
  - Test user info extraction works correctly

- **Microsoft Token Validation**: Test Microsoft ID token validation
  - Test valid Microsoft tokens are verified
  - Test oid claim is used as subject identifier
  - Test issuer validation works
  - Test user info extraction works correctly

- **Facebook Token Validation**: Test Facebook access token validation
  - Test valid Facebook tokens are verified via API
  - Test invalid tokens are rejected
  - Test user info is fetched correctly
  - Test error handling for API failures

- **Public Key Fetching**: Test JWKS key fetching
  - Test Google public keys are fetched correctly
  - Test Microsoft public keys are fetched correctly
  - Test keys are cached appropriately
  - Test key rotation is handled
  - Test invalid key IDs are handled

- **Account Linking**: Test provider account linking
  - Test linking Google account to user
  - Test linking Microsoft account to user
  - Test linking Facebook account to user
  - Test multiple providers can be linked
  - Test duplicate linking is handled

### Integration Tests (Playwright)
- **Google Integration**: Test Google OIDC integration
  - Test Google authorization URL generation
  - Test Google callback handling
  - Test Google token validation endpoint
  - Test user creation from Google account
  - Test account linking with Google

- **Microsoft Integration**: Test Microsoft OIDC integration
  - Test Microsoft authorization URL generation
  - Test Microsoft callback handling
  - Test Microsoft token validation
  - Test user creation from Microsoft account

- **Facebook Integration**: Test Facebook OAuth integration
  - Test Facebook authorization URL generation
  - Test Facebook callback handling
  - Test Facebook token validation
  - Test user creation from Facebook account

### Test Examples
```typescript
// src/providers/__tests__/google.test.ts
import { describe, it, expect, vi } from 'vitest';
import { validateGoogleToken } from '../google.ts';
import { verifyJWT } from '../../tokens/jwt.ts';

vi.mock('../../tokens/jwt.ts');
vi.mock('../google-keys.ts');

describe('Google Token Validation', () => {
  it('should validate valid Google ID token', async () => {
    const mockToken = 'valid.google.token';
    const mockPayload = {
      iss: 'https://accounts.google.com',
      aud: 'google-client-id',
      sub: 'google-user-id',
      email: 'user@gmail.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    
    vi.mocked(verifyJWT).mockResolvedValue({
      header: { alg: 'RS256' },
      payload: mockPayload,
    });
    
    const userInfo = await validateGoogleToken(mockToken);
    
    expect(userInfo.sub).toBe('google-user-id');
    expect(userInfo.email).toBe('user@gmail.com');
  });
  
  it('should reject token with wrong issuer', async () => {
    const mockPayload = {
      iss: 'https://evil.com',
      aud: 'google-client-id',
    };
    
    vi.mocked(verifyJWT).mockResolvedValue({
      header: { alg: 'RS256' },
      payload: mockPayload,
    });
    
    await expect(validateGoogleToken('token')).rejects.toThrow('Invalid token issuer');
  });
  
  it('should reject token with wrong audience', async () => {
    const mockPayload = {
      iss: 'https://accounts.google.com',
      aud: 'wrong-client-id',
    };
    
    vi.mocked(verifyJWT).mockResolvedValue({
      header: { alg: 'RS256' },
      payload: mockPayload,
    });
    
    await expect(validateGoogleToken('token')).rejects.toThrow('Invalid token audience');
  });
});
```

```typescript
// src/providers/__tests__/microsoft.test.ts
import { describe, it, expect } from 'vitest';
import { validateMicrosoftToken } from '../microsoft.ts';

describe('Microsoft Token Validation', () => {
  it('should use oid as subject identifier', async () => {
    const mockPayload = {
      iss: 'https://login.microsoftonline.com/tenant/v2.0',
      aud: 'microsoft-client-id',
      oid: 'microsoft-object-id',
      sub: 'microsoft-subject-id',
    };
    
    // Mock verifyJWT to return payload
    const userInfo = await validateMicrosoftToken('token');
    
    expect(userInfo.sub).toBe('microsoft-object-id'); // Should use oid
  });
});
```

```typescript
// src/providers/__tests__/facebook.test.ts
import { describe, it, expect, vi } from 'vitest';
import { validateFacebookToken } from '../facebook.ts';

global.fetch = vi.fn();

describe('Facebook Token Validation', () => {
  it('should validate valid Facebook token', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { is_valid: true } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'facebook-user-id',
          email: 'user@facebook.com',
          name: 'Facebook User',
        }),
      } as Response);
    
    const userInfo = await validateFacebookToken('valid-token');
    
    expect(userInfo.sub).toBe('facebook-user-id');
    expect(userInfo.email).toBe('user@facebook.com');
  });
  
  it('should reject invalid Facebook token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { is_valid: false } }),
    } as Response);
    
    await expect(validateFacebookToken('invalid-token')).rejects.toThrow('Invalid Facebook token');
  });
});
```

```typescript
// tests/integration/external-providers.test.ts (Playwright)
import { test, expect } from '@playwright/test';

test.describe('External Provider Integration', () => {
  test('should handle Google OIDC callback', async ({ request }) => {
    // Simulate Google callback with ID token
    const response = await request.post('http://localhost:3000/auth/google/callback', {
      data: {
        id_token: 'valid-google-id-token',
      },
    });
    
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('user');
    expect(body.user.email).toBeDefined();
  });
  
  test('should handle Microsoft OIDC callback', async ({ request }) => {
    const response = await request.post('http://localhost:3000/auth/microsoft/callback', {
      data: {
        id_token: 'valid-microsoft-id-token',
      },
    });
    
    expect(response.ok()).toBeTruthy();
  });
  
  test('should handle Facebook OAuth callback', async ({ request }) => {
    const response = await request.post('http://localhost:3000/auth/facebook/callback', {
      data: {
        access_token: 'valid-facebook-access-token',
      },
    });
    
    expect(response.ok()).toBeTruthy();
  });
});
```

## Success Criteria
- [x] Google ID tokens can be validated (Step 11 complete)
- [ ] Microsoft ID tokens can be validated
- [ ] Facebook access tokens can be validated
- [ ] User information is correctly extracted from all providers
- [x] Provider accounts can be linked to local user accounts (Google)
- [x] Public keys are fetched and cached appropriately (Google JWKS)
- [x] Token validation includes all security checks (iss, aud, exp, nbf, signature)
- [x] Provider-specific claim formats are handled correctly (Google)
- [x] All unit tests for Google provider validation pass
- [ ] Integration tests for provider callbacks pass (deferred)

