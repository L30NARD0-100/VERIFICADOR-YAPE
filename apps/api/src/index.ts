import { serve } from '@hono/node-server'
import { z } from 'zod'
import { app } from './app.js'

const port = z.coerce.number().int().min(1).max(65535).parse(process.env.PORT ?? '3000')

serve({ fetch: app.fetch, hostname: '0.0.0.0', port }, ({ port }) => {
  console.info(`API disponible en el puerto ${port}`)
})
