-- Contact Methods By ID Lookup Table Schema
-- Denormalized table for efficient lookups by contact_id
-- Used by magic link authentication (findContactMethodById)

CREATE TABLE IF NOT EXISTS jlj2_users.contact_methods_by_id (
  contact_id UUID,
  account_id UUID,
  contact_type TEXT,  -- 'email' or 'phone'
  contact_value TEXT,  -- email address or phone number
  is_primary BOOLEAN,
  verified_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (contact_id)
);
