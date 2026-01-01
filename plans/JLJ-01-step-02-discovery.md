# Step 2: Core OIDC Configuration and Discovery

## Overview
Implement OIDC discovery endpoints and configuration management to expose provider capabilities and endpoints according to the OpenID Connect Discovery 1.0 specification.

## Sub-steps

### 2.1 Implement Well-Known Configuration Endpoint
Create the `/.well-known/openid-configuration` endpoint that returns OIDC provider metadata in JSON format.

### 2.2 Implement Well-Known JWKS URI
Create the `/.well-known/jwks.json` endpoint that returns the JSON Web Key Set (JWKS) for public key distribution.

### 2.3 Configuration Management
Build a configuration service that:
- Reads from environment variables
- Provides default values for development
- Validates configuration on startup
- Exposes configuration to other modules

### 2.4 Metadata Response Structure
Ensure the discovery endpoint returns all required OIDC metadata fields:
- `issuer` - The issuer identifier
- `authorization_endpoint` - Authorization endpoint URL
- `token_endpoint` - Token endpoint URL
- `userinfo_endpoint` - UserInfo endpoint URL
- `jwks_uri` - JWKS endpoint URL
- `response_types_supported` - Supported response types
- `subject_types_supported` - Supported subject identifier types
- `id_token_signing_alg_values_supported` - Supported signing algorithms
- `scopes_supported` - Supported scopes
- `token_endpoint_auth_methods_supported` - Supported authentication methods

## Code Samples

### Example: Discovery Endpoint Implementation
```typescript
// src/oidc/discovery.ts
import type { Context } from 'hono';
import { getOidcConfig } from './config.ts';

export const handleDiscovery = (c: Context) => {
  const config = getOidcConfig();
  
  const discoveryDocument = {
    issuer: config.issuer,
    authorization_endpoint: config.authorizationEndpoint,
    token_endpoint: config.tokenEndpoint,
    userinfo_endpoint: config.userinfoEndpoint,
    jwks_uri: config.jwksUri,
    response_types_supported: config.responseTypesSupported,
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256', 'ES256'],
    response_modes_supported: ['query', 'fragment'],
    grant_types_supported: config.grantTypesSupported,
    acr_values_supported: [],
    token_endpoint_auth_methods_supported: config.tokenEndpointAuthMethodsSupported,
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    display_values_supported: ['page'],
    claim_types_supported: ['normal'],
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'auth_time',
      'nonce',
      'email',
      'email_verified',
      'name',
      'given_name',
      'family_name',
      'picture'
    ],
    scopes_supported: config.scopesSupported,
    code_challenge_methods_supported: ['S256', 'plain'],
  };
  
  return c.json(discoveryDocument);
};
```

### Example: Route Registration
```typescript
// src/app.ts (addition)
import { Hono } from 'hono';
import { handleDiscovery } from './oidc/discovery.ts';

const app = new Hono();
app.get('/.well-known/openid-configuration', handleDiscovery);
```

## Testing

### Unit Tests (Vitest)
- **Discovery Document Generation**: Test `handleDiscovery` function
  - Verify all required OIDC metadata fields are present
  - Verify field values match configuration
  - Test with different issuer configurations
  - Verify correct JSON structure

### Integration Tests (Playwright)
- **Discovery Endpoint**: Test `/.well-known/openid-configuration` endpoint
  - Verify endpoint returns 200 status
  - Verify Content-Type is `application/json`
  - Verify response contains all required OIDC fields
  - Verify `issuer` field matches configuration
  - Verify endpoints are correctly formed URLs
  - Test CORS headers if applicable

### Test Examples
```typescript
// src/oidc/__tests__/discovery.test.ts
import { describe, it, expect } from 'vitest';
import { handleDiscovery } from '../discovery.ts';
import { createMockContext } from '../../test-utils.ts';

describe('Discovery Endpoint', () => {
  it('should return all required OIDC metadata fields', async () => {
    const c = createMockContext();
    await handleDiscovery(c);
    
    const response = c.res as { json: () => unknown };
    const document = response.json() as Record<string, unknown>;
    
    expect(document).toHaveProperty('issuer');
    expect(document).toHaveProperty('authorization_endpoint');
    expect(document).toHaveProperty('token_endpoint');
    expect(document).toHaveProperty('userinfo_endpoint');
    expect(document).toHaveProperty('jwks_uri');
    expect(document).toHaveProperty('response_types_supported');
    expect(document).toHaveProperty('scopes_supported');
  });
  
  it('should include correct signing algorithms', async () => {
    const c = createMockContext();
    await handleDiscovery(c);
    
    const document = (c.res as { json: () => unknown }).json() as Record<string, unknown>;
    const algorithms = document.id_token_signing_alg_values_supported as string[];
    
    expect(algorithms).toContain('RS256');
    expect(algorithms).toContain('ES256');
  });
});
```

```typescript
// tests/integration/discovery.test.ts (Playwright)
import { test, expect } from '@playwright/test';

test.describe('OIDC Discovery', () => {
  test('should return valid discovery document', async ({ request }) => {
    const response = await request.get('http://localhost:3000/.well-known/openid-configuration');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    
    const document = await response.json();
    
    expect(document).toHaveProperty('issuer');
    expect(document).toHaveProperty('authorization_endpoint');
    expect(document).toHaveProperty('token_endpoint');
    expect(document).toHaveProperty('jwks_uri');
    expect(Array.isArray(document.scopes_supported)).toBe(true);
    expect(document.scopes_supported).toContain('openid');
  });
  
  test('should have valid endpoint URLs', async ({ request }) => {
    const response = await request.get('http://localhost:3000/.well-known/openid-configuration');
    const document = await response.json();
    
    expect(document.authorization_endpoint).toMatch(/^https?:\/\//);
    expect(document.token_endpoint).toMatch(/^https?:\/\//);
    expect(document.userinfo_endpoint).toMatch(/^https?:\/\//);
  });
});
```

## Success Criteria
- [ ] Discovery endpoint returns valid OIDC configuration JSON
- [ ] JWKS URI endpoint is accessible (keys will be added in Step 4)
- [ ] Configuration is validated on application startup
- [ ] All required OIDC metadata fields are present
- [ ] Endpoint responds with correct Content-Type headers
- [ ] Unit tests for discovery document generation pass
- [ ] Integration tests for discovery endpoint pass

