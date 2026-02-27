-- Provider Accounts Table Schema
-- Stores external provider account links (Google, Microsoft, Facebook)
-- Links to contact_methods via contact_id to associate provider with specific contact method

CREATE TABLE IF NOT EXISTS jlj2_users.provider_accounts (
  provider TEXT,        -- 'google', 'microsoft', 'facebook'
  provider_sub TEXT,    -- Provider's subject identifier (their unique user ID)
  contact_id UUID,      -- Links to contact_methods.contact_id
  account_id UUID,      -- Denormalized for query efficiency (can be derived from contact_id)
  linked_at TIMESTAMP,
  created_at TIMESTAMP,
  PRIMARY KEY (provider, provider_sub)
) WITH CLUSTERING ORDER BY (provider_sub ASC);

