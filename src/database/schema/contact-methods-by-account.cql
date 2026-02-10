-- Contact Methods By Account Lookup Table Schema
-- Denormalized table for efficient lookups by account_id
-- This avoids full partition scans when querying contact methods by account

CREATE TABLE IF NOT EXISTS jlj2_users.contact_methods_by_account (
  account_id UUID,
  contact_id UUID,
  contact_type TEXT,  -- 'email' or 'phone'
  contact_value TEXT,  -- email address or phone number
  is_primary BOOLEAN,
  verified_at TIMESTAMP,  -- NULL if not verified, timestamp if verified
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (account_id, contact_id)
) WITH CLUSTERING ORDER BY (contact_id ASC);

