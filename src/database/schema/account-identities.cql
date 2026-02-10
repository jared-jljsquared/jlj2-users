-- Account Identities Junction Table Schema
-- Many-to-many relationship: accounts -> identities
-- Partitioned by account_id to efficiently find all identities for an account

CREATE TABLE IF NOT EXISTS jlj2_users.account_identities (
  account_id UUID,
  identity_id UUID,
  created_at TIMESTAMP,
  PRIMARY KEY (account_id, identity_id)
) WITH CLUSTERING ORDER BY (identity_id ASC);

