-- Identities Table Schema
-- Stores identity information (name, country, date of birth) that can be associated with multiple accounts

CREATE TABLE IF NOT EXISTS jlj2_users.identities (
  identity_id UUID PRIMARY KEY,
  name TEXT,
  country_of_origin TEXT,
  date_of_birth DATE,
  date_of_birth_verified BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

