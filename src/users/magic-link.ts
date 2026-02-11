import type { Client } from 'cassandra-driver'
import { nanoid } from 'nanoid'
import { getDatabaseClient } from '../database/client.ts'
import { getDatabaseConfig } from '../database/config.ts'
import { log } from '../plumbing/logger.ts'

export interface MagicLinkToken {
  token: string
  contactId: string // UUID of contact method (email or phone)
  expiresAt: Date
  used: boolean
  createdAt: Date
}

const getClient = (): Client => {
  return getDatabaseClient()
}

const getKeyspace = (): string => {
  const config = getDatabaseConfig()
  return config.keyspace
}

/**
 * Generate a secure magic link token
 */
export const generateMagicLinkToken = (): string => {
  // Use nanoid for URL-safe token generation
  // Default size is 21 characters, which provides good security
  return nanoid()
}

/**
 * Store a magic link token in the database
 * Tokens are stored with TTL for automatic expiration
 */
export const storeMagicLinkToken = async (
  contactId: string,
  token: string,
  expiresInMinutes: number = 15,
): Promise<void> => {
  const client = getClient()
  const keyspace = getKeyspace()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000)

  // Calculate TTL in seconds for CQL
  const ttlSeconds = expiresInMinutes * 60

  // Store token with TTL
  // Using contactId as partition key for efficient lookup
  await client.execute(
    `INSERT INTO ${keyspace}.magic_link_tokens 
     (contact_id, magic_token, expires_at, used, created_at)
     VALUES (?, ?, ?, ?, ?)
     USING TTL ?`,
    [contactId, token, expiresAt, false, now, ttlSeconds],
  )

  log({
    message: 'Magic link token generated',
    contactId,
    expiresAt: expiresAt.toISOString(),
  })
}

/**
 * Verify and consume a magic link token
 * Uses a lightweight transaction (LWT) to atomically check and set the used flag
 * This prevents race conditions where multiple concurrent requests could consume the same token
 */
export const verifyMagicLinkToken = async (
  contactId: string,
  token: string,
): Promise<boolean> => {
  const client = getClient()
  const keyspace = getKeyspace()

  // First, get token to check expiration
  const result = await client.execute(
    `SELECT magic_token, expires_at, used, TTL(used) AS ttl_remaining 
     FROM ${keyspace}.magic_link_tokens 
     WHERE contact_id = ? AND magic_token = ?`,
    [contactId, token],
  )

  if (result.rows.length === 0) {
    return false
  }

  const row = result.rows[0]
  const expiresAt = row.expires_at as Date
  const ttlRemaining = (row.ttl_remaining as number | null) ?? 0

  // Check if token is expired
  if (expiresAt < new Date()) {
    return false
  }

  // If TTL already expired (should be caught above), treat as invalid
  if (ttlRemaining <= 0) {
    return false
  }

  // Atomically check if used = false and set used = true in a single operation
  // This uses a lightweight transaction (LWT) to prevent race conditions
  const updateResult = await client.execute(
    `UPDATE ${keyspace}.magic_link_tokens 
     USING TTL ?
     SET used = ?
     WHERE contact_id = ? AND magic_token = ?
     IF used = ?`,
    [ttlRemaining, true, contactId, token, false],
  )

  // Check if the conditional update was applied
  // In cassandra-driver, conditional updates return a result with an 'applied' field
  // If the condition was not met (used was already true), applied will be false
  const wasApplied = updateResult.wasApplied()

  return wasApplied
}

// Note: magic_link_tokens rely on TTL for cleanup; no manual sweep function is needed.
