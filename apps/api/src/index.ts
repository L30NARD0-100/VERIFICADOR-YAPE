import { serve } from '@hono/node-server'
import pg from 'pg'
import { createApp } from './app.js'
import { loadEnvironment } from './config/environment.js'
import { supabaseAuth } from './services/auth.js'

const { port, services } = loadEnvironment(process.env)
const pool = services ? new pg.Pool({
  connectionString: services.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  idle_in_transaction_session_timeout: 20000,
}) : undefined
pool?.on('error', () => console.error(JSON.stringify({ event: 'database_pool_error' })))

const app = createApp(services && pool ? {
  pool,
  auth: supabaseAuth(services.SUPABASE_URL, services.SUPABASE_ANON_KEY, services.SUPABASE_SERVICE_ROLE_KEY),
  frontendOrigin: new URL(services.FRONTEND_URL).origin,
} : undefined)

const server = serve({ fetch: app.fetch, hostname: '0.0.0.0', port }, (address) => {
  console.info(JSON.stringify({ event: 'api_started', port: address.port }))
})

function shutdown() {
  server.close(() => { void pool?.end() })
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
