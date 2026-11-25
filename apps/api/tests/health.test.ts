import assert from 'node:assert/strict'
import test from 'node:test'
import { app } from '../src/app.js'

test('GET /api/health responde con el estado del proceso', async () => {
  const response = await app.request('/api/health')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})

test('una ruta inexistente responde con 404', async () => {
  const response = await app.request('/api/inexistente')
  assert.equal(response.status, 404)
})
