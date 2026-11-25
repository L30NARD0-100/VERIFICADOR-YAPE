import type { PoolClient } from 'pg'
import type { z } from 'zod'
import { ApiError, notFound } from '../middleware/errors.js'
import { one } from '../repositories/database.js'
import { paginated, Where } from '../repositories/pages.js'
import type { eventList, paymentFilters, paymentList, summaryFilters } from '../schemas/contracts.js'

const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' })
export const todayInLima = () => lima.format(new Date())

type Filters = z.infer<typeof summaryFilters>

function activityScope(company: string, options: Filters, alias: string, timestamp: string, values?: unknown[]) {
  const where = new Where(values)
  where.equals(`${alias}.company_id`, company)
  where.equals(`${alias}.branch_id`, options.branch_id)
  where.equals(`${alias}.device_id`, options.device_id)
  if (options.from) where.add(`${timestamp} >= (${where.addValue(options.from)}::date::timestamp at time zone 'America/Lima')`)
  if (options.to) where.add(`${timestamp} < ((${where.addValue(options.to)}::date + 1)::timestamp at time zone 'America/Lima')`)
  return where
}

function paymentScope(company: string, options: z.infer<typeof paymentFilters>) {
  const where = activityScope(company, options, 'p', 'p.received_at')
  where.equals('p.status', options.status)
  if (options.q) {
    const escaped = options.q.replace(/[\\%_]/g, (letter) => '\\' + letter)
    where.add(`p.sender_name ilike ${where.addValue('%' + escaped + '%')}`)
  }
  return where
}

const paymentFrom = `public.payments p
  left join public.branches b on b.company_id = p.company_id and b.id = p.branch_id
  left join public.devices d on d.company_id = p.company_id and d.id = p.device_id
  left join public.payment_methods m on m.id = p.payment_method_id`
const paymentColumns = 'p.*, b.name as branch_name, d.name as device_name, m.code as payment_method'

export function listPayments(db: PoolClient, company: string, options: z.infer<typeof paymentList>) {
  return paginated(db, options, paymentScope(company, options), {
    columns: paymentColumns, from: paymentFrom, timestamp: 'p.received_at', id: 'p.id',
  })
}

export async function paymentDetails(db: PoolClient, company: string, id: string) {
  const payment = await one(db, `select ${paymentColumns} from ${paymentFrom}
    where p.company_id = $1 and p.id = $2`, [company, id])
  if (!payment) throw notFound()
  const events = await db.query(`
    select id, event_id, event_type, processing_status, captured_at, received_at, processed_at
    from public.payment_events where company_id = $1 and payment_id = $2 order by received_at desc, id desc
    limit 100
  `, [company, id])
  return { ...payment, events: events.rows }
}

export function listEvents(db: PoolClient, company: string, options: z.infer<typeof eventList>) {
  const where = activityScope(company, options, 'e', 'e.captured_at')
  where.equals('e.processing_status', options.status)
  return paginated(db, options, where, {
    columns: 'e.*', from: 'public.payment_events e', timestamp: 'e.captured_at', id: 'e.id',
  })
}

export async function summarize(db: PoolClient, company: string, options: Filters & { from: string; to: string }) {
  const events = activityScope(company, options, 'e', 'e.captured_at')
  const payments = activityScope(company, options, 'p', 'p.received_at', events.values)
  const result = await one(db, `
    select
      (select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
        from (select e.processing_status as status, count(*)::text as total
          from public.payment_events e ${events.sql()} group by e.processing_status) as statuses
      ) as events_by_status,
      (select coalesce(jsonb_agg(to_jsonb(totals) order by currency), '[]'::jsonb)
        from (select p.currency,
          count(*)::text as detected_count,
          count(*) filter (where p.status = 'verified')::text as officially_verified_count,
          coalesce(sum(p.amount), 0)::text as detected_amount,
          coalesce(sum(p.amount) filter (where p.status = 'verified'), 0)::text as officially_verified_amount
          from public.payments p ${payments.sql()}
          group by p.currency) as totals
      ) as totals_by_currency
  `, events.values)
  return { from: options.from, to: options.to, timezone: 'America/Lima', ...result }
}

function csvCell(value: unknown) {
  if (value == null) return '""'
  const content = value instanceof Date ? value.toISOString() : String(value)
  const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/u.test(content) ? "'" + content : content
  return '"' + safe.replaceAll('"', '""') + '"'
}

export async function exportPayments(db: PoolClient, company: string, filters: z.infer<typeof paymentFilters>) {
  const where = paymentScope(company, filters)
  const headers = ['id', 'sender_name', 'amount', 'currency', 'received_at', 'payment_method',
    'device_name', 'branch_name', 'status'] as const
  const csvColumns = 'p.id, p.sender_name, p.amount, p.currency, p.received_at, m.code as payment_method, ' +
    'd.name as device_name, b.name as branch_name, p.status'
  const result = await db.query(`
    select ${csvColumns} from ${paymentFrom} ${where.sql()}
    order by p.received_at desc, p.id desc limit 10001
  `, where.values)
  if (result.rows.length > 10000) {
    throw new ApiError(422, 'export_limit', 'La exportación supera 10 000 filas. Acota el rango.')
  }
  return [headers.join(','), ...result.rows.map((row) => headers.map((column) => csvCell(row[column])).join(','))]
    .join('\r\n') + '\r\n'
}
