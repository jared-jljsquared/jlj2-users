import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authenticateClient,
  getClientById,
  isRedirectUriAllowed,
  registerClient,
  validateScopes,
} from '../service.ts'
import * as storage from '../storage.ts'

vi.mock('../storage.ts', () => ({
  insertClient: vi.fn(),
  findClientById: vi.fn(),
  updateClient: vi.fn(),
  deactivateClient: vi.fn(),
}))

describe('Client Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('registerClient', () => {
    it('should register new client successfully', async () => {
      const input = {
        name: 'Test Client',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scopes: ['openid', 'profile', 'email'],
      }

      vi.mocked(storage.insertClient).mockResolvedValue({
        client_id: 'client-uuid-123',
        client_secret_hash: 'hashed-secret',
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        scopes: ['openid', 'profile', 'email'],
        token_endpoint_auth_method: 'client_secret_post',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })

      const client = await registerClient(input)

      expect(client.id).toBe('client-uuid-123')
      expect(client.name).toBe('Test Client')
      expect(client.secret).toBeDefined()
      expect(client.secret.length).toBeGreaterThan(0)
      expect(storage.insertClient).toHaveBeenCalledWith(
        expect.objectContaining({
          client_name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
          grant_types: ['authorization_code'],
          response_types: ['code'],
          scopes: ['openid', 'profile', 'email'],
        }),
        expect.any(String),
      )
    })

    it('should reject empty client name', async () => {
      await expect(
        registerClient({
          name: '',
          redirectUris: ['https://example.com/callback'],
          grantTypes: ['authorization_code'],
          responseTypes: ['code'],
          scopes: ['openid'],
        }),
      ).rejects.toThrow('Client name is required')
    })

    it('should reject empty redirect URIs', async () => {
      await expect(
        registerClient({
          name: 'Test',
          redirectUris: [],
          grantTypes: ['authorization_code'],
          responseTypes: ['code'],
          scopes: ['openid'],
        }),
      ).rejects.toThrow('At least one redirect URI is required')
    })

    it('should reject invalid redirect URI', async () => {
      await expect(
        registerClient({
          name: 'Test',
          redirectUris: ['not-a-valid-uri'],
          grantTypes: ['authorization_code'],
          responseTypes: ['code'],
          scopes: ['openid'],
        }),
      ).rejects.toThrow('Invalid redirect URI')
    })

    it('should reject invalid grant type', async () => {
      await expect(
        registerClient({
          name: 'Test',
          redirectUris: ['https://example.com/callback'],
          grantTypes: ['invalid_grant'],
          responseTypes: ['code'],
          scopes: ['openid'],
        }),
      ).rejects.toThrow('Invalid grant type')
    })

    it('should reject invalid scope', async () => {
      await expect(
        registerClient({
          name: 'Test',
          redirectUris: ['https://example.com/callback'],
          grantTypes: ['authorization_code'],
          responseTypes: ['code'],
          scopes: ['invalid_scope'],
        }),
      ).rejects.toThrow('Invalid scope')
    })
  })

  describe('getClientById', () => {
    it('should return client when found and active', async () => {
      vi.mocked(storage.findClientById).mockResolvedValue({
        client_id: 'client-123',
        client_secret_hash: 'hash',
        client_name: 'Test',
        redirect_uris: [],
        grant_types: [],
        response_types: [],
        scopes: [],
        token_endpoint_auth_method: 'client_secret_post',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })

      const client = await getClientById('client-123')

      expect(client).not.toBeNull()
      expect(client?.id).toBe('client-123')
      expect(client?.name).toBe('Test')
    })

    it('should return null when client not found', async () => {
      vi.mocked(storage.findClientById).mockResolvedValue(null)

      const client = await getClientById('nonexistent')

      expect(client).toBeNull()
    })

    it('should return null when client is inactive', async () => {
      vi.mocked(storage.findClientById).mockResolvedValue({
        client_id: 'client-123',
        client_secret_hash: 'hash',
        client_name: 'Test',
        redirect_uris: [],
        grant_types: [],
        response_types: [],
        scopes: [],
        token_endpoint_auth_method: 'client_secret_post',
        is_active: false,
        created_at: new Date(),
        updated_at: new Date(),
      })

      const client = await getClientById('client-123')

      expect(client).toBeNull()
    })
  })

  describe('authenticateClient', () => {
    it('should authenticate valid credentials', async () => {
      const hash =
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' // SHA-256 of empty string - we need to use the actual hash from credentials
      // We need to mock the credentials module or use a known hash
      vi.mocked(storage.findClientById).mockResolvedValue({
        client_id: 'client-123',
        client_secret_hash: hash,
        client_name: 'Test',
        redirect_uris: [],
        grant_types: [],
        response_types: [],
        scopes: [],
        token_endpoint_auth_method: 'client_secret_post',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })

      // Import hashClientSecret to get correct hash for our test secret
      const { hashClientSecret } = await import('../credentials.ts')
      vi.mocked(storage.findClientById).mockResolvedValue({
        client_id: 'client-123',
        client_secret_hash: hashClientSecret('correct-secret'),
        client_name: 'Test',
        redirect_uris: [],
        grant_types: [],
        response_types: [],
        scopes: [],
        token_endpoint_auth_method: 'client_secret_post',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })

      const client = await authenticateClient('client-123', 'correct-secret')

      expect(client).not.toBeNull()
      expect(client?.id).toBe('client-123')
    })

    it('should reject invalid credentials', async () => {
      const { hashClientSecret } = await import('../credentials.ts')
      vi.mocked(storage.findClientById).mockResolvedValue({
        client_id: 'client-123',
        client_secret_hash: hashClientSecret('correct-secret'),
        client_name: 'Test',
        redirect_uris: [],
        grant_types: [],
        response_types: [],
        scopes: [],
        token_endpoint_auth_method: 'client_secret_post',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })

      const client = await authenticateClient('client-123', 'wrong-secret')

      expect(client).toBeNull()
    })

    it('should return null for non-existent client', async () => {
      vi.mocked(storage.findClientById).mockResolvedValue(null)

      const client = await authenticateClient('nonexistent', 'secret')

      expect(client).toBeNull()
    })
  })

  describe('isRedirectUriAllowed', () => {
    it('should return true when URI is in allowed list', async () => {
      vi.mocked(storage.findClientById).mockResolvedValue({
        client_id: 'client-123',
        client_secret_hash: null,
        client_name: 'Test',
        redirect_uris: ['https://example.com/callback'],
        grant_types: [],
        response_types: [],
        scopes: [],
        token_endpoint_auth_method: 'none',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })

      const allowed = await isRedirectUriAllowed(
        'client-123',
        'https://example.com/callback',
      )

      expect(allowed).toBe(true)
    })

    it('should return false when URI is not in allowed list', async () => {
      vi.mocked(storage.findClientById).mockResolvedValue({
        client_id: 'client-123',
        client_secret_hash: null,
        client_name: 'Test',
        redirect_uris: ['https://example.com/callback'],
        grant_types: [],
        response_types: [],
        scopes: [],
        token_endpoint_auth_method: 'none',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })

      const allowed = await isRedirectUriAllowed(
        'client-123',
        'https://evil.com/callback',
      )

      expect(allowed).toBe(false)
    })
  })

  describe('validateScopes', () => {
    it('should return valid when all scopes are allowed', async () => {
      vi.mocked(storage.findClientById).mockResolvedValue({
        client_id: 'client-123',
        client_secret_hash: null,
        client_name: 'Test',
        redirect_uris: [],
        grant_types: [],
        response_types: [],
        scopes: ['openid', 'profile', 'email'],
        token_endpoint_auth_method: 'none',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })

      const result = await validateScopes('client-123', ['openid', 'profile'])

      expect(result.valid).toBe(true)
      expect(result.invalidScopes).toHaveLength(0)
    })

    it('should return invalid scopes when some are not allowed', async () => {
      vi.mocked(storage.findClientById).mockResolvedValue({
        client_id: 'client-123',
        client_secret_hash: null,
        client_name: 'Test',
        redirect_uris: [],
        grant_types: [],
        response_types: [],
        scopes: ['openid', 'profile'],
        token_endpoint_auth_method: 'none',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })

      const result = await validateScopes('client-123', [
        'openid',
        'profile',
        'admin',
      ])

      expect(result.valid).toBe(false)
      expect(result.invalidScopes).toContain('admin')
    })
  })
})
