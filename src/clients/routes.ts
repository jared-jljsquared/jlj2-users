import { Hono } from 'hono'
import {
  deactivateClientById,
  getClientById,
  registerClient,
  updateClientById,
} from './service.ts'
import type {
  ClientRegistrationInput,
  ClientUpdateInput,
} from './types/client.ts'

const clients = new Hono()

/**
 * POST /clients
 * Register a new OAuth client
 */
clients.post('/', async (c) => {
  try {
    const body = (await c.req.json()) as ClientRegistrationInput

    const client = await registerClient(body)

    return c.json(
      {
        id: client.id,
        name: client.name,
        redirectUris: client.redirectUris,
        grantTypes: client.grantTypes,
        responseTypes: client.responseTypes,
        scopes: client.scopes,
        tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
        createdAt: client.createdAt.toISOString(),
        updatedAt: client.updatedAt.toISOString(),
        secret: client.secret,
      },
      201,
    )
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === 'Client name is required' ||
        error.message === 'At least one redirect URI is required' ||
        error.message.startsWith('Invalid redirect URI') ||
        error.message.startsWith('Invalid grant type') ||
        error.message.startsWith('Invalid response type') ||
        error.message.startsWith('Invalid scope') ||
        error.message.startsWith('Invalid token_endpoint_auth_method')
      ) {
        return c.json({ error: error.message }, 400)
      }
    }
    return c.json({ error: 'Client registration failed' }, 500)
  }
})

/**
 * GET /clients/:id
 * Get client metadata (never returns secret)
 */
clients.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const client = await getClientById(id)

    if (!client) {
      return c.json({ error: 'Client not found' }, 404)
    }

    return c.json({
      id: client.id,
      name: client.name,
      redirectUris: client.redirectUris,
      grantTypes: client.grantTypes,
      responseTypes: client.responseTypes,
      scopes: client.scopes,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    })
  } catch (_error) {
    return c.json({ error: 'Failed to retrieve client' }, 500)
  }
})

/**
 * PUT /clients/:id
 * Update client metadata
 */
clients.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = (await c.req.json()) as ClientUpdateInput

    const client = await updateClientById(id, body)

    if (!client) {
      return c.json({ error: 'Client not found' }, 404)
    }

    return c.json({
      id: client.id,
      name: client.name,
      redirectUris: client.redirectUris,
      grantTypes: client.grantTypes,
      responseTypes: client.responseTypes,
      scopes: client.scopes,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('Invalid redirect URI')) {
        return c.json({ error: error.message }, 400)
      }
    }
    return c.json({ error: 'Failed to update client' }, 500)
  }
})

/**
 * DELETE /clients/:id
 * Deactivate a client
 */
clients.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const deactivated = await deactivateClientById(id)

    if (!deactivated) {
      return c.json({ error: 'Client not found' }, 404)
    }

    return c.json({ message: 'Client deactivated successfully' })
  } catch (_error) {
    return c.json({ error: 'Failed to deactivate client' }, 500)
  }
})

export default clients
