-- Contact Methods Table Schema
-- Stores contact methods (email, phone) organized by type

CREATE TABLE IF NOT EXISTS jlj2_users.contact_methods (
  account_id UUID,
  contact_id UUID,
  contact_type TEXT,  -- 'email' or 'phone'
  contact_value TEXT,  -- email address or phone number
  is_primary BOOLEAN,
  verified_at TIMESTAMP,  -- NULL if not verified, timestamp if verified
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (contact_type, contact_value)
) WITH CLUSTERING ORDER BY (contact_value ASC);
