import type { Pool, PoolClient } from 'pg'
import type { z } from 'zod'
import { conflict, forbidden, notFound } from '../middleware/errors.js'
import { audit, branchScope, manageCompany, platformAdmin } from '../repositories/access.js'
import type { CompanyRole } from '../repositories/access.js'
import { one, transaction } from '../repositories/database.js'
import { paginated, Where } from '../repositories/pages.js'
import type { branchCreate, branchPatch, companyCreate, companyPatch, page, userCreate, userPatch } from '../schemas/contracts.js'
import type { AuthService } from './auth.js'

type Actor = { profile: string; company: string }
const admin = ['COMPANY_ADMIN'] as const
const management = ['COMPANY_ADMIN', 'MANAGER'] as const

export async function createCompany(pool: Pool, profile: string, input: z.infer<typeof companyCreate>) {
  return transaction(pool, async (db) => {
    if (!await platformAdmin(db, profile)) throw forbidden()
    if (!await one(db, "select id from public.profiles where id = $1 and status = 'active' for share", [input.admin_profile_id])) {
      throw notFound()
    }
    const company = (await db.query<{ id: string }>(`
      insert into public.companies (name, legal_name, tax_id) values ($1, $2, $3) returning *
    `, [input.name, input.legal_name, input.tax_id])).rows[0]!
    await db.query("insert into public.company_members (company_id, profile_id, role) values ($1, $2, 'COMPANY_ADMIN')",
      [company.id, input.admin_profile_id])
    await audit(db, { company: null, actor: profile, action: 'company.created', entity: 'company', id: company.id })
    await audit(db, { company: company.id, actor: profile, action: 'company.created', entity: 'company', id: company.id })
    return company
  })
}

function patchFields(input: Record<string, unknown>, values: unknown[]) {
  // Los campos vienen de esquemas estrictos y se mantienen acotados en cada ruta.
  return Object.entries(input).map(([key, value]) => `${key} = $${values.push(value)}`).join(', ')
}

export function updateCompany(pool: Pool, actor: Actor, input: z.infer<typeof companyPatch>) {
  return transaction(pool, async (db) => {
    await manageCompany(db, actor.profile, actor.company, admin)
    const values: unknown[] = [actor.company]
    const fields = patchFields(input, values)
    const result = await one(db, `update public.companies set ${fields} where id = $1 returning *`, values)
    await audit(db, { ...actor, actor: actor.profile, action: 'company.updated', entity: 'company', id: actor.company })
    return result
  })
}

export function createBranch(pool: Pool, actor: Actor, input: z.infer<typeof branchCreate>) {
  return transaction(pool, async (db) => {
    await manageCompany(db, actor.profile, actor.company, admin)
    const branch = (await db.query<{ id: string }>(`
      insert into public.branches (company_id, name, address) values ($1, $2, $3) returning *
    `, [actor.company, input.name, input.address])).rows[0]!
    await audit(db, { ...actor, actor: actor.profile, action: 'branch.created', entity: 'branch', id: branch.id })
    return branch
  })
}

export function updateBranch(pool: Pool, actor: Actor, id: string, input: z.infer<typeof branchPatch>) {
  return transaction(pool, async (db) => {
    const role = await manageCompany(db, actor.profile, actor.company, management)
    await branchScope(db, actor.profile, actor.company, id, role)
    if (input.status !== undefined && role !== 'COMPANY_ADMIN') throw forbidden()
    const values: unknown[] = [actor.company, id]
    const fields = patchFields(input, values)
    const branch = await one(db, `update public.branches set ${fields}
      where company_id = $1 and id = $2 returning *`, values)
    await audit(db, { ...actor, actor: actor.profile, action: 'branch.updated', entity: 'branch', id })
    return branch
  })
}

async function checkAssignments(db: PoolClient, company: string, role: CompanyRole, ids: string[]) {
  if (role === 'COMPANY_ADMIN' && ids.length) throw conflict('El administrador de empresa tiene alcance empresarial.')
  if (!ids.length) return
  const result = await db.query(`select id from public.branches
    where company_id = $1 and id = any($2::uuid[]) and status = 'active'`, [company, ids])
  if (result.rowCount !== ids.length) throw notFound()
}

async function assignBranches(db: PoolClient, company: string, member: string, ids: string[]) {
  await db.query('delete from public.member_branches where company_id = $1 and member_id = $2', [company, member])
  if (!ids.length) return
  await db.query(`insert into public.member_branches (company_id, member_id, branch_id)
    select $1, $2, branch_id from unnest($3::uuid[]) as branch_id`, [company, member, ids])
}

const userColumns = `m.id, m.company_id, m.profile_id, m.role, m.status, m.created_at,
  p.email, p.full_name, p.status as profile_status, array(
    select a.branch_id from public.member_branches a
    where a.company_id = m.company_id and a.member_id = m.id order by a.branch_id
  ) as branch_ids`

export function listUsers(pool: Pool, actor: Actor, options: z.infer<typeof page>) {
  return transaction(pool, async (db) => {
    // Mantiene autorizada una lectura privilegiada de perfiles hasta completar la consulta.
    await manageCompany(db, actor.profile, actor.company, admin, 'share')
    const where = new Where()
    where.equals('m.company_id', actor.company)
    return paginated(db, options, where, {
      columns: userColumns, from: 'public.company_members m join public.profiles p on p.id = m.profile_id',
      timestamp: 'm.created_at', id: 'm.id',
    })
  })
}

export function createUser(pool: Pool, auth: AuthService, actor: Actor, input: z.infer<typeof userCreate>) {
  return transaction(pool, async (db) => {
    await manageCompany(db, actor.profile, actor.company, admin)
    await checkAssignments(db, actor.company, input.role, input.branch_ids)
    // Evita invitaciones simultáneas al mismo correo desde empresas diferentes.
    await db.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [input.email])
    const existing = await db.query<{ id: string }>(
      'select id from public.profiles where email is not null and lower(email) = $1 limit 2', [input.email])
    if (existing.rows.length > 1) throw conflict('El correo corresponde a varias identidades.')
    const profile = existing.rows[0]?.id ?? await auth.invite(input.email)
    // El alta de la identidad externa puede confirmarse aunque esta transacción falle.
    // Una repetición reconoce ese perfil y completa su membresía.
    if (!existing.rows.length && input.full_name) {
      await db.query('update public.profiles set full_name = $2 where id = $1', [profile, input.full_name])
    }
    const membership = (await db.query<{ id: string }>(`
      insert into public.company_members (company_id, profile_id, role) values ($1, $2, $3) returning *
    `, [actor.company, profile, input.role])).rows[0]!
    await assignBranches(db, actor.company, membership.id, input.branch_ids)
    await audit(db, { ...actor, actor: actor.profile, action: 'membership.created', entity: 'membership', id: membership.id })
    return { ...membership, branch_ids: input.branch_ids }
  })
}

export function updateUser(pool: Pool, actor: Actor, id: string, input: z.infer<typeof userPatch>) {
  return transaction(pool, async (db) => {
    await manageCompany(db, actor.profile, actor.company, admin)
    const member = await one<{ role: CompanyRole; status: 'active' | 'inactive' }>(db,
      'select role, status from public.company_members where company_id = $1 and id = $2', [actor.company, id])
    if (!member) throw notFound()
    const role = input.role ?? member.role
    const status = input.status ?? member.status
    if (member.role === 'COMPANY_ADMIN' && member.status === 'active' && (role !== 'COMPANY_ADMIN' || status !== 'active')) {
      const remaining = await one(db, `
        select 1 from public.company_members m join public.profiles p on p.id = m.profile_id
        where m.company_id = $1 and m.id <> $2 and m.role = 'COMPANY_ADMIN'
          and m.status = 'active' and p.status = 'active'
      `, [actor.company, id])
      if (!remaining) throw conflict('La empresa debe conservar un administrador activo.')
    }
    if (input.branch_ids !== undefined) await checkAssignments(db, actor.company, role, input.branch_ids)
    if (role === 'COMPANY_ADMIN' || input.branch_ids !== undefined) {
      await assignBranches(db, actor.company, id, input.branch_ids ?? [])
    }
    const updated = await one(db, `update public.company_members set role = $3, status = $4
      where company_id = $1 and id = $2 returning *`, [actor.company, id, role, status])
    await audit(db, { ...actor, actor: actor.profile, action: 'membership.updated', entity: 'membership', id })
    return updated
  })
}
