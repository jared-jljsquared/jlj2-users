# Step 1: Project Foundation and Dependencies

## Overview
Set up the foundational structure, install required dependencies, and configure the development environment for OIDC implementation.

## Sub-steps

### 1.1 Install Core Dependencies
Install necessary npm packages for OIDC implementation:
- `hono` - Web framework (replaces Express)
- `@hono/node-server` - Node.js adapter for Hono
- JWT implementation will be built from scratch using Node.js `crypto` library (no JWT libraries)
- `dotenv` (already installed) for environment configuration
- Optional: `@hono/cors` for CORS support if needed

**Testing Dependencies:**
- `vitest` - Unit testing framework
- `@vitest/ui` - Vitest UI (optional, for test visualization)
- `@playwright/test` - Integration testing framework
- `playwright` - Playwright browser automation

### 1.2 Create Directory Structure
Create the following directory structure:
```
src/
  ├── app.ts (existing)
  ├── plumbing/
  │   ├── logger.ts (existing)
  │   └── crypto-utils.ts (new)
  ├── oidc/
  │   ├── config.ts
  │   ├── discovery.ts
  │   └── types.ts
  ├── tokens/
  │   ├── jwt.ts
  │   ├── key-management.ts
  │   └── validation.ts
  ├── users/
  │   ├── models.ts
  │   ├── storage.ts
  │   └── service.ts
  ├── clients/
  │   ├── models.ts
  │   ├── storage.ts
  │   └── service.ts
  ├── flows/
  │   ├── authorization.ts
  │   ├── token.ts
  │   └── userinfo.ts
  ├── providers/
  │   ├── base.ts
  │   ├── google.ts
  │   ├── microsoft.ts
  │   └── facebook.ts
  └── middleware/
      ├── auth.ts
      └── validation.ts
```

### 1.3 Environment Configuration
Set up environment variables in `.env` file:
- `OIDC_ISSUER` - The base URL of the OIDC provider
- `PORT` - Server port (already exists)
- `NODE_ENV` - Environment (development/production)
- `JWT_SECRET` or `JWT_PRIVATE_KEY` - For signing tokens
- `JWT_PUBLIC_KEY` - For verifying tokens
- `SESSION_SECRET` - For session management
- `DATABASE_URL` - If using a database (optional for initial implementation)
- Provider-specific credentials (Google, Microsoft, Facebook client IDs and secrets)

### 1.4 TypeScript Type Definitions
Create comprehensive TypeScript types for:
- OIDC configuration objects
- JWT payload structures
- Token request/response types
- User and client models
- Provider-specific types

### 1.5 Update package.json Scripts
Add development and testing scripts:
- `dev` - Development server with hot reload
- `test` - Run unit tests with Vitest
- `test:ui` - Run tests with Vitest UI
- `test:integration` - Run integration tests with Playwright
- `test:all` - Run both unit and integration tests
- `lint` - Already exists via biome
- `type-check` - TypeScript type checking

## Code Samples

### Example: Basic OIDC Configuration Type
```typescript
// src/oidc/types.ts
export interface OidcConfig {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksUri: string;
  registrationEndpoint?: string;
  scopesSupported: string[];
  responseTypesSupported: string[];
  grantTypesSupported: string[];
  tokenEndpointAuthMethodsSupported: string[];
}
```

### Example: Environment Configuration
```typescript
// src/oidc/config.ts
export const getOidcConfig = (): OidcConfig => {
  const issuer = process.env.OIDC_ISSUER || `http://localhost:${process.env.PORT || 3000}`;
  
  return {
    issuer,
    authorizationEndpoint: `${issuer}/authorize`,
    tokenEndpoint: `${issuer}/token`,
    userinfoEndpoint: `${issuer}/userinfo`,
    jwksUri: `${issuer}/.well-known/jwks.json`,
    scopesSupported: ['openid', 'profile', 'email'],
    responseTypesSupported: ['code'],
    grantTypesSupported: ['authorization_code', 'refresh_token'],
    tokenEndpointAuthMethodsSupported: ['client_secret_basic', 'client_secret_post'],
  };
};
```

### Example: Hono App Setup
```typescript
// src/app.ts (updated from Express to Hono)
import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { log } from './plumbing/logger.ts';

const app = new Hono();
const port = Number(process.env.PORT) || 3000;

app.get('/', (c) => {
  return c.json({
    message: 'No base get function defined',
  });
});

app.get('/about', (c) => {
  return c.json({
    name: 'jlj2-users',
    version: '0.1.0',
  });
});

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  if (!process.env.PORT) {
    log('process.env.PORT is undefined - defaulting to 3000');
  }
  log(`Hono service listening at http://localhost:${info.port}`);
});
```

## Testing

### Unit Tests (Vitest)
- **Configuration Loading**: Test `getOidcConfig()` function
  - Verify default values when environment variables are not set
  - Verify environment variables override defaults
  - Verify all required configuration fields are present
  - Test with different issuer URLs

### Integration Tests (Playwright)
- **Basic Server Startup**: Verify Hono server starts correctly
  - Test `/` endpoint returns expected response
  - Test `/about` endpoint returns correct JSON
  - Verify server listens on correct port
  - Test server handles requests correctly

### Test Setup
```typescript
// src/oidc/__tests__/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getOidcConfig } from '../config.ts';

describe('OIDC Configuration', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });
  
  it('should use default values when env vars are not set', () => {
    delete process.env.OIDC_ISSUER;
    delete process.env.PORT;
    
    const config = getOidcConfig();
    
    expect(config.issuer).toBe('http://localhost:3000');
    expect(config.authorizationEndpoint).toBe('http://localhost:3000/authorize');
  });
  
  it('should use environment variables when set', () => {
    process.env.OIDC_ISSUER = 'https://example.com';
    process.env.PORT = '8080';
    
    const config = getOidcConfig();
    
    expect(config.issuer).toBe('https://example.com');
    expect(config.tokenEndpoint).toBe('https://example.com/token');
  });
});
```

```typescript
// tests/integration/app.test.ts (Playwright)
import { test, expect } from '@playwright/test';

test.describe('Basic Server', () => {
  test('should respond to root endpoint', async ({ request }) => {
    const response = await request.get('http://localhost:3000/');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('message');
  });
  
  test('should return about information', async ({ request }) => {
    const response = await request.get('http://localhost:3000/about');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('version');
  });
});
```

## Success Criteria
- [ ] All dependencies installed and configured
- [ ] Directory structure created
- [ ] Environment variables documented and configured
- [ ] TypeScript types defined for core OIDC structures
- [ ] Project builds without errors
- [ ] Unit tests for configuration pass
- [ ] Integration tests for basic server functionality pass

