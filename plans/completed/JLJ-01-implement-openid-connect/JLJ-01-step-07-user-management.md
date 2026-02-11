# Step 7: User Management System

## Overview
Build user registration, authentication, and profile management capabilities. This system will store user information and support both local authentication and federated identity linking.

## Sub-steps

### 5.1 User Data Model
Define the user data structure including:
- Unique user identifier (sub claim)
- Email address
- Password hash (for local auth)
- Profile information (name, picture, etc.)
- Linked external provider accounts
- Email verification status
- Created/updated timestamps

### 5.2 User Storage Interface
Create an abstraction layer for user storage (initially in-memory, later can be replaced with database).

### 5.3 User Registration
Implement user registration with:
- Email validation
- Password hashing using Node.js crypto library (scrypt)
- Salt generation using nanoid
- Duplicate email checking
- User ID generation

### 5.4 User Authentication
Implement local authentication:
- Email/password verification
- Password hash comparison
- Session management (optional, or stateless with tokens)

### 5.5 External Provider Account Linking
Implement functionality to link external provider accounts (Google, Microsoft, Facebook) to local user accounts.

### 5.6 User Profile Management
Implement endpoints for:
- Retrieving user profile
- Updating user profile
- Managing linked accounts

### 5.7 User Lookup by Subject
Implement efficient lookup of users by subject identifier (sub claim) for token generation.

## Code Samples

### Example: User Data Model
```typescript
// src/users/models.ts
export interface User {
  sub: string; // Subject identifier (unique)
  email: string;
  emailVerified: boolean;
  passwordHash?: string; // Only for local auth
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  linkedProviders: LinkedProvider[];
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkedProvider {
  provider: 'google' | 'microsoft' | 'facebook';
  providerUserId: string;
  linkedAt: Date;
}
```

### Example: Password Hashing with Node.js Crypto and nanoid
```typescript
// src/users/service.ts
import crypto from 'crypto';
import { nanoid } from 'nanoid';

export const hashPassword = (password: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Generate salt using nanoid for URL-safe, unique identifiers
    const salt = nanoid();
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      // Store salt and hash separately in database
      resolve(derivedKey.toString('hex'));
    });
  });
};

export const verifyPassword = (
  password: string,
  hash: string,
  salt: string
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(hash === derivedKey.toString('hex'));
    });
  });
};
```

**Note**: 
- Password hashing uses Node.js built-in `crypto` module with `scrypt` algorithm
- Salt generation uses `nanoid` for URL-safe, unique salt values
- Salt and password digest are stored separately in the database (`password_salt` and `password_digest` columns)

### Example: User Registration
```typescript
// src/users/service.ts
export const registerUser = async (
  email: string,
  password: string,
  name?: string
): Promise<User> => {
  // Validate email format
  if (!isValidEmail(email)) {
    throw new Error('Invalid email address');
  }
  
  // Check for existing user
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new Error('User already exists');
  }
  
  // Hash password
  const passwordHash = await hashPassword(password);
  
  // Generate subject identifier
  const sub = crypto.randomUUID();
  
  // Create user
  const user: User = {
    sub,
    email,
    emailVerified: false,
    passwordHash,
    name,
    linkedProviders: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  // Save user
  await saveUser(user);
  
  return user;
};
```

## Testing

### Unit Tests (Vitest)
- **Password Hashing**: Test password hashing and verification
  - Test passwords are hashed correctly
  - Test same password produces different hashes (salt)
  - Test password verification works with correct password
  - Test password verification fails with incorrect password
  - Test hashing performance is acceptable

- **User Registration**: Test user registration logic
  - Test valid email registration succeeds
  - Test duplicate email registration fails
  - Test invalid email format is rejected
  - Test user ID generation is unique
  - Test user is created with correct default values

- **User Authentication**: Test authentication logic
  - Test correct password authenticates successfully
  - Test incorrect password fails authentication
  - Test non-existent user fails authentication
  - Test email verification status is checked

- **User Lookup**: Test user lookup functions
  - Test lookup by email finds correct user
  - Test lookup by subject ID finds correct user
  - Test lookup returns null for non-existent users

- **Account Linking**: Test external provider account linking
  - Test linking provider account to existing user
  - Test linking creates new user if email doesn't exist
  - Test multiple providers can be linked to same user
  - Test duplicate provider linking is handled

### Integration Tests (Playwright)
- **User Registration Endpoint**: Test registration HTTP endpoint
  - Test successful registration returns user data
  - Test duplicate email returns error
  - Test invalid email returns validation error
  - Test password requirements are enforced

- **User Authentication Endpoint**: Test authentication HTTP endpoint
  - Test successful authentication returns tokens/session
  - Test incorrect credentials return error
  - Test rate limiting on failed attempts

- **User Profile Endpoints**: Test profile management endpoints
  - Test retrieving user profile requires authentication
  - Test updating profile works correctly
  - Test linked accounts are returned correctly

### Test Examples
```typescript
// src/users/__tests__/password.test.ts
import { describe, it, expect } from 'vitest';
import { nanoid } from 'nanoid';
import { hashPassword, verifyPassword } from '../service.ts';

describe('Password Hashing', () => {
  it('should hash passwords correctly', async () => {
    const password = 'test-password-123';
    const { hash, salt } = await hashPassword(password);
    
    expect(hash).toBeDefined();
    expect(salt).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(typeof salt).toBe('string');
  });
  
  it('should produce different hashes for same password', async () => {
    const password = 'test-password';
    const { hash: hash1, salt: salt1 } = await hashPassword(password);
    const { hash: hash2, salt: salt2 } = await hashPassword(password);
    
    expect(hash1).not.toBe(hash2); // Different salts
    expect(salt1).not.toBe(salt2); // Different nanoid-generated salts
  });
  
  it('should verify correct password', async () => {
    const password = 'test-password';
    const { hash, salt } = await hashPassword(password);
    const isValid = await verifyPassword(password, hash, salt);
    
    expect(isValid).toBe(true);
  });
  
  it('should reject incorrect password', async () => {
    const password = 'test-password';
    const { hash, salt } = await hashPassword(password);
    const isValid = await verifyPassword('wrong-password', hash, salt);
    
    expect(isValid).toBe(false);
  });
  
  it('should reject password with incorrect salt', async () => {
    const password = 'test-password';
    const { hash } = await hashPassword(password);
    const wrongSalt = nanoid();
    const isValid = await verifyPassword(password, hash, wrongSalt);
    
    expect(isValid).toBe(false);
  });
});
```

```typescript
// src/users/__tests__/registration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { registerUser, findUserByEmail } from '../service.ts';
import { clearUserStore } from '../storage.ts';

describe('User Registration', () => {
  beforeEach(() => {
    clearUserStore();
  });
  
  it('should register new user successfully', async () => {
    const user = await registerUser('test@example.com', 'password123', 'Test User');
    
    expect(user.email).toBe('test@example.com');
    expect(user.sub).toBeDefined();
    expect(user.emailVerified).toBe(false);
    expect(user.passwordHash).toBeDefined();
  });
  
  it('should reject duplicate email', async () => {
    await registerUser('test@example.com', 'password123');
    
    await expect(
      registerUser('test@example.com', 'password456')
    ).rejects.toThrow('User already exists');
  });
  
  it('should reject invalid email format', async () => {
    await expect(
      registerUser('invalid-email', 'password123')
    ).rejects.toThrow('Invalid email address');
  });
});
```

```typescript
// tests/integration/user-registration.test.ts (Playwright)
import { test, expect } from '@playwright/test';

test.describe('User Registration', () => {
  test('should register new user', async ({ request }) => {
    const response = await request.post('http://localhost:3000/register', {
      data: {
        email: 'test@example.com',
        password: 'secure-password-123',
        name: 'Test User',
      },
    });
    
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('sub');
    expect(body.email).toBe('test@example.com');
  });
  
  test('should reject duplicate email', async ({ request }) => {
    // First registration
    await request.post('http://localhost:3000/register', {
      data: {
        email: 'duplicate@example.com',
        password: 'password123',
      },
    });
    
    // Second registration with same email
    const response = await request.post('http://localhost:3000/register', {
      data: {
        email: 'duplicate@example.com',
        password: 'password456',
      },
    });
    
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });
});
```

## Success Criteria
- [ ] User data model defined with all necessary fields
- [ ] User registration works with email validation
- [ ] Password hashing uses Node.js crypto
- [ ] User authentication verifies passwords correctly
- [ ] External provider accounts can be linked to users
- [ ] User profiles can be retrieved and updated
- [ ] Users can be looked up by subject identifier
- [ ] All unit tests for user management pass
- [ ] Integration tests for user endpoints pass

