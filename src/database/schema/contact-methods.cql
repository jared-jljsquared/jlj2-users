-- Contact Methods Table Schema
-- Stores contact methods (email, phone) organized by type
-- Partitioned by contact_type, clustered by is_primary, contact_value, contact_id

CREATE TABLE IF NOT EXISTS jlj2_users.contact_methods (
  account_id UUID,
  contact_id UUID,
  contact_type TEXT,  -- 'email' or 'phone'
  contact_value TEXT,  -- email address or phone number
  is_primary BOOLEAN,
  verified_at TIMESTAMP,  -- NULL if not verified, timestamp if verified
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (contact_type, is_primary, contact_value, contact_id)
) WITH CLUSTERING ORDER BY (contact_type ASC, is_primary ASC, contact_value ASC, contact_id ASC);

-- Note: Secondary indexes are NOT recommended in ScyllaDB/Cassandra
-- They create hidden tables and can cause severe performance issues.
-- Instead, use denormalized tables (like contact_methods_by_value) for lookups.
-- If you need to filter by contact_type or is_primary, consider:
-- 1. Creating a separate lookup table
-- 2. Filtering in application code after fetching by partition key
-- 3. Using SASI indexes only if absolutely necessary (and with caution)

