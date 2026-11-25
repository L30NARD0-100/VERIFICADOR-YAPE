import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { z } from 'zod'
import { conflict, notFound, unauthorized } from '../middleware/errors.js'
import { audit, branchScope, manageCompany } from '../repositories/access.js'
import { consumeRate, one, transaction } from '../repositories/database.js'
import { uuid } from '../schemas/contracts.js'
import type { deviceCreate, deviceRegister, heartbeat, notification } from '../schemas/contracts.js'

type Actor = { profile: string; company: string }
type Device = { id: string; company_id: string; branch_id: string; status: 'pending' | 'active' | 'revoked' }
type Credential = { id: string; hash: Buffer }
const management = ['COMPANY_ADMIN', 'MANAGER'] as const
const digest = (value: string) => createHash('sha256').update(value).digest()

async function loadDevice(
  db: PoolClient, company: string, id: string, profile: string, role: typeof management[number],
) {
  const device = await one<Device>(db, 'select * from public.devices where id = $1 and company_id = $2', [id, company])
  if (!device) throw notFound()
  await branchScope(db, profile, company, device.branch_id, role)
  return device
}

export function createDevice(pool: Pool, actor: Actor, input: z.infer<typeof deviceCreate>) {
  return transaction(pool, async (db) => {
    const role = await manageCompany(db, actor.profile, actor.company, management)
    await branchScope(db, actor.profile, actor.company, input.branch_id, role)
    if (!await one(db, "select id from public.branches where company_id = $1 and id = $2 and status = 'active'",
      [actor.company, input.branch_id])) throw conflict('La sucursal está inactiva.')
    const device = (await db.query<Device>(`
      insert into public.devices (company_id, branch_id, name, device_identifier) values ($1, $2, $3, $4) returning *
    `, [actor.company, input.branch_id, input.name, input.device_identifier])).rows[0]!
    await audit(db, { ...actor, actor: actor.profile, action: 'device.created', entity: 'device', id: device.id })
    return device
  })
}

export function issuePairing(pool: Pool, actor: Actor, id: string) {
  return transaction(pool, async (db) => {
    const role = await manageCompany(db, actor.profile, actor.company, management)
    const device = await loadDevice(db, actor.company, id, actor.profile, role)
    if (device.status === 'active') throw conflict('Revoca la vinculación activa antes de emitir un nuevo código.')
    if (!await one(db, "select id from public.branches where company_id = $1 and id = $2 and status = 'active'",
      [actor.company, device.branch_id])) throw conflict('La sucursal está inactiva.')
    const code = randomBytes(16).toString('base64url')
    await invalidatePairings(db, id)
    const pairing = (await db.query<{ expires_at: Date }>(`
      insert into app_private.device_pairings (device_id, code_hash, expires_at)
      values ($1, $2, now() + interval '5 minutes') returning expires_at
    `, [id, digest(code)])).rows[0]!
    await audit(db, { ...actor, actor: actor.profile, action: 'device.pairing_issued', entity: 'device', id })
    return { pairing_code: code, expires_at: pairing.expires_at }
  })
}

function invalidatePairings(db: PoolClient, id: string) {
  return db.query(`update app_private.device_pairings set revoked_at = clock_timestamp()
    where device_id = $1 and consumed_at is null and revoked_at is null`, [id])
}

async function revoke(db: PoolClient, device: Device) {
  await db.query("update public.devices set status = 'revoked' where id = $1", [device.id])
  await db.query('delete from app_private.device_credentials where device_id = $1', [device.id])
  await invalidatePairings(db, device.id)
}

export function revokeDevice(pool: Pool, actor: Actor, id: string) {
  return transaction(pool, async (db) => {
    const role = await manageCompany(db, actor.profile, actor.company, management)
    const device = await loadDevice(db, actor.company, id, actor.profile, role)
    await revoke(db, device)
    await audit(db, { ...actor, actor: actor.profile, action: 'device.revoked', entity: 'device', id })
  })
}

async function lockDevice(db: PoolClient, id: string, requireActiveScope = true) {
  const lookup = await one<{ company_id: string }>(db, 'select company_id from public.devices where id = $1', [id])
  if (!lookup) throw unauthorized()
  const company = await one<{ status: string }>(db, 'select status from public.companies where id = $1 for share',
    [lookup.company_id])
  const device = await one<Device>(db, 'select * from public.devices where id = $1 and company_id = $2 for update',
    [id, lookup.company_id])
  if (!device || (requireActiveScope && (company?.status !== 'active' || !await one(db,
    "select id from public.branches where company_id = $1 and id = $2 and status = 'active' for share",
    [device.company_id, device.branch_id])))) throw unauthorized()
  return device
}

export async function registerDevice(pool: Pool, input: z.infer<typeof deviceRegister>) {
  await consumeRate(pool, 'pairing', 120)
  return transaction(pool, async (db) => {
    const hash = digest(input.pairing_code)
    const pairing = await one<{ device_id: string }>(db,
      'select device_id from app_private.device_pairings where code_hash = $1', [hash])
    if (!pairing) throw unauthorized()
    const device = await lockDevice(db, pairing.device_id)
    if (device.status === 'active' || !(await db.query(`
      update app_private.device_pairings set consumed_at = statement_timestamp()
      where code_hash = $1 and device_id = $2 and consumed_at is null and revoked_at is null
        and expires_at > statement_timestamp()
    `, [hash, device.id])).rowCount) throw unauthorized()

    const secret = randomBytes(32).toString('base64url')
    await db.query('insert into app_private.device_credentials (device_id, device_token_hash) values ($1, $2)',
      [device.id, digest(secret)])
    await db.query(`update public.devices set status = 'active', paired_at = now(), last_seen_at = now(), app_version = $2
      where id = $1`, [device.id, input.app_version])
    await audit(db, { company: device.company_id, actor: device.id, actorType: 'device',
      action: 'device.paired', entity: 'device', id: device.id })
    return {
      device_id: device.id, company_id: device.company_id, branch_id: device.branch_id,
      device_token: device.id + '.' + secret,
    }
  })
}

async function validateCredential(db: Pool | PoolClient, credential: Credential) {
  const row = await one<{ device_token_hash: Buffer }>(db,
    'select device_token_hash from app_private.device_credentials where device_id = $1', [credential.id])
  if (!row || !timingSafeEqual(row.device_token_hash, credential.hash)) throw unauthorized()
}

export async function authenticateDevice(pool: Pool, token: string, action: 'notifications' | 'heartbeat' | 'unlink') {
  const parts = token.split('.')
  const id = uuid.safeParse(parts[0])
  const secret = parts[1]
  if (!id.success || !secret || parts.length !== 2 || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw unauthorized()
  const credential = { id: id.data, hash: digest(secret) }
  await validateCredential(pool, credential)
  await consumeRate(pool, `device:${id.data}:${action}`, action === 'notifications' ? 120 : 30)
  return credential
}

async function authorizedDevice(db: PoolClient, credential: Credential, activeScope = true) {
  const device = await lockDevice(db, credential.id, activeScope)
  if (device.status !== 'active') throw unauthorized()
  await validateCredential(db, credential)
  return device
}

export function deviceHeartbeat(pool: Pool, credential: Credential, input: z.infer<typeof heartbeat>) {
  return transaction(pool, async (db) => {
    const device = await authorizedDevice(db, credential)
    return one(db, `update public.devices set last_seen_at = clock_timestamp(), app_version = coalesce($2, app_version)
      where id = $1 returning last_seen_at, app_version`, [device.id, input.app_version])
  })
}

export function unlinkDevice(pool: Pool, credential: Credential) {
  return transaction(pool, async (db) => {
    const device = await authorizedDevice(db, credential, false)
    await revoke(db, device)
    await audit(db, { company: device.company_id, actor: device.id, actorType: 'device',
      action: 'device.unlinked', entity: 'device', id: device.id })
  })
}

type Notification = z.infer<typeof notification>

export function ingestNotification(pool: Pool, credential: Credential, input: Notification) {
  if (credential.id !== input.device_id) throw unauthorized()
  return transaction(pool, async (db) => {
    const device = await authorizedDevice(db, credential)
    const fingerprint = digest(JSON.stringify(input))
    const previous = await one<{ id: string; payment_id: string | null; processing_status: string; fingerprint: Buffer }>(
      db, `select e.id, e.payment_id, e.processing_status, p.request_fingerprint as fingerprint
        from public.payment_events e left join app_private.payment_event_payloads p on p.payment_event_id = e.id
        where e.device_id = $1 and e.event_id = $2`, [device.id, input.event_id])
    if (previous) {
      if (!previous.fingerprint || !timingSafeEqual(previous.fingerprint, fingerprint)) {
        throw conflict('El event_id ya está asociado a otra notificación.')
      }
      const { fingerprint: _fingerprint, ...event } = previous
      return { duplicate: true, event }
    }

    let paymentId: string | null = null
    if (input.amount !== null && input.currency !== null) {
      const method = await one<{ id: string }>(db,
        "select id from public.payment_methods where code = 'yape' and status = 'active' for share")
      if (!method) throw conflict('El método de pago no está disponible.')
      paymentId = (await db.query<{ id: string }>(`
        insert into public.payments (company_id, branch_id, device_id, payment_method_id, sender_name, amount, currency, received_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8) returning id
      `, [device.company_id, device.branch_id, device.id, method.id, input.sender_name, input.amount,
        input.currency, input.received_at])).rows[0]!.id
    }

    const event = (await db.query<{ id: string; payment_id: string | null; processing_status: string }>(`
      insert into public.payment_events (company_id, branch_id, device_id, payment_id, event_id,
        event_type, source_notification_id, processing_status, captured_at, processed_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp())
      returning id, payment_id, processing_status
    `, [device.company_id, device.branch_id, device.id, paymentId, input.event_id,
      input.event_type, input.source_notification_id, paymentId ? 'processed' : 'needs_review', input.received_at])).rows[0]!

    await db.query(`insert into app_private.payment_event_payloads (payment_event_id, payload, request_fingerprint)
      values ($1, $2, $3)`, [event.id, input, fingerprint])
    await db.query('update public.devices set last_seen_at = clock_timestamp() where id = $1', [device.id])
    await audit(db, { company: device.company_id, actor: device.id, actorType: 'device', action: 'event.received',
      entity: 'payment_event', id: event.id, metadata: { processing_status: event.processing_status } })
    return { duplicate: false, event }
  })
}
