import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import info from '../package.json' with { type: 'json' }
import { log } from './plumbing/logger.ts'

const { name, version } = info

const app = new Hono()
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
