import type { PoolClient } from 'pg'
import { forbidden, notFound } from '../middleware/errors.js'
import { one } from './database.js'

export type CompanyRole = 'COMPANY_ADMIN' | 'MANAGER' | 'CASHIER'

export async function companyRole(db: PoolClient, profile: string, company: string) {
  return (await one<{ role: CompanyRole }>(db, `
    select m.role from public.company_members m
    join public.companies c on c.id = m.company_id and c.status = 'active'
    join public.profiles p on p.id = m.profile_id and p.status = 'active'
    where m.company_id = $1 and m.profile_id = $2 and m.status = 'active'
  `, [company, profile]))?.role
}

export async function platformAdmin(db: PoolClient, profile: string) {
  return Boolean(await one(db, `
    select 1 from app_private.platform_admins a
    join public.profiles p on p.id = a.profile_id and p.status = 'active' where p.id = $1
  `, [profile]))
}

export async function branchScope(
  db: PoolClient, profile: string, company: string, branch: string, role: CompanyRole,
) {
  const visible = await one(db, `
    select 1 from public.branches b where b.company_id = $1 and b.id = $2
      and ($4 = 'COMPANY_ADMIN' or (b.status = 'active' and exists (
        select 1 from public.company_members m join public.member_branches a
          on a.company_id = m.company_id and a.member_id = m.id
        where m.company_id = b.company_id and a.branch_id = b.id and m.profile_id = $3
          and m.status = 'active'
      )))
  `, [company, branch, profile, role])
  if (!visible) throw notFound()
}

export async function manageCompany<Role extends CompanyRole>(
  db: PoolClient, profile: string, company: string, roles: readonly Role[], lock: 'update' | 'share' = 'update',
) {
  await db.query(`select id from public.companies where id = $1 for ${lock}`, [company])
  const role = await companyRole(db, profile, company)
  if (!role) throw notFound()
  const authorizedRole = roles.find((candidate) => candidate === role)
  if (!authorizedRole) throw forbidden()
  return authorizedRole
}

export function audit(
  db: PoolClient, record: {
    company: string | null; actor: string; actorType?: 'user' | 'device';
    action: string; entity: string; id: string; metadata?: Record<string, unknown>;
  },
) {
  const device = record.actorType === 'device'
  return db.query(`
    insert into public.audit_logs (company_id, user_id, device_id, actor_type, action, entity_type, entity_id, metadata)
    values ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [record.company, device ? null : record.actor, device ? record.actor : null,
    device ? 'device' : 'user', record.action, record.entity, record.id, record.metadata ?? {}])
}
