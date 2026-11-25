import { z } from 'zod'
import { ApiError } from '../middleware/errors.js'

export const uuid = z.uuid().transform((value) => value.toLowerCase())
const text = (max: number) => z.string().trim().min(1).max(max)
const status = z.enum(['active', 'inactive'])
const role = z.enum(['COMPANY_ADMIN', 'MANAGER', 'CASHIER'])
export const companyInput = z.strictObject({
  name: text(160), legal_name: text(240).nullable().optional(),
  tax_id: z.string().regex(/^\d{11}$/).nullable().optional(),
})
export const companyCreate = companyInput.extend({ admin_profile_id: uuid })
export const companyPatch = companyInput.partial().refine((value) => Object.keys(value).length > 0)
export const branchCreate = z.strictObject({ name: text(160), address: text(300).nullable().optional() })
export const branchPatch = branchCreate.extend({ status }).partial().refine((value) => Object.keys(value).length > 0)
export const deviceCreate = z.strictObject({
  name: text(160), branch_id: uuid, device_identifier: text(160),
})
export const deviceRevoke = z.strictObject({ device_id: uuid })
export const deviceRegister = z.strictObject({
  pairing_code: z.string().regex(/^[A-Za-z0-9_-]{22}$/), app_version: text(40).optional(),
})
export const heartbeat = z.strictObject({ app_version: text(40).optional() })
const currency = z.string().regex(/^[A-Z]{3}$/)
const decimal = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0)
  .transform((value) => {
    const [units, cents] = value.split('.')
    return units + '.' + (cents ?? '').padEnd(2, '0')
  })
export const notification = z.strictObject({
  event_id: uuid,
  device_id: uuid,
  event_type: z.literal('payment_notice'),
  sender_name: text(160).nullable().default(null),
  amount: decimal.nullable().default(null),
  currency: currency.nullable().default(null),
  received_at: z.iso.datetime({ offset: true }).refine((value) => !value.startsWith('0000') && Number.isFinite(Date.parse(value)))
    .transform((value) => new Date(value).toISOString())
    .refine((value) => /^[0-9]{4}-/.test(value) && !value.startsWith('0000')),
  source_notification_id: text(240).nullable().default(null),
  metadata: z.strictObject({
    source_application: z.string().max(200).regex(/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/).optional(),
  }).default({}),
})
const branches = z.array(uuid).max(100).refine((ids) => ids.length === new Set(ids).size)
export const userCreate = z.strictObject({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  full_name: text(160).optional(),
  role,
  branch_ids: branches.default([]),
})
export const userPatch = z.strictObject({
  role: role.optional(), status: status.optional(), branch_ids: branches.optional(),
}).refine((value) => Object.keys(value).length > 0)
const limit = z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().max(100))
export const page = z.strictObject({ limit: limit.default(30), cursor: text(300).optional() })
export const branchQuery = page.extend({ branch_id: uuid.optional() })
const date = z.iso.date().refine((value) => !value.startsWith('0000'))
const filters = {
  branch_id: uuid.optional(),
  device_id: uuid.optional(),
  from: date.optional(),
  to: date.optional(),
}
export const paymentFilters = z.strictObject({
  ...filters, q: text(120).optional(), status: z.enum(['pending_verification', 'verified']).optional(),
})
export const paymentList = paymentFilters.extend({
  ...page.shape, order: z.enum(['asc', 'desc']).default('desc'),
})
export const eventList = page.extend({
  ...filters, status: z.enum(['received', 'processed', 'needs_review', 'rejected', 'processing_error']).optional(),
})
export const dailyFilters = z.strictObject({
  branch_id: uuid.optional(), device_id: uuid.optional(), date: date.optional(),
})
export const summaryFilters = z.strictObject(filters)
export const cursorValue = z.tuple([z.iso.datetime().refine((value) => !value.startsWith('0000')), z.uuid()])

export function validateDates<T extends { from?: string; to?: string }>(input: T, required = false) {
  const { from, to } = input
  if (required && (!from || !to)) {
    throw new ApiError(400, 'date_range_required', 'Indica las fechas from y to.')
  }
  if (from && to) {
    const span = (Date.parse(to) - Date.parse(from)) / 86_400_000
    if (!Number.isFinite(span) || span < 0 || span > 365) {
      throw new ApiError(400, 'invalid_date_range', 'El rango debe abarcar hasta 366 fechas en orden ascendente.')
    }
  }
  return input
}
