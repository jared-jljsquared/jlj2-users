-- Accounts Table Schema
-- Stores core account information including authentication credentials

CREATE TABLE IF NOT EXISTS jlj2_users.accounts (
  account_id UUID,
  username TEXT,
  password_digest TEXT,
  password_salt TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  is_active BOOLEAN,
  last_login_at TIMESTAMP,
  PRIMARY KEY (account_id)
) WITH CLUSTERING ORDER BY (account_id ASC);
