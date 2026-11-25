import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { createApp } from '../src/app.js'
import { unauthorized } from '../src/middleware/errors.js'

const connectionString = process.env.TEST_DATABASE_URL
if (!connectionString) throw new Error('Define TEST_DATABASE_URL para una base local de pruebas migrada.')

test('API de negocio con PostgreSQL y RLS', async (t) => {
  const pool = new pg.Pool({ connectionString })
  const users = new Map([
    ['platform', randomUUID()], ['admin', randomUUID()], ['cashier', randomUUID()],
    ['manager', randomUUID()], ['other', randomUUID()],
  ])
  const suffix = randomUUID()
  const companies: string[] = []
  const invited: string[] = []
  const devices: string[] = []
  const app = createApp({
    pool,
    frontendOrigin: 'http://localhost:5173',
    auth: {
      async authenticate(token) {
        const id = users.get(token)
        if (!id) throw unauthorized()
        return id
      },
      async invite(email) {
        const id = randomUUID()
        await pool.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
        invited.push(id)
        return id
      },
    },
  })

  async function request(method: string, path: string, status: number, token?: string, payload?: unknown) {
    const headers = new Headers()
    if (token) headers.set('Authorization', 'Bearer ' + token)
    if (payload !== undefined) headers.set('Content-Type', 'application/json')
    const response = await app.request('/api' + path, {
      method, headers, body: payload === undefined ? undefined : JSON.stringify(payload),
    })
    assert.equal(response.status, status, method + ' ' + path + ': ' + await response.clone().text())
    return response
  }
  const data = async (...args: Parameters<typeof request>) => (await request(...args)).json()

  t.after(async () => {
    try {
      await pool.query('delete from public.audit_logs where company_id = any($1::uuid[]) or user_id = any($2::uuid[])',
        [companies, [...users.values()]])
      await pool.query('delete from public.payment_events where company_id = any($1::uuid[])', [companies])
      await pool.query('delete from public.payments where company_id = any($1::uuid[])', [companies])
      await pool.query('delete from public.devices where company_id = any($1::uuid[])', [companies])
      await pool.query('delete from public.company_members where company_id = any($1::uuid[])', [companies])
      await pool.query('delete from public.branches where company_id = any($1::uuid[])', [companies])
      await pool.query('delete from public.companies where id = any($1::uuid[])', [companies])
      await pool.query('delete from auth.users where id = any($1::uuid[])', [[...users.values(), ...invited]])
      await pool.query("delete from app_private.api_rate_limits where bucket = 'pairing' or split_part(bucket, ':', 2) = any($1::text[])",
        [[...users.values(), ...devices]])
    } finally {
      await pool.end()
    }
  })

  for (const [name, id] of users) {
    await pool.query('insert into auth.users (id, email) values ($1, $2)', [id, name + '-' + suffix + '@example.test'])
  }
  await pool.query('insert into app_private.platform_admins (profile_id) values ($1)', [users.get('platform')])

  await request('POST', '/companies', 403, 'admin', { name: 'No permitido', admin_profile_id: users.get('admin') })
  const company = await data('POST', '/companies', 201, 'platform', { name: 'Empresa A', admin_profile_id: users.get('admin') })
  companies.push(company.id)
  const other = await data('POST', '/companies', 201, 'platform', { name: 'Empresa B', admin_profile_id: users.get('other') })
  companies.push(other.id)
  const scope = '/companies/' + company.id
  const otherScope = '/companies/' + other.id
  assert.equal((await data('GET', '/me', 200, 'platform')).is_platform_admin, true)
  assert.equal((await data('GET', '/companies', 200, 'admin')).data[0].id, company.id)
  await request('GET', otherScope, 404, 'admin')
  await request('GET', scope + '/payments', 404, 'platform')
  assert.equal((await data('PATCH', scope, 200, 'admin', { name: 'Empresa revisada' })).name, 'Empresa revisada')

  const branchA = await data('POST', scope + '/branches', 201, 'admin', { name: 'Caja A' })
  const branchB = await data('POST', scope + '/branches', 201, 'admin', { name: 'Caja B' })
  const foreignBranch = await data('POST', otherScope + '/branches', 201, 'other', { name: 'Sucursal ajena' })
  const email = (name: string) => name + '-' + suffix + '@example.test'
  const cashier = await data('POST', scope + '/users', 201, 'admin', {
    email: email('cashier'), role: 'CASHIER', branch_ids: [branchA.id],
  })
  await data('POST', scope + '/users', 201, 'admin', {
    email: email('manager'), role: 'MANAGER', branch_ids: [branchB.id],
  })
  const invitedUser = await data('POST', scope + '/users', 201, 'admin', {
    email: email('invited'), full_name: 'Cuenta invitada', role: 'CASHIER',
  })
  const membership = await data('GET', scope + '/users', 200, 'admin')
  assert.equal(membership.data.find((item: { id: string }) => item.id === invitedUser.id).full_name, 'Cuenta invitada')
  const adminId = membership.data.find((item: { role: string }) => item.role === 'COMPANY_ADMIN').id
  await request('PATCH', scope + '/users/' + adminId, 409, 'admin', { status: 'inactive' })
  await request('POST', scope + '/users', 404, 'admin', {
    email: email('other'), role: 'CASHIER', branch_ids: [foreignBranch.id],
  })
  await request('GET', scope + '/users', 403, 'manager')
  await request('PATCH', scope + '/branches/' + branchA.id, 404, 'manager', { name: 'Ajena' })
  await request('PATCH', scope + '/branches/' + branchB.id, 403, 'manager', { status: 'inactive' })
  await request('PATCH', scope + '/branches/' + branchB.id, 200, 'manager', { address: 'Lima' })

  const newDevice = (branch_id: string) => ({ branch_id, name: 'Android', device_identifier: suffix })
  await request('POST', scope + '/devices', 404, 'manager', newDevice(branchA.id))
  await request('POST', scope + '/devices', 403, 'cashier', newDevice(branchA.id))
  const device = await data('POST', scope + '/devices', 201, 'admin', newDevice(branchA.id))
  devices.push(device.id)
  await request('GET', scope + '/devices/' + device.id, 404, 'manager')
  const issue = () => data('POST', scope + '/devices/' + device.id + '/pairing', 201, 'admin')
  const old = await issue()
  const pair = await issue()
  await request('POST', '/devices/register', 401, undefined, { pairing_code: old.pairing_code })
  const link = await data('POST', '/devices/register', 201, undefined, { pairing_code: pair.pairing_code, app_version: '1.0' })
  await request('POST', '/devices/register', 401, undefined, { pairing_code: pair.pairing_code })
  await request('POST', scope + '/devices/' + device.id + '/pairing', 409, 'admin')
  assert.equal((await data('POST', '/devices/heartbeat', 200, link.device_token, { app_version: '1.1' })).app_version, '1.1')

  const notification = {
    event_id: randomUUID(), device_id: device.id, event_type: 'payment_notice',
    sender_name: '=Potential, formula', amount: '15.5', currency: 'PEN', received_at: '2026-11-26T04:59:59Z',
  }
  await request('POST', '/payments/notifications', 401, 'admin', notification)
  await request('POST', '/payments/notifications', 401, link.device_token, { ...notification, device_id: randomUUID() })
  const simultaneous = await Promise.all([1, 2].map(() => app.request('/api/payments/notifications', {
    method: 'POST', headers: { Authorization: 'Bearer ' + link.device_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(notification),
  })))
  assert.deepEqual(simultaneous.map(({ status }) => status).sort(), [200, 201])
  const results = await Promise.all(simultaneous.map((response) => response.json()))
  assert.equal(results[0].event.payment_id, results[1].event.payment_id)
  assert.equal(results[0].event.id, results[1].event.id)
  const original = results[0].event
  assert.equal((await data('POST', '/payments/notifications', 200, link.device_token, { ...notification, amount: '15.50' })).duplicate, true)
  await request('POST', '/payments/notifications', 409, link.device_token, { ...notification, amount: '15.51' })

  const incomplete = await data('POST', '/payments/notifications', 201, link.device_token,
    { ...notification, event_id: randomUUID(), amount: null, currency: null })
  assert.equal(incomplete.event.processing_status, 'needs_review')
  assert.equal(incomplete.event.payment_id, null)
  const nextDay = await data('POST', '/payments/notifications', 201, link.device_token,
    { ...notification, event_id: randomUUID(), received_at: '2026-11-26T05:00:00Z' })
  const firstPage = await data('GET', scope + '/payments?limit=1', 200, 'cashier')
  assert.equal(firstPage.data[0].id, nextDay.event.payment_id)
  const secondPage = await data('GET', scope + '/payments?limit=1&cursor=' + firstPage.next_cursor, 200, 'cashier')
  assert.equal(secondPage.data[0].id, original.payment_id)
  assert.equal(secondPage.next_cursor, null)
  await request('GET', scope + '/payments?cursor=invalid', 400, 'cashier')
  await request('GET', scope + '/payments?limit=1&limit=2', 400, 'cashier')
  assert.equal((await data('GET', scope + '/payments/' + original.payment_id, 200, 'cashier')).status, 'pending_verification')
  assert.equal((await data('GET', scope + '/payments?q=Potential', 200, 'cashier')).data.length, 2)
  assert.equal((await data('GET', scope + '/payments?q=%25', 200, 'cashier')).data.length, 0)
  assert.equal((await data('GET', scope + '/payments', 200, 'manager')).data.length, 0)
  await request('GET', otherScope + '/payments/' + original.payment_id, 404, 'other')
  const events = await data('GET', scope + '/payment-events?status=needs_review', 200, 'cashier')
  assert.equal(events.data[0].id, incomplete.event.id)
  assert.equal(Object.hasOwn(events.data[0], 'payload'), false)

  const totals = await data('GET', scope + '/reports/daily?date=2026-11-25', 200, 'cashier')
  assert.deepEqual(totals.events_by_status, { processed: '1', needs_review: '1' })
  assert.equal(totals.totals_by_currency[0].detected_amount, '15.50')
  assert.equal(totals.totals_by_currency[0].officially_verified_amount, '0')
  const empty = await data('GET', scope + '/reports/summary?from=2026-11-25&to=2026-11-26', 200, 'manager')
  assert.deepEqual(empty.totals_by_currency, [])
  const exportPath = scope + '/reports/export.csv?from=2026-11-25&to=2026-11-25'
  await request('GET', exportPath, 403, 'cashier')
  const csv = await request('GET', exportPath, 200, 'admin')
  assert.match(await csv.text(), /"'=Potential, formula"/)
  await request('GET', scope + '/audit-logs', 403, 'cashier')
  assert.ok((await data('GET', scope + '/audit-logs', 200, 'admin')).data
    .some((row: { action: string }) => row.action === 'event.received'))

  await pool.query(`update app_private.api_rate_limits set hits = 120,
    window_started_at = date_trunc('minute', now()) + interval '1 minute'
    where bucket = $1`, ['device:' + device.id + ':notifications'])
  const limited = await request('POST', '/payments/notifications', 429, link.device_token, notification)
  assert.ok(Number(limited.headers.get('Retry-After')) > 0)

  await request('PATCH', scope + '/users/' + cashier.id, 200, 'admin', { status: 'inactive' })
  await request('GET', scope + '/payments', 404, 'cashier')
  await request('POST', scope + '/devices/' + device.id + '/revoke', 204, 'admin')
  await request('POST', '/devices/heartbeat', 401, link.device_token, {})
  const repair = await issue()
  const next = await data('POST', '/devices/register', 201, undefined, { pairing_code: repair.pairing_code })
  assert.notEqual(next.device_token, link.device_token)
  await request('POST', '/devices/unlink', 204, next.device_token)
  await request('POST', '/devices/heartbeat', 401, next.device_token, {})
})
