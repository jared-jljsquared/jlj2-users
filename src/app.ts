import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import info from '../package.json' with { type: 'json' }
import clients from './clients/routes.ts'
import { initializeDatabase, shutdownDatabase } from './database/client.ts'
import { checkDatabaseHealth } from './database/health.ts'
import flows from './flows/routes.ts'
import { httpsEnforcement } from './middleware/https-enforcement.ts'
import { securityHeaders } from './middleware/security-headers.ts'
import { getOidcConfig } from './oidc/config.ts'
import { handleDiscovery } from './oidc/discovery.ts'
import { handleJwks } from './oidc/jwks.ts'
import { log } from './plumbing/logger.ts'
import { initializeKeys } from './tokens/key-management.ts'
import users from './users/routes.ts'

const { name, version } = info

const app = new Hono()

app.use('*', securityHeaders)
app.use('*', httpsEnforcement)
const port = Number(process.env.PORT) || 3000

app.get('/', (c) => {
  return c.json({
    message: 'No base get function defined',
  })
})

app.get('/about', (c) => {
  return c.json({
    name,
    version,
  })
})

app.get('/health', async (c) => {
  const dbHealth = await checkDatabaseHealth()

  return c.json({
    status: dbHealth.isHealthy ? 'ok' : 'degraded',
    checks: {
      database: dbHealth,
    },
  })
})

// OIDC Discovery endpoints
app.get('/.well-known/openid-configuration', handleDiscovery)
app.get('/.well-known/jwks.json', handleJwks)

// User management endpoints
app.route('/users', users)

// OAuth client registration and management
app.route('/clients', clients)

// OAuth/OIDC flows: authorize, token, login
app.route('/', flows)

const start = async (): Promise<void> => {
  // Validate OIDC configuration on startup
  try {
    getOidcConfig()
  } catch (error) {
    log({
      message: 'Failed to initialize OIDC configuration',
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }

  // Initialize key store (generate default key if none exist)
  try {
    const defaultKey = initializeKeys()
    log({
      message: 'Key store initialized',
      kid: defaultKey.kid,
      algorithm: defaultKey.algorithm,
    })
  } catch (error) {
    log({
      message: 'Failed to initialize key store',
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }

  // Initialize database connection
  try {
    await initializeDatabase()
  } catch (error) {
    log({
      message: 'Failed to initialize database',
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }

  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      if (!process.env.PORT) {
        log('process.env.PORT is undefined - defaulting to 3000')
      }
      log(`Hono service listening at http://localhost:${info.port}`)
    },
  )
}

void start()

const handleShutdown = async (signal: NodeJS.Signals): Promise<void> => {
  log({
    message: 'Shutting down service',
    signal,
  })
  await shutdownDatabase()
  process.exit(0)
}

process.on('SIGINT', (signal) => {
  void handleShutdown(signal)
})

process.on('SIGTERM', (signal) => {
  void handleShutdown(signal)
})
