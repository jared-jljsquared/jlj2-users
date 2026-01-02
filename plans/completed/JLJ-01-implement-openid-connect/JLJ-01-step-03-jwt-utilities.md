# Step 3: JWT Token Utilities with Node.js Crypto

## Overview
Create JWT token creation, signing, and verification utilities from scratch using only Node.js crypto library for RS256/ES256 signing. No external JWT libraries will be used. This will be the foundation for all token operations.

## Sub-steps

### 3.1 Base64URL Encoding/Decoding
Implement Base64URL encoding and decoding functions (required for JWT).

### 3.2 JWT Header Creation
Create function to generate JWT headers with algorithm specification.

### 3.3 JWT Payload Creation
Create function to build JWT payloads with standard claims (iss, sub, aud, exp, iat, etc.).

### 3.4 JWT Signing with RS256
Implement RS256 (RSA with SHA-256) signing using Node.js crypto:
- Load RSA private key
- Create signature using `crypto.createSign()`
- Encode signature in Base64URL

### 3.5 JWT Signing with ES256
Implement ES256 (ECDSA with P-256 and SHA-256) signing using Node.js crypto:
- Load ECDSA private key
- Create signature using `crypto.createSign()`
- Encode signature in Base64URL

### 3.6 JWT Verification
Implement JWT signature verification:
- Parse JWT into header, payload, and signature
- Verify signature using public key
- Validate expiration and other claims

### 3.7 JWT Token Assembly
Create function to assemble complete JWT tokens (header.payload.signature).

### 3.8 JWT Token Parsing
Create function to parse and validate JWT token structure.

## Code Samples

### Example: Base64URL Encoding
```typescript
// src/tokens/jwt.ts
export const base64UrlEncode = (buffer: Buffer): string => {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

export const base64UrlDecode = (str: string): Buffer => {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
};
```

### Example: JWT Signing with RS256
```typescript
// src/tokens/jwt.ts
import crypto from 'crypto';

export const signJWT = (
  payload: Record<string, unknown>,
  privateKey: string | Buffer,
  algorithm: 'RS256' | 'ES256' = 'RS256'
): string => {
  const header = {
    alg: algorithm,
    typ: 'JWT',
  };
  
  const encodedHeader = base64UrlEncode(
    Buffer.from(JSON.stringify(header))
  );
  
  const encodedPayload = base64UrlEncode(
    Buffer.from(JSON.stringify(payload))
  );
  
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  
  const sign = crypto.createSign(algorithm === 'RS256' ? 'RSA-SHA256' : 'ECDSA-SHA256');
  sign.update(signatureInput);
  sign.end();
  
  const signature = sign.sign(privateKey, 'base64');
  const encodedSignature = base64UrlEncode(Buffer.from(signature, 'base64'));
  
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
};
```

### Example: JWT Verification
```typescript
// src/tokens/jwt.ts
export const verifyJWT = (
  token: string,
  publicKey: string | Buffer,
  algorithm: 'RS256' | 'ES256' = 'RS256'
): { header: Record<string, unknown>; payload: Record<string, unknown> } => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  
  const header = JSON.parse(
    base64UrlDecode(encodedHeader).toString('utf-8')
  ) as Record<string, unknown>;
  
  const payload = JSON.parse(
    base64UrlDecode(encodedPayload).toString('utf-8')
  ) as Record<string, unknown>;
  
  // Verify signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlDecode(encodedSignature);
  
  const verify = crypto.createVerify(
    algorithm === 'RS256' ? 'RSA-SHA256' : 'ECDSA-SHA256'
  );
  verify.update(signatureInput);
  verify.end();
  
  const isValid = verify.verify(publicKey, signature);
  if (!isValid) {
    throw new Error('Invalid JWT signature');
  }
  
  // Verify expiration
  const exp = payload.exp as number | undefined;
  if (exp && Date.now() / 1000 >= exp) {
    throw new Error('JWT has expired');
  }
  
  return { header, payload };
};
```

## Testing

### Unit Tests (Vitest)
- **Base64URL Encoding/Decoding**: Test encoding and decoding functions
  - Test encoding produces correct Base64URL format (no padding, correct character substitution)
  - Test decoding correctly handles padding
  - Test round-trip encoding/decoding
  - Test with various input sizes

- **JWT Signing**: Test signing with RS256 and ES256
  - Test signing produces valid JWT format (three parts separated by dots)
  - Test header contains correct algorithm
  - Test payload is correctly encoded
  - Test signature is valid and verifiable
  - Test with different key sizes

- **JWT Verification**: Test token verification
  - Test valid tokens verify successfully
  - Test invalid signatures are rejected
  - Test expired tokens are rejected
  - Test malformed tokens are rejected (wrong number of parts, invalid JSON)
  - Test tokens with wrong algorithm are rejected
  - Test tokens with wrong public key are rejected

- **JWT Parsing**: Test token parsing
  - Test parsing extracts header, payload, and signature correctly
  - Test parsing handles various claim types
  - Test parsing validates token structure

### Test Examples
```typescript
// src/tokens/__tests__/jwt.test.ts
import { describe, it, expect } from 'vitest';
import { generateKeyPair } from 'crypto';
import { promisify } from 'util';
import { signJWT, verifyJWT, base64UrlEncode, base64UrlDecode } from '../jwt.ts';

const generateKeyPairAsync = promisify(generateKeyPair);

describe('Base64URL Encoding', () => {
  it('should encode without padding', () => {
    const input = Buffer.from('test');
    const encoded = base64UrlEncode(input);
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });
  
  it('should round-trip encode and decode', () => {
    const original = Buffer.from('Hello, World!');
    const encoded = base64UrlEncode(original);
    const decoded = base64UrlDecode(encoded);
    expect(decoded.toString()).toBe(original.toString());
  });
});

describe('JWT Signing and Verification', () => {
  it('should sign and verify JWT with RS256', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    });
    
    const payload = {
      sub: 'user123',
      iss: 'https://example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };
    
    const token = signJWT(payload, privateKey, 'RS256');
    const parts = token.split('.');
    expect(parts.length).toBe(3);
    
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
  
  it('should reject tokens with invalid signature', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    });
    
    const payload = { sub: 'user123' };
    const token = signJWT(payload, privateKey, 'RS256');
    
    // Tamper with signature
    const parts = token.split('.');
    parts[2] = 'invalid-signature';
    const tamperedToken = parts.join('.');
    
    expect(() => {
      verifyJWT(tamperedToken, publicKey, 'RS256');
    }).toThrow('Invalid JWT signature');
  });
  
  it('should sign and verify JWT with ES256', async () => {
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'prime256v1',
    });
    
    const payload = {
      sub: 'user123',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    
    const token = signJWT(payload, privateKey, 'ES256');
    const { payload: verifiedPayload } = verifyJWT(token, publicKey, 'ES256');
    expect(verifiedPayload.sub).toBe('user123');
  });
  
  it('should reject malformed tokens', () => {
    const { publicKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    });
    
    expect(() => {
      verifyJWT('not-a-valid-token', publicKey, 'RS256');
    }).toThrow('Invalid JWT format');
  });
});
```

## Success Criteria
- [ ] Base64URL encoding/decoding works correctly
- [ ] JWT tokens can be signed with RS256
- [ ] JWT tokens can be signed with ES256
- [ ] JWT tokens can be verified with public keys
- [ ] Expiration validation works
- [ ] All JWT operations use Node.js crypto library
- [ ] Error handling for invalid tokens is robust
- [ ] All unit tests for JWT utilities pass (>95% coverage)

