/**
 * JSON Web Key (JWK) as defined in RFC 7517
 * Represents a cryptographic key in JSON format
 */
export interface JWK {
  /** Key type (kty) - identifies the cryptographic algorithm family */
  kty: 'RSA' | 'EC' | 'oct'
  /** Key ID (kid) - used to match a specific key */
  kid: string
  /** Public key use (use) - 'sig' for signature, 'enc' for encryption */
  use?: 'sig' | 'enc'
  /** Algorithm (alg) - the algorithm intended for use with this key */
  alg?: string
  /** Key operations (key_ops) - array of operations this key is intended for */
  key_ops?: string[]
  /** X.509 certificate URL (x5u) */
  x5u?: string
  /** X.509 certificate chain (x5c) */
  x5c?: string[]
  /** X.509 certificate SHA-1 thumbprint (x5t) */
  x5t?: string
  /** X.509 certificate SHA-256 thumbprint (x5t#S256) */
  'x5t#S256'?: string
}

/**
 * RSA-specific JWK parameters (RFC 7518 Section 6.3)
 */
export interface RSAJWK extends JWK {
  kty: 'RSA'
  /** RSA modulus (n) - Base64URL-encoded */
  n: string
  /** RSA public exponent (e) - Base64URL-encoded */
  e: string
  /** RSA private exponent (d) - Base64URL-encoded, only in private keys */
  d?: string
  /** RSA private key parameter (p) - Base64URL-encoded, only in private keys */
  p?: string
  /** RSA private key parameter (q) - Base64URL-encoded, only in private keys */
  q?: string
  /** RSA private key parameter (dp) - Base64URL-encoded, only in private keys */
  dp?: string
  /** RSA private key parameter (dq) - Base64URL-encoded, only in private keys */
  dq?: string
  /** RSA private key parameter (qi) - Base64URL-encoded, only in private keys */
  qi?: string
}

/**
 * ECDSA-specific JWK parameters (RFC 7518 Section 6.2)
 */
export interface ECJWK extends JWK {
  kty: 'EC'
  /** EC curve name (crv) - e.g., 'P-256', 'P-384', 'P-521' */
  crv: 'P-256' | 'P-384' | 'P-521'
  /** EC x-coordinate (x) - Base64URL-encoded */
  x: string
  /** EC y-coordinate (y) - Base64URL-encoded */
  y: string
  /** EC private key value (d) - Base64URL-encoded, only in private keys */
  d?: string
}

/**
 * JSON Web Key Set (JWKS) as defined in RFC 7517
 * Collection of JSON Web Keys
 */
export interface JWKS {
  keys: JWK[]
}
