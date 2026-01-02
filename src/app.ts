import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import info from '../package.json' with { type: 'json' }
import { getOidcConfig } from './oidc/config.ts'
import { handleDiscovery } from './oidc/discovery.ts'
import { handleJwks } from './oidc/jwks.ts'
import { log } from './plumbing/logger.ts'

const { name, version } = info

const app = new Hono()
const port = Number(process.env.PORT) || 3000

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

// OIDC Discovery endpoints
app.get('/.well-known/openid-configuration', handleDiscovery)
app.get('/.well-known/jwks.json', handleJwks)

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
