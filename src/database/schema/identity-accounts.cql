-- Identity Accounts Junction Table Schema
-- Many-to-many relationship: identities -> accounts
-- Partitioned by identity_id to efficiently find all accounts for an identity

CREATE TABLE IF NOT EXISTS jlj2_users.identity_accounts (
  identity_id UUID,
  account_id UUID,
  created_at TIMESTAMP,
  PRIMARY KEY (identity_id, account_id)
) WITH CLUSTERING ORDER BY (account_id ASC);

