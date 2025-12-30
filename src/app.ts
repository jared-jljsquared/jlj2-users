import 'dotenv/config'
import type { Request, Response } from 'express'
import express from 'express'
import info from '../package.json' with { type: 'json' }
import { log } from './plumbing/logger.ts'

const { name, version } = info

const app = express()
const port = process.env.PORT || 3000

app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'No base get function defined',
  })
})

app.get('/about', (_req, res) => {
  res.json({
    name,
    version,
  })
})

app.listen(port, () => {
  if (!process.env.PORT) {
    log('process.env.PORT is undefined - defaulting to 3000')
  }
  return log(`Express service listening at htpp://localhost:${port}`)
})
