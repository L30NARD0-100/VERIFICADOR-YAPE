import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { ApiError, handleError } from './middleware/errors.js'
import { companyRoutes } from './routes/companies.js'
import { deviceRoutes } from './routes/devices.js'
import type { ApiEnv, Dependencies } from './routes/request.js'

export function createApp(dependencies?: Dependencies) {
  const app = new Hono<ApiEnv>()
  app.onError(handleError)
  app.use('*', async (context, next) => {
    const id = randomUUID()
    const started = performance.now()
    context.header('X-Request-ID', id)
    context.header('Cache-Control', 'no-store')
    await next()
    if (dependencies && context.req.path !== '/api/health') {
      console.info(JSON.stringify({
        event: 'api_request', requestId: id, method: context.req.method,
        status: context.res.status, durationMs: Math.round(performance.now() - started),
      }))
    }
  })
  app.use('*', secureHeaders())
  if (dependencies) app.use('/api/*', cors({
    origin: dependencies.frontendOrigin,
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    exposeHeaders: ['X-Request-ID', 'Retry-After'],
    maxAge: 600,
  }))
  app.get('/api/health', (context) => context.json({ status: 'ok' }))
  app.notFound((context) => context.json({ error: { code: 'not_found', message: 'Ruta no encontrada.' } }, 404))
  if (!dependencies) return app

  const api = new Hono<ApiEnv>()
  api.use('*', bodyLimit({
    maxSize: 16 * 1024,
    onError: () => { throw new ApiError(413, 'body_too_large', 'El cuerpo supera 16 KiB.') },
  }))
  deviceRoutes(api, dependencies)
  companyRoutes(api, dependencies)
  app.route('/api', api)
  return app
}

export const app = createApp()
