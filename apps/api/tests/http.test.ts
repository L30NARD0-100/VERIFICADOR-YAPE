import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app.js'
import { ApiError } from '../src/middleware/errors.js'
import { loadEnvironment } from '../src/config/environment.js'
import { notification } from '../src/schemas/contracts.js'

let authCalls = 0
const app = createApp({
  pool: {} as Pool,
  frontendOrigin: 'https://panel.example.test',
  auth: {
    async authenticate() { authCalls++; throw new ApiError(401, 'unauthorized', 'Credencial inválida.') },
    async invite() { throw new Error('No debería llamarse.') },
  },
})

test('CORS configura solo el origen autorizado', async () => {
  const preflight = await app.request('/api/companies', { method: 'OPTIONS', headers: {
    Origin: 'https://panel.example.test', 'Access-Control-Request-Method': 'GET',
  } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://panel.example.test')
  const blocked = await app.request('/api/companies', { headers: { Origin: 'https://other.example.test' } })
  assert.notEqual(blocked.headers.get('Access-Control-Allow-Origin'), 'https://other.example.test')
})

test('las rutas privadas requieren Bearer y devuelven errores estructurados', async () => {
  const response = await app.request('/api/companies')
  assert.equal(response.status, 401)
  assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.match(response.headers.get('X-Request-ID') ?? '', /^[0-9a-f-]{36}$/)
  assert.equal((await response.json()).error.code, 'unauthorized')
})

test('Hono autentica una vez incluso en la ruta raíz de empresas', async () => {
  authCalls = 0
  const response = await app.request('/api/companies', { headers: { Authorization: 'Bearer token' } })
  assert.equal(response.status, 401)
  assert.equal(authCalls, 1)
})

test('rechaza JSON inválido, errores de esquema y cuerpos demasiado grandes', async () => {
  const headers = { 'Content-Type': 'application/json' }
  const path = '/api/payments/notifications'
  const malformed = await app.request(path, { method: 'POST', headers, body: '{' })
  assert.equal(malformed.status, 400)
  assert.equal((await malformed.json()).error.code, 'invalid_json')
  const invalid = await app.request(path, { method: 'POST', headers, body: '{}' })
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.code, 'validation_error')
  const oversized = await app.request(path, { method: 'POST', headers, body: ' '.repeat(16 * 1024 + 1) })
  assert.equal(oversized.status, 413)
})

test('normaliza importes y timestamps y rechaza metadata no permitida', () => {
  const input = {
    event_id: '69b2ab04-aa12-4220-8062-c226391994cc',
    device_id: '2b67bebb-33f8-43f3-af22-f54000920a50',
    event_type: 'payment_notice',
    received_at: '2026-11-25T02:03:04-05:00',
    amount: '15.5',
  }
  const parsed = notification.parse(input)
  assert.equal(parsed.amount, '15.50')
  assert.equal(parsed.received_at, '2026-11-25T07:03:04.000Z')
  assert.equal(parsed.sender_name, null)
  assert.equal(notification.safeParse({ ...input, amount: '15.123' }).success, false)
  assert.equal(notification.safeParse({ ...input, metadata: { content: 'texto ajeno' } }).success, false)
  assert.equal(notification.safeParse({ ...input, company_id: input.device_id }).success, false)
})

test('el servicio productivo falla con configuración incompleta sin revelar valores', () => {
  assert.equal(loadEnvironment({}).services, undefined)
  assert.throws(() => loadEnvironment({ NODE_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: 'private-value' }),
    (error) => error instanceof Error && error.message.includes('DATABASE_URL') && !error.message.includes('private-value'))
})
