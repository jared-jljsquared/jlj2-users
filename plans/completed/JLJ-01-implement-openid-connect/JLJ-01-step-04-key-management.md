# Step 4: Key Management and JWKS Endpoint

## Overview
Implement key pair generation, rotation, and JWKS (JSON Web Key Set) endpoint for public key distribution. This step enables the OIDC provider to generate signing keys, manage key rotation, and expose public keys in the standard JWKS format for token verification.

## Sub-steps

### 4.1 Key Pair Generation
Implement key pair generation for RSA and ECDSA algorithms:
- Generate RSA key pairs (2048-bit minimum) for RS256/RS384/RS512
- Generate ECDSA key pairs (P-256, P-384, P-521) for ES256/ES384/ES512
- Support key ID (kid) generation for key identification

### 4.2 Key Storage and Management
Implement in-memory key storage (can be extended to persistent storage later):
- Store key pairs with metadata (kid, algorithm, created date, expiration)
- Retrieve keys by kid
- Support multiple active keys for key rotation
- Mark keys as active or retired

### 4.3 Key Rotation
Implement key rotation mechanism:
- Generate new keys while keeping old ones active
- Support graceful rotation (overlap period)
- Automatically retire expired keys
- Support manual key rotation

### 4.4 JWK Format Conversion
Convert Node.js crypto KeyObjects to JWK format (RFC 7517):
- Convert RSA public keys to JWK format (n, e parameters)
- Convert ECDSA public keys to JWK format (x, y, crv parameters)
- Generate proper key IDs (kid) for JWKs
- Support key type (kty), use, and alg fields

### 4.5 JWKS Endpoint Implementation
Implement the JWKS endpoint handler:
- Return all active public keys in JWKS format
- Filter out retired/expired keys
- Support caching for performance
- Return proper JSON content-type

### 4.6 Key Initialization
Implement key initialization on application startup:
- Generate default keys if none exist
- Load keys from storage if available
- Ensure at least one active key is available

## Code Samples

### Example: Key Pair Generation
```typescript
// src/tokens/key-management.ts
import crypto from 'node:crypto';

export interface KeyPair {
  kid: string;
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  algorithm: 'RS256' | 'ES256';
  createdAt: number;
  expiresAt?: number;
}

export const generateKeyPair = async (
  algorithm: 'RS256' | 'ES256'
): Promise<KeyPair> => {
  const kid = generateKeyId();
  let keyPair: crypto.KeyPairKeyObjectResult;
  
  if (algorithm.startsWith('RS')) {
    keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  } else {
    keyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: algorithm === 'ES256' ? 'prime256v1' : 'secp384r1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  }
  
  return {
    kid,
    privateKey: crypto.createPrivateKey(keyPair.privateKey),
    publicKey: crypto.createPublicKey(keyPair.publicKey),
    algorithm,
    createdAt: Date.now(),
  };
};
```

### Example: JWK Format Conversion
```typescript
// src/tokens/key-management.ts
import type { JWK } from './types/jwk.ts';

export const keyToJwk = (
  publicKey: crypto.KeyObject,
  kid: string,
  alg: string
): JWK => {
  const keyDetails = publicKey.asymmetricKeyDetails!;
  
  if (keyDetails.type === 'rsa') {
    const jwk = publicKey.export({ format: 'jwk' }) as JWK;
    return {
      kty: 'RSA',
      kid,
      use: 'sig',
      alg,
      n: jwk.n,
      e: jwk.e,
    };
  } else if (keyDetails.type === 'ec') {
    const jwk = publicKey.export({ format: 'jwk' }) as JWK;
    return {
      kty: 'EC',
      kid,
      use: 'sig',
      alg,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
    };
  }
  
  throw new Error('Unsupported key type');
};
```

### Example: JWKS Endpoint
```typescript
// src/oidc/jwks.ts
import type { Context } from 'hono';
import { getActiveKeys } from '../tokens/key-management.ts';
import { keyToJwk } from '../tokens/key-management.ts';

export const handleJwks = (c: Context) => {
  const activeKeys = getActiveKeys();
  const keys = activeKeys.map(key => 
    keyToJwk(key.publicKey, key.kid, key.algorithm)
  );
  
  return c.json({ keys });
};
```

## Testing

### Unit Tests (Vitest)
- **Key Generation**: Test RSA and ECDSA key pair generation
  - Test keys are generated with correct algorithm
  - Test keys are valid and can be used for signing/verification
  - Test kid generation is unique
  
- **Key Storage**: Test key storage and retrieval
  - Test keys can be stored and retrieved by kid
  - Test multiple keys can be stored simultaneously
  - Test key retirement and filtering
  
- **Key Rotation**: Test key rotation mechanism
  - Test new keys can be added while old ones remain active
  - Test expired keys are automatically filtered
  - Test manual key rotation
  
- **JWK Conversion**: Test public key to JWK conversion
  - Test RSA keys convert to correct JWK format (n, e)
  - Test ECDSA keys convert to correct JWK format (x, y, crv)
  - Test JWK format matches RFC 7517 specification
  
- **JWKS Endpoint**: Test JWKS endpoint
  - Test endpoint returns valid JWKS format
  - Test only active keys are included
  - Test endpoint returns correct content-type
  - Test endpoint handles empty key set gracefully

### Test Examples
```typescript
// src/tokens/__tests__/key-management.test.ts
import { describe, it, expect } from 'vitest';
import { generateKeyPair, keyToJwk, getActiveKeys } from '../key-management.ts';

describe('Key Management', () => {
  it('should generate RSA key pair', async () => {
    const keyPair = await generateKeyPair('RS256');
    expect(keyPair.algorithm).toBe('RS256');
    expect(keyPair.kid).toBeTruthy();
    expect(keyPair.privateKey).toBeTruthy();
    expect(keyPair.publicKey).toBeTruthy();
  });
  
  it('should convert RSA key to JWK format', async () => {
    const keyPair = await generateKeyPair('RS256');
    const jwk = keyToJwk(keyPair.publicKey, keyPair.kid, 'RS256');
    expect(jwk.kty).toBe('RSA');
    expect(jwk.kid).toBe(keyPair.kid);
    expect(jwk.n).toBeTruthy();
    expect(jwk.e).toBeTruthy();
  });
  
  it('should generate ECDSA key pair', async () => {
    const keyPair = await generateKeyPair('ES256');
    expect(keyPair.algorithm).toBe('ES256');
    const jwk = keyToJwk(keyPair.publicKey, keyPair.kid, 'ES256');
    expect(jwk.kty).toBe('EC');
    expect(jwk.crv).toBe('P-256');
    expect(jwk.x).toBeTruthy();
    expect(jwk.y).toBeTruthy();
  });
});
```

## Success Criteria
- [ ] Key pairs can be generated for RS256 and ES256 algorithms
- [ ] Keys can be stored and retrieved by kid
- [ ] Key rotation mechanism works (new keys added, old keys retired)
- [ ] Public keys can be converted to JWK format (RFC 7517 compliant)
- [ ] JWKS endpoint returns valid JWKS format with active keys
- [ ] All key operations use Node.js crypto library
- [ ] At least one active key is available after initialization
- [ ] All unit tests for key management pass (>95% coverage)

