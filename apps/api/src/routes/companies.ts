import type { PoolClient } from 'pg'
import { forbidden, notFound } from '../middleware/errors.js'
import { companyRole, platformAdmin } from '../repositories/access.js'
import type { CompanyRole } from '../repositories/access.js'
import { asUser, consumeRate, one, transaction } from '../repositories/database.js'
import { paginated, Where } from '../repositories/pages.js'
import {
  branchCreate, branchPatch, branchQuery, companyCreate, companyPatch, dailyFilters, deviceCreate,
  eventList, page, paymentFilters, paymentList, summaryFilters, userCreate, userPatch, uuid, validateDates,
} from '../schemas/contracts.js'
import { createBranch, createCompany, createUser, listUsers, updateBranch, updateCompany, updateUser } from '../services/administration.js'
import { bearer } from '../services/auth.js'
import { createDevice, issuePairing, revokeDevice } from '../services/devices.js'
import { exportPayments, listEvents, listPayments, paymentDetails, summarize, todayInLima } from '../services/payments.js'
import { body, query } from './request.js'
import type { ApiContext, Dependencies, Router } from './request.js'

function actor(context: ApiContext) {
  return { profile: context.get('profile'), company: uuid.parse(context.req.param('companyId')) }
}
const id = (context: ApiContext) => uuid.parse(context.req.param('id'))

export function companyRoutes(router: Router, { auth, pool }: Dependencies) {
  router.use('/me', authenticate)
  router.use('/companies/*', authenticate)

  async function authenticate(context: ApiContext, next: () => Promise<void>) {
    const profile = await auth.authenticate(bearer(context.req.header('Authorization')))
    context.set('profile', uuid.parse(profile))
    await next()
  }

  function companyRead<T>(context: ApiContext, work: (db: PoolClient, company: string, role: CompanyRole) => Promise<T>) {
    const { profile, company } = actor(context)
    return asUser(pool, profile, async (db) => {
      const role = await companyRole(db, profile, company)
      if (!role) throw notFound()
      return work(db, company, role)
    })
  }

  router.get('/me', async (context) => {
    const profileId = context.get('profile')
    const isPlatformAdmin = await transaction(pool, (db) => platformAdmin(db, profileId))
    return context.json(await asUser(pool, profileId, async (db) => {
      const profile = await one(db, 'select * from public.profiles where id = $1', [profileId])
      if (!profile) throw notFound()
      const memberships = await db.query('select * from public.company_members where profile_id = $1', [profileId])
      return { profile, is_platform_admin: isPlatformAdmin, memberships: memberships.rows }
    }))
  })

  router.get('/companies', async (context) => {
    const options = query(context, page)
    return context.json(await asUser(pool, context.get('profile'), (db) =>
      paginated(db, options, new Where(), { columns: '*', from: 'public.companies', timestamp: 'created_at', id: 'id' })))
  })
  router.post('/companies', async (context) => {
    const input = await body(context, companyCreate)
    return context.json(await createCompany(pool, context.get('profile'), input), 201)
  })
  router.get('/companies/:companyId', async (context) => {
    const { profile, company } = actor(context)
    const row = await asUser(pool, profile, (db) => one(db, 'select * from public.companies where id = $1', [company]))
    if (!row) throw notFound()
    return context.json(row)
  })
  router.patch('/companies/:companyId', async (context) =>
    context.json(await updateCompany(pool, actor(context), await body(context, companyPatch))))

  router.get('/companies/:companyId/branches', async (context) => {
    const options = query(context, page)
    return context.json(await companyRead(context, (db, company) => {
      const where = new Where()
      where.equals('company_id', company)
      return paginated(db, options, where, { columns: '*', from: 'public.branches', timestamp: 'created_at', id: 'id' })
    }))
  })
  router.post('/companies/:companyId/branches', async (context) =>
    context.json(await createBranch(pool, actor(context), await body(context, branchCreate)), 201))
  router.patch('/companies/:companyId/branches/:id', async (context) =>
    context.json(await updateBranch(pool, actor(context), id(context), await body(context, branchPatch))))

  router.get('/companies/:companyId/users', async (context) =>
    context.json(await listUsers(pool, actor(context), query(context, page))))
  router.post('/companies/:companyId/users', async (context) => {
    const identity = actor(context)
    await consumeRate(pool, 'users:' + identity.profile, 20)
    return context.json(await createUser(pool, auth, identity, await body(context, userCreate)), 201)
  })
  router.patch('/companies/:companyId/users/:id', async (context) =>
    context.json(await updateUser(pool, actor(context), id(context), await body(context, userPatch))))

  router.get('/companies/:companyId/devices', async (context) => {
    const options = query(context, branchQuery)
    return context.json(await companyRead(context, (db, company) => {
      const where = new Where()
      where.equals('company_id', company)
      where.equals('branch_id', options.branch_id)
      return paginated(db, options, where, { columns: '*', from: 'public.devices', timestamp: 'created_at', id: 'id' })
    }))
  })
  router.get('/companies/:companyId/devices/:id', async (context) => {
    const key = id(context)
    const row = await companyRead(context, (db, company) =>
      one(db, 'select * from public.devices where company_id = $1 and id = $2', [company, key]))
    if (!row) throw notFound()
    return context.json(row)
  })
  router.post('/companies/:companyId/devices', async (context) =>
    context.json(await createDevice(pool, actor(context), await body(context, deviceCreate)), 201))
  router.post('/companies/:companyId/devices/:id/pairing', async (context) =>
    context.json(await issuePairing(pool, actor(context), id(context)), 201))
  router.post('/companies/:companyId/devices/:id/revoke', async (context) => {
    await revokeDevice(pool, actor(context), id(context))
    return context.body(null, 204)
  })

  router.get('/companies/:companyId/payments', async (context) => {
    const options = validateDates(query(context, paymentList))
    return context.json(await companyRead(context, (db, company) => listPayments(db, company, options)))
  })
  router.get('/companies/:companyId/payments/:id', async (context) => {
    const key = id(context)
    return context.json(await companyRead(context, (db, company) => paymentDetails(db, company, key)))
  })
  router.get('/companies/:companyId/payment-events', async (context) => {
    const options = validateDates(query(context, eventList))
    return context.json(await companyRead(context, (db, company) => listEvents(db, company, options)))
  })
  router.get('/companies/:companyId/reports/daily', async (context) => {
    const { date = todayInLima(), ...filters } = query(context, dailyFilters)
    return context.json(await companyRead(context, (db, company) =>
      summarize(db, company, { ...filters, from: date, to: date, includeAllTime: true })))
  })
  router.get('/companies/:companyId/reports/summary', async (context) => {
    const filters = query(context, summaryFilters)
    const date = todayInLima()
    const range = filters.from === undefined && filters.to === undefined
      ? { ...filters, from: date, to: date } : validateDates(filters, true)
    return context.json(await companyRead(context, (db, company) =>
      summarize(db, company, { ...range, from: range.from!, to: range.to! })))
  })
  router.get('/companies/:companyId/reports/export.csv', async (context) => {
    const filters = validateDates(query(context, paymentFilters), true)
    const csv = await companyRead(context, (db, company, role) => {
      if (role === 'CASHIER') throw forbidden()
      return exportPayments(db, company, filters)
    })
    return context.body(csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="yape-monitor-pagos.csv"',
    })
  })
  router.get('/companies/:companyId/audit-logs', async (context) => {
    const options = query(context, page)
    return context.json(await companyRead(context, (db, company, role) => {
      if (role !== 'COMPANY_ADMIN') throw forbidden()
      const where = new Where()
      where.equals('company_id', company)
      return paginated(db, options, where, { columns: '*', from: 'public.audit_logs', timestamp: 'created_at', id: 'id' })
    }))
  })
}
