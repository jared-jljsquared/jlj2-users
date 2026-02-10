# Database Schema Design for Accounts and Contact Methods

## Overview

This document outlines the database schema design for the jlj2-users application, focusing on account management and contact method storage in ScyllaDB.

## Design Principles

### ScyllaDB/Cassandra Best Practices
- **Denormalization**: Data is denormalized to support query patterns
- **Partition Keys**: Determine data distribution across nodes
- **Clustering Keys**: Determine sort order within partitions (must be explicitly defined with `CLUSTERING ORDER BY`)
- **No Joins**: Use multiple tables or denormalization instead
- **Query-Driven Design**: Tables are designed for specific access patterns
- **Avoid Secondary Indexes**: Secondary indexes create hidden tables and can cause severe performance issues. Use denormalized lookup tables instead.

## Access Patterns

### Account Table Queries
1. **Get account by ID and status**: `SELECT * FROM accounts WHERE account_id = ? AND is_active = ?`
3. **Update account**: `UPDATE accounts SET ... WHERE account_id = ? AND is_active = ?`
4. **Delete account**: `DELETE FROM accounts WHERE account_id = ? AND is_active = ?`

**Note**: The composite primary key `(account_id, is_active)` means you must provide both values for efficient queries. To get an account by ID alone, you may need to query both active and inactive rows, or use a different access pattern.

### Contact Methods Queries
1. **Get all contacts by type**: `SELECT * FROM contact_methods WHERE contact_type = ?`
2. **Get contacts by type and primary status**: `SELECT * FROM contact_methods WHERE contact_type = ? AND is_primary = ?`
3. **Get contacts by type, primary status, and value**: `SELECT * FROM contact_methods WHERE contact_type = ? AND is_primary = ? AND contact_value = ?`
4. **Get specific contact**: `SELECT * FROM contact_methods WHERE contact_type = ? AND is_primary = ? AND contact_value = ? AND contact_id = ?`
5. **Find account by contact value**: Query by `contact_type` and filter by `contact_value` in application code, or use range queries if needed

**Note**: The partition key is `contact_type`, so queries must start with `contact_type`. To find contacts by `account_id`, you would need to scan all contact types or maintain a separate lookup table.

## Table Designs

### 1. Accounts Table

**Partition Key**: `account_id` (UUID)  
**Clustering Key**: `is_active` (BOOLEAN)

**Purpose**: Store core account information including authentication credentials.

**Schema**:
```cql
CREATE TABLE jlj2_users.accounts (
  account_id UUID,
  username TEXT,
  password_digest TEXT,
  password_salt TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  is_active BOOLEAN,
  last_login_at TIMESTAMP,
  PRIMARY KEY (account_id, is_active)
) WITH CLUSTERING ORDER BY (is_active ASC)
```

**Fields**:
- `account_id`: Unique identifier for the account (UUID) - partition key
- `is_active`: Whether the account is active/enabled - clustering key
- `username`: Optional username for login
- `password_digest`: Hashed password (e.g., bcrypt, argon2)
- `password_salt`: Salt used for password hashing
- `created_at`: Account creation timestamp
- `updated_at`: Last update timestamp
- `last_login_at`: Last successful login timestamp

**Query Implications**:
- To query efficiently, you must provide both `account_id` and `is_active`
- This design allows storing both active and inactive versions of an account
- To get an account by ID alone, query both `is_active = true` and `is_active = false`, or maintain a separate lookup table

**Note**: If username lookups are required, create a separate denormalized table `accounts_by_username` instead of using secondary indexes (see design principles below).

### 2. Contact Methods Table

**Partition Key**: `contact_type` (TEXT)  
**Clustering Keys**: `is_primary` (BOOLEAN), `contact_value` (TEXT), `contact_id` (UUID)

**Purpose**: Store contact methods (email, phone) organized by type.

**Schema**:
```cql
CREATE TABLE jlj2_users.contact_methods (
  account_id UUID,
  contact_id UUID,
  contact_type TEXT,  -- 'email' or 'phone'
  contact_value TEXT,  -- email address or phone number
  is_primary BOOLEAN,
  verified_at TIMESTAMP,  -- NULL if not verified, timestamp if verified
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (contact_type, is_primary, contact_value, contact_id)
) WITH CLUSTERING ORDER BY (contact_type ASC, is_primary ASC, contact_value ASC, contact_id ASC)
```

**Fields**:
- `contact_type`: Type of contact ('email' or 'phone') - partition key
- `is_primary`: Whether this is the primary contact method - first clustering key
- `contact_value`: The actual email address or phone number - second clustering key
- `contact_id`: Unique identifier for this contact method - third clustering key
- `account_id`: Foreign key to accounts table (stored but not part of primary key)
- `verified_at`: Timestamp when verification occurred (NULL if not verified, presence indicates verification status)
- `created_at`: Contact method creation timestamp
- `updated_at`: Last update timestamp

**Verification Status**: Verification status is determined by the presence of `verified_at`. If `verified_at` is NULL or absent, the contact method is not verified. If `verified_at` has a timestamp value, the contact method is verified.

**Query Implications**:
- Queries must start with `contact_type` (the partition key)
- Data is partitioned by contact type, so all emails are in one partition, all phones in another
- Within each partition, data is sorted by `is_primary`, then `contact_value`, then `contact_id`
- To find contacts by `account_id`, you would need to scan both partitions or maintain a separate lookup table
- Efficient queries include:
  - Get all emails: `WHERE contact_type = 'email'`
  - Get primary emails: `WHERE contact_type = 'email' AND is_primary = true`
  - Get specific email: `WHERE contact_type = 'email' AND is_primary = ? AND contact_value = ?`

**Indexes**: 
- **DO NOT use secondary indexes** - They are not recommended in ScyllaDB/Cassandra as they create hidden tables and can cause severe performance issues.
- If you need to query by `account_id`, create a separate denormalized lookup table `contact_methods_by_account` with `PRIMARY KEY (account_id, contact_id)`

### 3. Provider Accounts Table

**Partition Key**: `provider` (TEXT)  
**Clustering Key**: `provider_sub` (TEXT)

**Purpose**: Store external provider account links (Google, Microsoft, Facebook) linked to specific contact methods.

**Schema**:
```cql
CREATE TABLE jlj2_users.provider_accounts (
  provider TEXT,        -- 'google', 'microsoft', 'facebook'
  provider_sub TEXT,    -- Provider's subject identifier (their unique user ID)
  contact_id UUID,      -- Links to contact_methods.contact_id
  account_id UUID,      -- Denormalized for query efficiency (can be derived from contact_id)
  linked_at TIMESTAMP,
  created_at TIMESTAMP,
  PRIMARY KEY (provider, provider_sub)
) WITH CLUSTERING ORDER BY (provider_sub ASC)
```

**Fields**:
- `provider`: Provider name ('google', 'microsoft', 'facebook') - partition key
- `provider_sub`: Provider's subject identifier (their unique user ID) - clustering key
- `contact_id`: Links to `contact_methods.contact_id` - the specific contact method this provider is associated with
- `account_id`: Denormalized account ID for query efficiency (can be derived from `contact_id` via `contact_methods`)
- `linked_at`: Timestamp when the provider account was linked
- `created_at`: Record creation timestamp

**Relationship**:
- Links to `contact_methods` via `contact_id` (not directly to `accounts`)
- This allows a provider account to be associated with a specific contact method (email/phone)
- A user can have multiple provider accounts linked to different contact methods
- The `account_id` is denormalized for efficient queries without requiring a join

**Query Implications**:
- Queries must start with `provider` (the partition key)
- Efficient lookups: `WHERE provider = 'google' AND provider_sub = '123456'`
- To find all providers for a contact method, you would need to scan all providers or maintain a reverse lookup table
- To find all providers for an account, query by `account_id` (denormalized) or scan and filter

**Access Patterns**:
1. **Find account by provider**: `SELECT contact_id, account_id FROM provider_accounts WHERE provider = ? AND provider_sub = ?`
2. **Get contact method from provider**: Use `contact_id` to query `contact_methods`
3. **List all providers for an account**: `SELECT * FROM provider_accounts WHERE account_id = ? ALLOW FILTERING` (or maintain reverse lookup table)

**Note**: The `account_id` is denormalized for query efficiency. While it can be derived from `contact_id` via `contact_methods`, storing it directly avoids a second query when looking up accounts by provider.

## Data Consistency

### Maintaining Consistency Between Tables

If you create additional lookup tables (e.g., `contact_methods_by_account` or `accounts_by_username`), you must maintain consistency:

1. **On Insert**: Write to all relevant tables in a batch
2. **On Update**: Update all relevant tables
3. **On Delete**: Delete from all relevant tables
4. **Use Batches**: Use Cassandra batches to ensure atomicity where possible

**Example Batch** (if using lookup tables):
```cql
BEGIN BATCH
  INSERT INTO contact_methods (contact_type, is_primary, contact_value, contact_id, account_id, ...) VALUES (...);
  INSERT INTO contact_methods_by_account (account_id, contact_id, ...) VALUES (...);
APPLY BATCH;
```

## Additional Considerations

### Password Storage
- Use a strong hashing algorithm (bcrypt, argon2, scrypt)
- Store salt separately (or use algorithm-specific salt storage)
- Consider password complexity requirements
- Implement password reset flows

### Contact Method Verification
- Email verification: Send verification link/code
- Phone verification: Send SMS code
- Verification status is determined by the presence of `verified_at` timestamp
- When verifying, set `verified_at` to the current timestamp
- To mark as unverified, set `verified_at` to NULL
- Support resending verification

### Primary Contact
- Only one contact method per account should be `is_primary = true`
- Enforce this in application logic
- Consider using a materialized view or separate table for primary contact lookup

### Data Types
- **UUID**: Use for IDs (account_id, contact_id)
- **TEXT**: Use for strings (username, email, phone)
- **TIMESTAMP**: Use for dates/times
- **BOOLEAN**: Use for flags

### Time-to-Live (TTL)
- Consider TTL for temporary data (e.g., verification codes)
- Not needed for core account/contact data

## Migration Strategy

1. Create keyspace (if not exists)
2. Create `accounts` table (with partition key `account_id` and clustering key `is_active`)
3. Create `contact_methods` table (with partition key `contact_type` and clustering keys `is_primary`, `contact_value`, `contact_id`)
4. Create `provider_accounts` table (with partition key `provider` and clustering key `provider_sub`)
5. If account-based lookups are needed, create `contact_methods_by_account` lookup table with `PRIMARY KEY (account_id, contact_id)`
6. If username lookups are needed, create `accounts_by_username` lookup table with `PRIMARY KEY (username)`

## Future Enhancements

- **Materialized Views**: For common query patterns
- **SASI Indexes**: For text search (if needed)
- **TTL**: For temporary verification codes
- **Audit Logging**: Track changes to accounts and contacts
- **Soft Deletes**: Add `deleted_at` timestamp instead of hard deletes

