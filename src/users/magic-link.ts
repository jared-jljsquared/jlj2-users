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
    `SELECT magic_token, expires_at, used FROM ${keyspace}.magic_link_tokens 
     WHERE contact_id = ? AND magic_token = ?`,
    [contactId, token],
  )

  if (result.rows.length === 0) {
    return false
  }

  const row = result.rows[0]
  const expiresAt = row.expires_at as Date

  // Check if token is expired
  if (expiresAt < new Date()) {
    return false
  }

  // Atomically check if used = false and set used = true in a single operation
  // This uses a lightweight transaction (LWT) to prevent race conditions
  const updateResult = await client.execute(
    `UPDATE ${keyspace}.magic_link_tokens 
     SET used = ?
     WHERE contact_id = ? AND magic_token = ?
     IF used = ?`,
    [true, contactId, token, false],
  )

  // Check if the conditional update was applied
  // In cassandra-driver, conditional updates return a result with an 'applied' field
  // If the condition was not met (used was already true), applied will be false
  const wasApplied = updateResult.wasApplied()

  return wasApplied
}

/**
 * Clean up expired or used tokens (optional maintenance function)
 */
export const cleanupMagicLinkTokens = async (): Promise<void> => {
  // Tokens with TTL will be automatically removed by ScyllaDB
  // This function can be used for manual cleanup if needed
  const client = getClient()
  const keyspace = getKeyspace()

  // Get all tokens and check expiration
  const result = await client.execute(
    `SELECT contact_id, magic_token, expires_at, used FROM ${keyspace}.magic_link_tokens`,
  )

  const now = new Date()
  for (const row of result.rows) {
    const expiresAt = row.expires_at as Date
    const used = row.used as boolean

    // Delete expired or used tokens
    if (expiresAt < now || used) {
      await client.execute(
        `DELETE FROM ${keyspace}.magic_link_tokens 
         WHERE contact_id = ? AND magic_token = ?`,
        [row.contact_id, row.magic_token],
      )
    }
  }
}
