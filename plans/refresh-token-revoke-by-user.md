# Refresh Token Revocation by User

## Goal

Support client-wide revocation by `user_id` — i.e., revoke all refresh tokens for a given user within a specific client, without requiring a full table scan.

## Current State

- `refresh_tokens` table: `PRIMARY KEY (token_value)` — efficient token lookup, but revocation by user requires scanning the entire table.
- `generateRefreshToken` inserts into `refresh_tokens`.
- `consumeRefreshToken` deletes from `refresh_tokens` (single-use).

## Approach

Add a secondary table `refresh_tokens_by_user` with `(user_id, client_id)` as partition key and `token_value` as clustering key. This enables:

1. Efficient lookup: query partition `(user_id, client_id)` to get all tokens for that user+client.
2. Efficient revocation: delete the partition to remove the index entries, and delete each token from `refresh_tokens`.

## Steps

### 1. Migration 017: Create refresh_tokens_by_user table

- Partition key: `(user_id, client_id)`
- Clustering key: `token_value`
- Same TTL as `refresh_tokens` when inserting

### 2. Update refresh-token-storage.ts

- **generateRefreshToken**: Insert into both `refresh_tokens` and `refresh_tokens_by_user`.
- **consumeRefreshToken**: Delete from both tables when consuming a token.
- **revokeRefreshTokensByUser(clientId, userId)**: New function that:
  1. SELECT token_value FROM refresh_tokens_by_user WHERE user_id = ? AND client_id = ?
  2. For each token: DELETE FROM refresh_tokens WHERE token_value = ?
  3. Delete partition from refresh_tokens_by_user
  4. Return count of revoked tokens

### 3. Backfill (optional)

Existing refresh tokens in `refresh_tokens` will not have entries in `refresh_tokens_by_user`. Options:
- Let them expire naturally (30-day TTL).
- Or run a one-time backfill migration that reads refresh_tokens and populates refresh_tokens_by_user. Given TTL, skipping backfill is simpler.

## Success Criteria

- [x] Migration 017 creates refresh_tokens_by_user
- [x] generateRefreshToken writes to both tables
- [x] consumeRefreshToken deletes from both tables
- [x] revokeRefreshTokensByUser revokes all tokens for (user_id, client_id)
- [x] Existing tests pass
- [x] Unit tests for revokeRefreshTokensByUser
